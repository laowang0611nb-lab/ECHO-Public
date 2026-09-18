from uuid import UUID

from database.models.course import Course
from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.course import (
    CourseCreate,
    CourseJoinRequest,
    CourseMemberResponse,
    CourseResponse,
    CourseUpdate,
)
from app.services.course import (
    CourseArchiveForbiddenError,
    CourseLifecycleConflictError,
    CourseMemberListForbiddenError,
    CourseMembershipRequiredError,
    CourseNotFoundError,
    CourseNotPublishedError,
    CoursePublishForbiddenError,
    CourseUpdateForbiddenError,
    StudentRoleRequiredError,
    TeacherRoleRequiredError,
    archive_course,
    create_course,
    get_course_for_member,
    join_course_by_code,
    list_course_members,
    list_courses_for_user,
    publish_course,
    restore_course,
    update_course,
)

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_new_course(
    payload: CourseCreate,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await create_course(session, current_user, payload)
    except TeacherRoleRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create courses",
        ) from exc


@router.get("", response_model=list[CourseResponse])
async def list_my_courses(current_user: CurrentUser, session: DBSession) -> list[Course]:
    return await list_courses_for_user(session, current_user.id)


@router.post("/join", response_model=CourseResponse)
async def join_course(
    payload: CourseJoinRequest,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await join_course_by_code(session, current_user, payload)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except StudentRoleRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can join courses by code",
        ) from exc
    except CourseNotPublishedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course is not published",
        ) from exc


@router.patch("/{course_id}", response_model=CourseResponse)
async def update_course_endpoint(
    course_id: UUID,
    payload: CourseUpdate,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await update_course(session, course_id, current_user.id, payload)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseUpdateForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can update the course",
        ) from exc


@router.post("/{course_id}/archive", response_model=CourseResponse)
async def archive_course_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await archive_course(session, course_id, current_user.id)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseArchiveForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can archive the course",
        ) from exc


@router.post("/{course_id}/restore", response_model=CourseResponse)
async def restore_course_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await restore_course(session, course_id, current_user.id)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseArchiveForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can restore the course",
        ) from exc
    except CourseLifecycleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.post("/{course_id}/publish", response_model=CourseResponse)
async def publish_course_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await publish_course(session, course_id, current_user.id)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CoursePublishForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can publish the course",
        ) from exc
    except CourseLifecycleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get("/{course_id}/members", response_model=list[CourseMemberResponse])
async def get_members(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> list[CourseMemberResponse]:
    try:
        return await list_course_members(session, course_id, current_user.id)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseMembershipRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course membership required",
        ) from exc
    except CourseMemberListForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view member emails",
        ) from exc


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> Course:
    try:
        return await get_course_for_member(session, course_id, current_user.id)
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseMembershipRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course membership required",
        ) from exc
