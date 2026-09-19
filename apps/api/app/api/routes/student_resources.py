from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.student_learning import (
    KnowledgePointSourcePage,
    StudentConversationPage,
    StudentPlanTaskPage,
    StudentResourcePage,
    StudentTeacherListResponse,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.student_learning import (
    StudentLearningForbiddenError,
    StudentLearningNotFoundError,
)
from app.services.student_resources import (
    list_course_teachers_for_student,
    list_student_course_resources,
    list_student_knowledge_point_sources,
    list_student_plan_tasks,
    list_student_related_conversations,
)

router = APIRouter(tags=["student-resources"])


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (CourseNotFoundError, StudentLearningNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student resource not found",
        )
    if isinstance(exc, (CourseMembershipRequiredError, StudentLearningForbiddenError)):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student course access required",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to load student resource",
    )


@router.get(
    "/courses/{course_id}/student-resources",
    response_model=StudentResourcePage,
)
async def get_student_course_resources(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_student_course_resources(session, course_id, current_user.id)
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/knowledge-points/{knowledge_point_id}/sources",
    response_model=KnowledgePointSourcePage,
)
async def get_knowledge_point_sources(
    course_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_student_knowledge_point_sources(
            session,
            course_id,
            knowledge_point_id,
            current_user.id,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/knowledge-points/{knowledge_point_id}/conversations",
    response_model=StudentConversationPage,
)
async def get_student_knowledge_point_conversations(
    course_id: UUID,
    student_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
):
    try:
        return await list_student_related_conversations(
            session,
            course_id,
            student_id,
            current_user.id,
            knowledge_point_id,
            limit=limit,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/teachers",
    response_model=StudentTeacherListResponse,
)
async def get_course_teachers(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_course_teachers_for_student(
            session,
            course_id,
            current_user.id,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/plan-tasks",
    response_model=StudentPlanTaskPage,
)
async def get_student_plan_tasks(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_student_plan_tasks(
            session,
            course_id,
            student_id,
            current_user.id,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
