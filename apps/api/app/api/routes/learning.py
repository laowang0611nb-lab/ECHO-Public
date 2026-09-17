from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.learning import (
    LearningEventCreate,
    LearningEventResponse,
    MasteryStateResponse,
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
