from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.models.review import ReviewSeverity, ReviewStatus
from app.schemas.review import (
    NotResolvedRequest,
    ReviewDecisionRequest,
    ReviewFlagResponse,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.review import (
    ReviewFlagForbiddenError,
    ReviewFlagNotFoundError,
    get_review_flag,
    list_review_flags,
    mark_message_not_resolved,
    review_flag,
)

router = APIRouter(tags=["review"])


def _review_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ReviewFlagNotFoundError | CourseNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review item not found")
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Course teacher permission required",
    )


@router.get(
    "/courses/{course_id}/review-flags",
    response_model=list[ReviewFlagResponse],
)
async def get_course_review_flags(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    review_status: Annotated[ReviewStatus | None, Query(alias="status")] = None,
    severity: Annotated[ReviewSeverity | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    try:
        return await list_review_flags(
            session,
            course_id,
            current_user.id,
            status=review_status,
            severity=severity,
            limit=limit,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/{flag_id}",
    response_model=ReviewFlagResponse,
)
async def get_course_review_flag(
    course_id: UUID,
    flag_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_review_flag(session, course_id, flag_id, current_user.id)
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.post(
    "/courses/{course_id}/review-flags/{flag_id}/review",
    response_model=ReviewFlagResponse,
)
async def decide_review_flag(
    course_id: UUID,
    flag_id: UUID,
    payload: ReviewDecisionRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await review_flag(session, course_id, flag_id, current_user.id, payload)
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.post(
    "/courses/{course_id}/messages/{message_id}/not-resolved",
    response_model=ReviewFlagResponse,
)
async def report_message_not_resolved(
    course_id: UUID,
    message_id: UUID,
    payload: NotResolvedRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await mark_message_not_resolved(
            session,
            course_id,
            message_id,
            current_user.id,
            payload,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc
