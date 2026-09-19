from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.quick_check import (
    HintRequest,
    HintResponse,
    QuickCheckAttemptRequest,
    QuickCheckAttemptResponse,
)
from app.schemas.student_learning import KnowledgePointQuickCheckSet
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.learning import (
    KnowledgePointNotFoundError,
    LearningEventConflictError,
    LearningEventReferenceMismatchError,
    LearningEventStudentNotFoundError,
)
from app.services.quick_checks import (
    HintNotFoundError,
    QuickCheckConflictError,
    QuickCheckForbiddenError,
    QuickCheckInvalidOptionError,
    QuickCheckLockedError,
    QuickCheckNotFoundError,
    QuickCheckUnavailableError,
    request_next_hint,
    submit_quick_check_attempt,
)
from app.services.student_learning import (
    StudentLearningForbiddenError,
    StudentLearningNotFoundError,
    list_knowledge_point_quick_checks,
)

router = APIRouter(tags=["quick-check"])


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (QuickCheckNotFoundError, HintNotFoundError, KnowledgePointNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quick Check resource not found",
        )
    if isinstance(exc, (QuickCheckForbiddenError, LearningEventStudentNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student course membership required",
        )
    if isinstance(exc, QuickCheckInvalidOptionError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected option is not part of this Quick Check",
        )
    if isinstance(exc, QuickCheckLockedError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quick Check attempts are locked",
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Quick Check request conflicts with existing data",
    )


@router.get(
    "/courses/{course_id}/knowledge-points/{knowledge_point_id}/quick-checks",
    response_model=KnowledgePointQuickCheckSet,
)
async def list_quick_checks_for_knowledge_point(
    course_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    count: Annotated[int, Query(ge=1, le=5)] = 3,
    purpose: Annotated[Literal["consolidation"], Query()] = "consolidation",
):
    try:
        return await list_knowledge_point_quick_checks(
            session,
            course_id,
            knowledge_point_id,
            current_user.id,
            count=count,
            purpose=purpose,
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
    except StudentLearningNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge point not found",
        ) from exc
    except StudentLearningForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student course membership required",
        ) from exc


@router.post(
    "/quick-checks/{question_id}/attempts",
    response_model=QuickCheckAttemptResponse,
)
async def submit_attempt(
    question_id: UUID,
    payload: QuickCheckAttemptRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await submit_quick_check_attempt(
            session,
            current_user.id,
            question_id,
            payload,
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
    except (
        QuickCheckUnavailableError,
        QuickCheckConflictError,
        LearningEventConflictError,
        LearningEventReferenceMismatchError,
    ) as exc:
        raise _translate_error(exc) from exc
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/messages/{message_id}/hints",
    response_model=HintResponse,
)
async def request_hint(
    message_id: UUID,
    payload: HintRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        hint = await request_next_hint(
            session,
            current_user.id,
            message_id,
            payload.level,
        )
        return HintResponse(message_id=message_id, hint=hint)
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
    except Exception as exc:
        raise _translate_error(exc) from exc
