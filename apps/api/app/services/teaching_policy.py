from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import TeachingPolicy
from app.models.course import CourseMember
from app.models.user import User, UserRole
from app.services.course import get_course_for_member


class TeachingPolicyForbiddenError(Exception):
    pass


async def get_teaching_policy(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> TeachingPolicy | None:
    await get_course_for_member(session, course_id, requester_id)
    return await session.scalar(select(TeachingPolicy).where(TeachingPolicy.course_id == course_id))


async def upsert_teaching_policy(
    session: AsyncSession,
    course_id: UUID,
    updater: User,
    content: str,
) -> TeachingPolicy:
    await get_course_for_member(session, course_id, updater.id)
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == updater.id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise TeachingPolicyForbiddenError

    policy = await session.scalar(
        select(TeachingPolicy).where(TeachingPolicy.course_id == course_id)
    )
    if policy is None:
        policy = TeachingPolicy(
            course_id=course_id,
            content=content,
            updated_by=updater.id,
        )
        session.add(policy)
    else:
        policy.content = content
        policy.updated_by = updater.id

    await session.commit()
    await session.refresh(policy)
    return policy
