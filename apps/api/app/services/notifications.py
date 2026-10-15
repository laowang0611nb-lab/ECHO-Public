from __future__ import annotations

import base64
import binascii
import json
from datetime import UTC, datetime
from urllib.parse import urlencode
from uuid import UUID

from database.models.notification import (
    Notification,
    NotificationSeverity,
    NotificationType,
)
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


def review_notification_action_url(course_id: UUID, flag_id: UUID) -> str:
    query = urlencode({"reviewId": str(flag_id), "courseId": str(course_id)})
    return f"/ai-review/pending?{query}"


def course_students_notification_action_url(course_id: UUID) -> str:
    return f"/courses/{course_id}?tab=students"


class NotificationNotFoundError(Exception):
    pass


class InvalidNotificationCursorError(Exception):
    pass


def encode_notification_cursor(notification: Notification) -> str:
    payload = {
        "created_at": notification.created_at.isoformat(),
        "id": str(notification.id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_notification_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        created_at = datetime.fromisoformat(payload["created_at"])
        notification_id = UUID(payload["id"])
    except (KeyError, TypeError, ValueError, binascii.Error, json.JSONDecodeError) as exc:
        raise InvalidNotificationCursorError from exc
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return created_at, notification_id


async def list_notifications(
    session: AsyncSession,
    user_id: UUID,
    *,
    unread: bool,
    cursor: str | None,
    limit: int,
) -> tuple[list[Notification], int, str | None, int]:
    filters = [Notification.user_id == user_id]
    if unread:
        filters.append(Notification.read_at.is_(None))
    if cursor:
        created_at, notification_id = decode_notification_cursor(cursor)
        filters.append(
            or_(
                Notification.created_at < created_at,
                and_(
                    Notification.created_at == created_at,
                    Notification.id < notification_id,
                ),
            )
        )

    rows = list(
        await session.scalars(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit + 1)
        )
    )
    next_cursor = None
    if len(rows) > limit:
        next_cursor = encode_notification_cursor(rows[limit - 1])
        rows = rows[:limit]

    total_filters = [Notification.user_id == user_id]
    if unread:
        total_filters.append(Notification.read_at.is_(None))
    total = int(
        await session.scalar(select(func.count()).select_from(Notification).where(*total_filters))
        or 0
    )
    unread_count = await count_unread_notifications(session, user_id)
    return rows, total, next_cursor, unread_count


async def count_unread_notifications(
    session: AsyncSession,
    user_id: UUID,
) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )


async def mark_notification_read(
    session: AsyncSession,
    user_id: UUID,
    notification_id: UUID,
) -> Notification:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    if notification is None:
        raise NotificationNotFoundError
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(notification)
    return notification


async def mark_all_notifications_read(
    session: AsyncSession,
    user_id: UUID,
) -> int:
    result = await session.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return max(0, result.rowcount or 0)


async def _find_notification_by_dedupe_key(
    session: AsyncSession,
    user_id: UUID,
    dedupe_key: str,
) -> Notification | None:
    return await session.scalar(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )


async def create_notification(
    session: AsyncSession,
    *,
    user_id: UUID,
    type: NotificationType,
    severity: NotificationSeverity,
    title: str,
    body: str,
    action_url: str | None = None,
    payload_json: dict[str, object] | None = None,
    course_id: UUID | None = None,
    actor_id: UUID | None = None,
    dedupe_key: str | None = None,
    created_at: datetime | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        course_id=course_id,
        type=type,
        severity=severity,
        title=title,
        body=body,
        action_url=action_url,
        payload_json=payload_json or {},
        dedupe_key=dedupe_key,
        created_at=created_at or datetime.now(UTC),
    )
    if dedupe_key is None:
        session.add(notification)
        await session.flush()
        return notification

    existing = await _find_notification_by_dedupe_key(session, user_id, dedupe_key)
    if existing is not None:
        return existing
    try:
        async with session.begin_nested():
            session.add(notification)
            await session.flush()
    except IntegrityError:
        existing = await _find_notification_by_dedupe_key(session, user_id, dedupe_key)
        if existing is None:
            raise
        return existing
    return notification
