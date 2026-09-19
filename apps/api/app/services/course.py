import secrets
import string
from datetime import UTC, datetime
from uuid import UUID

from database.models.course import Course, CourseMember, CourseStatus
from database.models.notification import NotificationSeverity, NotificationType
from database.models.user import User, UserRole
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.course import (
    CourseCreate,
    CourseJoinRequest,
    CourseMemberResponse,
    CourseUpdate,
)
from app.services.notifications import create_notification

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


class CourseMemberListForbiddenError(Exception):
    pass


class CourseUpdateForbiddenError(Exception):
    pass


class CourseArchiveForbiddenError(Exception):
    pass


class CourseLifecycleConflictError(Exception):
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
        course_type=payload.course_type,
        target_audience=payload.target_audience,
        expected_student_count=payload.expected_student_count,
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


async def update_course(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
    payload: CourseUpdate,
) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
            CourseMember.role == UserRole.TEACHER,
        )
    )
    if membership is None:
        raise CourseUpdateForbiddenError

    for field in (
        "name",
        "description",
        "term",
        "course_type",
        "target_audience",
        "expected_student_count",
    ):
        if field in payload.model_fields_set:
            setattr(course, field, getattr(payload, field))
    await session.commit()
    await session.refresh(course)
    return course


async def archive_course(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
            CourseMember.role == UserRole.TEACHER,
        )
    )
    if membership is None:
        raise CourseArchiveForbiddenError
    if course.status != CourseStatus.ARCHIVED:
        course.status = CourseStatus.ARCHIVED
        course.archived_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(course)
    return course


async def restore_course(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> Course:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
            CourseMember.role == UserRole.TEACHER,
        )
    )
    if membership is None:
        raise CourseArchiveForbiddenError
    if course.status != CourseStatus.ARCHIVED:
        raise CourseLifecycleConflictError("Only archived courses can be restored")
    course.status = CourseStatus.DRAFT
    course.archived_at = None
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
    teacher_ids = list(
        await session.scalars(
            select(CourseMember.user_id).where(
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.TEACHER,
            )
        )
    )
    for teacher_id in teacher_ids:
        await create_notification(
            session,
            user_id=teacher_id,
            actor_id=user_id,
            course_id=course_id,
            type=NotificationType.COURSE_MEMBER_CHANGE,
            severity=NotificationSeverity.INFO,
            title="有新学生加入课程",
            body=f"{user.display_name} 已加入课程 {course.name}。",
            action_url=f"/courses/{course.id}/students",
            payload_json={"student_id": str(user.id), "course_id": str(course.id)},
            dedupe_key=f"course-member-joined:{course.id}:{user.id}",
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
    requester_membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if requester_membership is None or requester_membership.role != UserRole.TEACHER:
        raise CourseMemberListForbiddenError

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
            avatar_url=user.avatar_url,
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

    if course.status == CourseStatus.ARCHIVED:
        raise CourseLifecycleConflictError("Archived courses cannot be published")
    if course.status != CourseStatus.PUBLISHED:
        course.status = CourseStatus.PUBLISHED
        await session.commit()
        await session.refresh(course)
    return course
