from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.models.course import Course
from app.schemas.course import CourseCreate, CourseResponse
from app.services.course import (
    CourseMembershipRequiredError,
    CourseNotFoundError,
    TeacherRoleRequiredError,
    create_course,
    get_course_for_member,
    list_courses_for_user,
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
