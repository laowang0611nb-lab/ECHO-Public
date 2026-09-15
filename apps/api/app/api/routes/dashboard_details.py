from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.dashboard_details import (
    ChapterAnalyticsResponse,
    KnowledgePointAnalyticsResponse,
    StudentLearningDetailResponse,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.dashboard_details import (
    KnowledgePointNotFoundError,
    StudentNotFoundError,
    get_knowledge_point_analytics,
    get_student_learning_detail,
    list_chapter_analytics,
)
from app.services.learning import LearningEventForbiddenError

router = APIRouter(tags=["dashboard"])


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, CourseNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    if isinstance(exc, CourseMembershipRequiredError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course membership required",
        )
    if isinstance(exc, LearningEventForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view analytics",
        )
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Analytics target not found",
    )


@router.get(
    "/courses/{course_id}/chapters/analytics",
    response_model=list[ChapterAnalyticsResponse],
)
async def read_chapter_analytics(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_chapter_analytics(session, course_id, current_user.id)
    except (CourseNotFoundError, CourseMembershipRequiredError, LearningEventForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/knowledge-points/{knowledge_point_id}/analytics",
    response_model=KnowledgePointAnalyticsResponse,
)
async def read_knowledge_point_analytics(
    course_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_knowledge_point_analytics(
            session,
            course_id,
            knowledge_point_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        CourseMembershipRequiredError,
        LearningEventForbiddenError,
        KnowledgePointNotFoundError,
    ) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/learning",
    response_model=StudentLearningDetailResponse,
)
async def read_student_learning_detail(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_student_learning_detail(
            session,
            course_id,
            student_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        CourseMembershipRequiredError,
        LearningEventForbiddenError,
        StudentNotFoundError,
    ) as exc:
        raise _translate_error(exc) from exc
