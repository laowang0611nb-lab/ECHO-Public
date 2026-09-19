from datetime import datetime
from typing import Annotated
from uuid import UUID

from database.models.learning import LearningEventType
from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.learning import (
    LearningEventCreate,
    LearningEventResponse,
    MasteryStateResponse,
)
from app.schemas.student_learning import (
    MisconceptionEvidence,
    StudentCourseProgressResponse,
    StudentLearningEventPage,
    WrongQuestionDetail,
    WrongQuestionPage,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.learning import (
    KnowledgePointNotFoundError,
    LearningEventConflictError,
    LearningEventForbiddenError,
    LearningEventReferenceMismatchError,
    LearningEventStudentNotFoundError,
    StudentMasteryForbiddenError,
    ensure_course_teacher,
    list_student_mastery,
    record_learning_event,
)
from app.services.student_learning import (
    StudentLearningForbiddenError,
    StudentLearningNotFoundError,
    get_student_course_progress,
    get_student_misconception_evidence,
    get_student_wrong_question_detail,
    list_student_learning_events,
    list_student_wrong_questions,
)

router = APIRouter(tags=["learning"])


@router.post(
    "/courses/{course_id}/learning-events",
    response_model=LearningEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learning_event(
    course_id: UUID,
    payload: LearningEventCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        await ensure_course_teacher(session, course_id, current_user.id)
        return await record_learning_event(session, course_id, payload)
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
            detail="Only course teachers can record learning events",
        ) from exc
    except KnowledgePointNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge point not found",
        ) from exc
    except LearningEventStudentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student is not a member of this course",
        ) from exc
    except LearningEventReferenceMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Learning event references do not belong to the student and course",
        ) from exc
    except LearningEventConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Learning event conflicted with another concurrent update",
        ) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/mastery",
    response_model=list[MasteryStateResponse],
)
async def get_student_mastery(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_student_mastery(
            session,
            course_id,
            student_id,
            current_user.id,
        )
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
    except StudentMasteryForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the student or a course teacher can view mastery",
        ) from exc


def _translate_student_read_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (CourseNotFoundError, StudentLearningNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student learning resource not found",
        )
    if isinstance(
        exc,
        (CourseMembershipRequiredError, StudentLearningForbiddenError),
    ):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student learning data access denied",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to load student learning data",
    )


@router.get(
    "/courses/{course_id}/students/{student_id}/learning-events",
    response_model=StudentLearningEventPage,
)
async def get_student_learning_events(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    event_type: Annotated[LearningEventType | None, Query(alias="eventType")] = None,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    from_time: Annotated[datetime | None, Query(alias="from")] = None,
    to_time: Annotated[datetime | None, Query(alias="to")] = None,
):
    try:
        return await list_student_learning_events(
            session,
            course_id,
            student_id,
            current_user.id,
            cursor=cursor,
            limit=limit,
            event_type=event_type,
            knowledge_point_id=knowledge_point_id,
            from_time=from_time,
            to_time=to_time,
        )
    except Exception as exc:
        raise _translate_student_read_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/progress",
    response_model=StudentCourseProgressResponse,
)
async def get_student_progress(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_student_course_progress(
            session,
            course_id,
            student_id,
            current_user.id,
        )
    except Exception as exc:
        raise _translate_student_read_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/wrong-questions",
    response_model=WrongQuestionPage,
)
async def get_student_wrong_questions(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    review_status: Annotated[str | None, Query(alias="status")] = None,
):
    try:
        return await list_student_wrong_questions(
            session,
            course_id,
            student_id,
            current_user.id,
            cursor=cursor,
            limit=limit,
            knowledge_point_id=knowledge_point_id,
            review_status=review_status,
        )
    except Exception as exc:
        raise _translate_student_read_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/wrong-questions/{question_id}",
    response_model=WrongQuestionDetail,
)
async def get_student_wrong_question(
    course_id: UUID,
    student_id: UUID,
    question_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_student_wrong_question_detail(
            session,
            course_id,
            student_id,
            current_user.id,
            question_id,
        )
    except Exception as exc:
        raise _translate_student_read_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/knowledge-points/{knowledge_point_id}/misconceptions",
    response_model=MisconceptionEvidence,
)
async def get_student_misconceptions(
    course_id: UUID,
    student_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    try:
        return await get_student_misconception_evidence(
            session,
            course_id,
            student_id,
            current_user.id,
            knowledge_point_id,
            days=days,
        )
    except Exception as exc:
        raise _translate_student_read_error(exc) from exc
