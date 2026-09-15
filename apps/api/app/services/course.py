import secrets
import string
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseMember
from app.models.user import User, UserRole
from app.schemas.course import CourseCreate

COURSE_CODE_LENGTH = 8
COURSE_CODE_ALPHABET = string.ascii_uppercase + string.digits


class TeacherRoleRequiredError(Exception):
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
