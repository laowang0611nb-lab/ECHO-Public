from typing import Annotated
from uuid import UUID

from database.models.review import ReviewReason, ReviewSeverity, ReviewStatus
from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import (
    ChatProviderDep,
    CurrentUser,
    DBSession,
    EmbeddingProviderDep,
)
from app.schemas.review import (
    NotResolvedRequest,
    ReviewContextResponse,
    ReviewDecisionRequest,
    ReviewFlagQueryResponse,
    ReviewFlagResponse,
    ReviewFlagSummaryResponse,
    ReviewHistoryEntryResponse,
    ReviewRegenerationRequest,
    ReviewRegenerationResponse,
    ReviewRegenerationStatusResponse,
    ReviewVersionResponse,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.review import (
    ReviewFlagConflictError,
    ReviewFlagForbiddenError,
    ReviewFlagNotFoundError,
    review_flag,
)
from app.services.review import (
    mark_message_not_resolved as report_message_not_resolved_service,
)
from app.services.review_workflow import (
    ReviewRegenerationConflictError,
    get_review_context,
    get_review_flag_detail,
    get_review_history,
    get_review_regeneration,
    get_review_summary,
    list_review_versions,
    query_review_flags,
    regenerate_review_answer,
)

router = APIRouter(tags=["review"])


def _review_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ReviewFlagNotFoundError | CourseNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review item not found",
        )
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Course teacher permission required",
    )


def _review_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Review item was updated concurrently",
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
    reason: Annotated[ReviewReason | None, Query()] = None,
    student_id: Annotated[UUID | None, Query(alias="studentId")] = None,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    sort: Annotated[str, Query()] = "newest",
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    if sort not in {"newest", "oldest", "priority", "severity"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort must be newest, oldest, priority, or severity",
        )
    try:
        response = await query_review_flags(
            session,
            course_id,
            current_user.id,
            status=review_status,
            severity=severity,
            reason=reason,
            student_id=student_id,
            knowledge_point_id=knowledge_point_id,
            q=q,
            sort=sort,
            cursor=cursor,
            limit=limit,
        )
        return response.items
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/query",
    response_model=ReviewFlagQueryResponse,
)
async def query_course_review_flags(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    review_status: Annotated[ReviewStatus | None, Query(alias="status")] = None,
    severity: Annotated[ReviewSeverity | None, Query()] = None,
    reason: Annotated[ReviewReason | None, Query()] = None,
    student_id: Annotated[UUID | None, Query(alias="studentId")] = None,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    sort: Annotated[str, Query()] = "newest",
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    if sort not in {"newest", "oldest", "priority", "severity"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sort must be newest, oldest, priority, or severity",
        )
    try:
        return await query_review_flags(
            session,
            course_id,
            current_user.id,
            status=review_status,
            severity=severity,
            reason=reason,
            student_id=student_id,
            knowledge_point_id=knowledge_point_id,
            q=q,
            sort=sort,
            cursor=cursor,
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
    "/courses/{course_id}/review-flags/summary",
    response_model=ReviewFlagSummaryResponse,
)
async def get_course_review_summary(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_review_summary(session, course_id, current_user.id)
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
        return await get_review_flag_detail(
            session,
            course_id,
            flag_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/{flag_id}/regeneration",
    response_model=ReviewRegenerationStatusResponse,
)
async def get_course_review_regeneration(
    course_id: UUID,
    flag_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_review_regeneration(
            session,
            course_id,
            flag_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.post(
    "/courses/{course_id}/review-flags/{flag_id}/regenerate",
    response_model=ReviewRegenerationResponse,
)
async def regenerate_course_review_flag(
    course_id: UUID,
    flag_id: UUID,
    payload: ReviewRegenerationRequest,
    current_user: CurrentUser,
    session: DBSession,
    embedding_provider: EmbeddingProviderDep,
    chat_provider: ChatProviderDep,
):
    try:
        return await regenerate_review_answer(
            session,
            course_id,
            flag_id,
            current_user.id,
            payload,
            embedding_provider=embedding_provider,
            chat_provider=chat_provider,
        )
    except ReviewRegenerationConflictError as exc:
        raise _review_conflict() from exc
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/{flag_id}/versions",
    response_model=list[ReviewVersionResponse],
)
async def list_course_review_versions(
    course_id: UUID,
    flag_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_review_versions(
            session,
            course_id,
            flag_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/{flag_id}/history",
    response_model=list[ReviewHistoryEntryResponse],
)
async def get_course_review_history(
    course_id: UUID,
    flag_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_review_history(
            session,
            course_id,
            flag_id,
            current_user.id,
        )
    except (
        CourseNotFoundError,
        ReviewFlagNotFoundError,
        CourseMembershipRequiredError,
        ReviewFlagForbiddenError,
    ) as exc:
        raise _review_error(exc) from exc


@router.get(
    "/courses/{course_id}/review-flags/{flag_id}/context",
    response_model=ReviewContextResponse,
)
async def get_course_review_context(
    course_id: UUID,
    flag_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_review_context(
            session,
            course_id,
            flag_id,
            current_user.id,
        )
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
    except ReviewFlagConflictError as exc:
        raise _review_conflict() from exc
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
        return await report_message_not_resolved_service(
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
    except ReviewFlagConflictError as exc:
        raise _review_conflict() from exc
