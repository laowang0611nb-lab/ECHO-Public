import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from database.auth.tokens import (
    create_knowledge_graph_embed_token,
    hash_knowledge_graph_embed_ticket,
)
from database.models.auth import KnowledgeGraphEmbedSession
from database.models.course import Course, CourseMember, CourseStatus
from database.models.user import User, UserRole, UserStatus
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS = 300


class KnowledgeGraphEmbedCourseNotFoundError(Exception):
    pass


class KnowledgeGraphEmbedForbiddenError(Exception):
    pass


class KnowledgeGraphEmbedTicketInvalidError(Exception):
    pass


@dataclass(frozen=True)
class KnowledgeGraphEmbedTokenData:
    access_token: str
    course_id: UUID
    expires_in_seconds: int


async def create_knowledge_graph_embed_session(
    session: AsyncSession,
    course_id: UUID,
    user: User,
) -> tuple[str, int]:
    course = await session.get(Course, course_id)
    if course is None:
        raise KnowledgeGraphEmbedCourseNotFoundError
    if course.status == CourseStatus.ARCHIVED:
        raise KnowledgeGraphEmbedForbiddenError
    await _ensure_active_student_member(session, course_id, user.id)

    ticket = secrets.token_urlsafe(32)
    session.add(
        KnowledgeGraphEmbedSession(
            ticket_hash=hash_knowledge_graph_embed_ticket(ticket),
            user_id=user.id,
            course_id=course_id,
            expires_at=datetime.now(UTC) + timedelta(seconds=KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS),
        )
    )
    await session.commit()
    return ticket, KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS


async def exchange_knowledge_graph_embed_session(
    session: AsyncSession,
    ticket: str,
    course_id: UUID,
) -> KnowledgeGraphEmbedTokenData:
    ticket_hash = hash_knowledge_graph_embed_ticket(ticket)
    now = datetime.now(UTC)
    embed_session = await session.scalar(
        select(KnowledgeGraphEmbedSession).where(
            KnowledgeGraphEmbedSession.ticket_hash == ticket_hash,
            KnowledgeGraphEmbedSession.course_id == course_id,
        )
    )
    if (
        embed_session is None
        or embed_session.consumed_at is not None
        or _as_utc(embed_session.expires_at) <= now
    ):
        raise KnowledgeGraphEmbedTicketInvalidError

    course = await session.get(Course, course_id)
    if course is None:
        raise KnowledgeGraphEmbedCourseNotFoundError
    if course.status == CourseStatus.ARCHIVED:
        raise KnowledgeGraphEmbedForbiddenError
    await _ensure_active_student_member(session, course_id, embed_session.user_id)

    result = await session.execute(
        update(KnowledgeGraphEmbedSession)
        .where(
            KnowledgeGraphEmbedSession.id == embed_session.id,
            KnowledgeGraphEmbedSession.consumed_at.is_(None),
            KnowledgeGraphEmbedSession.expires_at > now,
        )
        .values(consumed_at=now)
        .execution_options(synchronize_session=False)
    )
    if (result.rowcount or 0) != 1:
        raise KnowledgeGraphEmbedTicketInvalidError

    access_token = create_knowledge_graph_embed_token(
        embed_session.user_id,
        course_id,
        embed_session.id,
        expires_delta=timedelta(seconds=KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS),
    )
    await session.commit()
    return KnowledgeGraphEmbedTokenData(
        access_token=access_token,
        course_id=course_id,
        expires_in_seconds=KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS,
    )


async def _ensure_active_student_member(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> None:
    user = await session.get(User, user_id)
    if user is None or user.status != UserStatus.ACTIVE or user.role != UserRole.STUDENT:
        raise KnowledgeGraphEmbedForbiddenError

    membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    if membership is None:
        raise KnowledgeGraphEmbedForbiddenError


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
