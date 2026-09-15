import secrets
import string
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseMember, CourseStatus
from app.models.user import User, UserRole
from app.schemas.course import CourseCreate, CourseJoinRequest, CourseMemberResponse

COURSE_CODE_LENGTH = 8
COURSE_CODE_ALPHABET = string.ascii_uppercase + string.digits


class TeacherRoleRequiredError(Exception):
    pass


class StudentRoleRequiredError(Exception):
    pass


class CoursePublishForbiddenError(Exception):
    pass


class CourseNotPublishedError(Exception):
    pass


class CourseNotFoundError(Exception):
    pass


class CourseMembershipRequiredError(Exception):
    pass


def generate_course_code() -> str:
    return "".join(secrets.choice(COURSE_CODE_ALPHABET) for _ in range(COURSE_CODE_LENGTH))


async def _generate_unique_course_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = generate_course_code()
        existing = await session.scalar(select(Course.id).where(Course.code == code))
        if existing is None:
            return code
    raise RuntimeError("unable to generate a unique course code")


async def create_course(session: AsyncSession, creator: User, payload: CourseCreate) -> Course:
    if creator.role != UserRole.TEACHER:
        raise TeacherRoleRequiredError

    course = Course(
        name=payload.name,
        description=payload.description,
        term=payload.term,
        code=await _generate_unique_course_code(session),
        created_by=creator.id,
    )
    session.add(course)
    await session.flush()

    session.add(
        CourseMember(
            course_id=course.id,
            user_id=creator.id,
            role=UserRole.TEACHER,
        )
    )
    await session.commit()
    await session.refresh(course)
    return course


async def list_courses_for_user(session: AsyncSession, user_id: UUID) -> list[Course]:
    result = await session.scalars(
        select(Course)
        .join(CourseMember, CourseMember.course_id == Course.id)
        .where(CourseMember.user_id == user_id)
        .order_by(Course.created_at.desc(), Course.id.desc())
    )
    return list(result)


async def join_course_by_code(
    session: AsyncSession,
    user: User,
    payload: CourseJoinRequest,
) -> Course:
    if user.role != UserRole.STUDENT:
        raise StudentRoleRequiredError

    user_id = user.id

    course = await session.scalar(select(Course).where(Course.code == payload.code))
    if course is None:
        raise CourseNotFoundError

    if course.status != CourseStatus.PUBLISHED:
        raise CourseNotPublishedError

    course_id = course.id

    existing_membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if existing_membership is not None:
        return course

    session.add(
        CourseMember(
            course_id=course_id,
            user_id=user_id,
            role=UserRole.STUDENT,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing_membership = await session.scalar(
            select(CourseMember.id).where(
                CourseMember.course_id == course_id,
                CourseMember.user_id == user_id,
            )
        )
        if existing_membership is None:
            raise
        course = await session.get(Course, course_id)
        if course is None:
            raise CourseNotFoundError from None
    return course


async def get_course_for_member(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError

    membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if membership is None:
        raise CourseMembershipRequiredError
    return course


async def list_course_members(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> list[CourseMemberResponse]:
    await get_course_for_member(session, course_id, requester_id)

    rows = await session.execute(
        select(CourseMember, User)
        .join(User, User.id == CourseMember.user_id)
        .where(CourseMember.course_id == course_id)
        .order_by(CourseMember.joined_at.asc(), CourseMember.id.asc())
    )
    return [
        CourseMemberResponse(
            id=membership.id,
            course_id=membership.course_id,
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=membership.role,
            joined_at=membership.joined_at,
        )
        for membership, user in rows.all()
    ]


async def publish_course(session: AsyncSession, course_id: UUID, user_id: UUID) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise CoursePublishForbiddenError

    if course.status != CourseStatus.PUBLISHED:
        course.status = CourseStatus.PUBLISHED
        await session.commit()
        await session.refresh(course)
    return course
