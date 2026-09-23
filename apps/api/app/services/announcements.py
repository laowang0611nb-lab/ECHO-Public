from datetime import UTC, datetime
from uuid import UUID

from database.models.announcement import CourseAnnouncement, CourseAnnouncementRead
from database.models.course import CourseMember
from database.models.user import UserRole
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.announcement import (
    AnnouncementCreateRequest,
    AnnouncementPage,
    AnnouncementReadResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
)
from app.services.course import get_course_for_member
from app.services.teacher_access import decode_cursor, encode_cursor


class AnnouncementForbiddenError(Exception):
    pass


class AnnouncementNotFoundError(Exception):
    pass


async def _teacher_membership(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> CourseMember | None:
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        return None
    return membership


async def create_course_announcement(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: AnnouncementCreateRequest,
) -> AnnouncementResponse:
    await get_course_for_member(session, course_id, requester_id)
    if await _teacher_membership(session, course_id, requester_id) is None:
        raise AnnouncementForbiddenError
    announcement = CourseAnnouncement(
        course_id=course_id,
        title=payload.title,
        content=payload.content,
        published_at=datetime.now(UTC) if payload.publish else None,
        created_by=requester_id,
    )
    session.add(announcement)
    await session.commit()
    await session.refresh(announcement)
    return _announcement_response(announcement, is_read=False, read_at=None)


async def update_course_announcement(
    session: AsyncSession,
    course_id: UUID,
    announcement_id: UUID,
    requester_id: UUID,
    payload: AnnouncementUpdateRequest,
) -> AnnouncementResponse:
    await get_course_for_member(session, course_id, requester_id)
    if await _teacher_membership(session, course_id, requester_id) is None:
        raise AnnouncementForbiddenError
    announcement = await session.scalar(
        select(CourseAnnouncement).where(
            CourseAnnouncement.id == announcement_id,
            CourseAnnouncement.course_id == course_id,
        )
    )
    if announcement is None:
        raise AnnouncementNotFoundError
    if "title" in payload.model_fields_set and payload.title is not None:
        announcement.title = payload.title
    if "content" in payload.model_fields_set and payload.content is not None:
        announcement.content = payload.content
    if "publish" in payload.model_fields_set and payload.publish is not None:
        if payload.publish and announcement.published_at is None:
            announcement.published_at = datetime.now(UTC)
        elif not payload.publish:
            announcement.published_at = None
    await session.commit()
    await session.refresh(announcement)
    return _announcement_response(announcement, is_read=False, read_at=None)


async def list_course_announcements(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    include_drafts: bool,
    cursor: str | None,
    limit: int,
) -> AnnouncementPage:
    await get_course_for_member(session, course_id, requester_id)
    is_teacher = await _teacher_membership(session, course_id, requester_id) is not None
    filters = [CourseAnnouncement.course_id == course_id]
    if not (include_drafts and is_teacher):
        filters.append(CourseAnnouncement.published_at.is_not(None))
    total = int(
        await session.scalar(select(func.count()).select_from(CourseAnnouncement).where(*filters))
        or 0
    )
    offset = decode_cursor(cursor)
    rows = (
        await session.execute(
            select(CourseAnnouncement, CourseAnnouncementRead)
            .outerjoin(
                CourseAnnouncementRead,
                (CourseAnnouncementRead.announcement_id == CourseAnnouncement.id)
                & (CourseAnnouncementRead.user_id == requester_id),
            )
            .where(*filters)
            .order_by(
                CourseAnnouncement.published_at.desc().nullslast(),
                CourseAnnouncement.created_at.desc(),
                CourseAnnouncement.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()
    items = [
        _announcement_response(
            announcement,
            is_read=read is not None,
            read_at=read.read_at if read else None,
        )
        for announcement, read in rows
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return AnnouncementPage(items=items, total=total, next_cursor=next_cursor)


async def mark_announcement_read(
    session: AsyncSession,
    course_id: UUID,
    announcement_id: UUID,
    requester_id: UUID,
) -> AnnouncementReadResponse:
    await get_course_for_member(session, course_id, requester_id)
    announcement = await session.scalar(
        select(CourseAnnouncement).where(
            CourseAnnouncement.id == announcement_id,
            CourseAnnouncement.course_id == course_id,
            CourseAnnouncement.published_at.is_not(None),
        )
    )
    if announcement is None:
        raise AnnouncementNotFoundError
    marker = await session.get(
        CourseAnnouncementRead,
        (announcement_id, requester_id),
    )
    if marker is None:
        marker = CourseAnnouncementRead(
            announcement_id=announcement_id,
            user_id=requester_id,
            read_at=datetime.now(UTC),
        )
        session.add(marker)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            marker = await session.get(
                CourseAnnouncementRead,
                (announcement_id, requester_id),
            )
            if marker is None:
                raise
    return AnnouncementReadResponse(
        announcement_id=announcement_id,
        read_at=marker.read_at,
    )


def _announcement_response(
    announcement: CourseAnnouncement,
    *,
    is_read: bool,
    read_at: datetime | None,
) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=announcement.id,
        course_id=announcement.course_id,
        title=announcement.title,
        content=announcement.content,
        published_at=announcement.published_at,
        created_by=announcement.created_by,
        created_at=announcement.created_at,
        updated_at=announcement.updated_at,
        is_read=is_read,
        read_at=read_at,
    )
