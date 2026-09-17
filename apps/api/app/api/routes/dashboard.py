from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.dashboard import CourseDashboardResponse, TeacherDashboardOverviewResponse
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.dashboard import get_course_dashboard, get_teacher_dashboard_overview
from app.services.learning import LearningEventForbiddenError

router = APIRouter(tags=["dashboard"])


@router.get(
    "/courses/{course_id}/dashboard",
    response_model=CourseDashboardResponse,
)
async def read_course_dashboard(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_course_dashboard(session, course_id, current_user.id)
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
    except LearningEventForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view the dashboard",
        ) from exc


@router.get(
    "/dashboard/overview",
    response_model=TeacherDashboardOverviewResponse,
)
async def read_teacher_dashboard_overview(
    course_id: Annotated[UUID, Query(alias="courseId")],
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_teacher_dashboard_overview(session, course_id, current_user.id)
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
    except LearningEventForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view the dashboard",
        ) from exc
