import base64
import binascii
from uuid import UUID

from database.models.course import CourseMember
from database.models.knowledge import KnowledgePoint
from database.models.user import UserRole
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.learning import LearningEventForbiddenError, ensure_course_teacher


class TeacherContentForbiddenError(Exception):
    pass


class TeacherContentNotFoundError(Exception):
    pass


class TeacherContentConflictError(Exception):
    pass


async def ensure_teacher(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> None:
    try:
        await ensure_course_teacher(session, course_id, user_id)
    except LearningEventForbiddenError as exc:
        raise TeacherContentForbiddenError from exc


def encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode("ascii")).decode("ascii")


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")))
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return 0


async def load_course_knowledge_points(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_ids: list[UUID],
) -> list[KnowledgePoint]:
    if not knowledge_point_ids:
        return []
    points = list(
        await session.scalars(
            select(KnowledgePoint).where(
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.id.in_(knowledge_point_ids),
            )
        )
    )
    if len(points) != len(set(knowledge_point_ids)):
        raise TeacherContentNotFoundError
    return points


async def ensure_student_member(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
) -> None:
    membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == student_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    if membership is None:
        raise TeacherContentNotFoundError
