from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.teaching_policy import TeachingPolicyResponse, TeachingPolicyUpdate
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.teaching_policy import (
    TeachingPolicyConflictError,
    TeachingPolicyForbiddenError,
    get_teaching_policy,
    upsert_teaching_policy,
)

router = APIRouter(tags=["teaching-policy"])


@router.get(
    "/courses/{course_id}/teaching-policy",
    response_model=TeachingPolicyResponse,
)
async def read_teaching_policy(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        policy = await get_teaching_policy(session, course_id, current_user.id)
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
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teaching policy is not configured",
        )
    return policy


@router.put(
    "/courses/{course_id}/teaching-policy",
    response_model=TeachingPolicyResponse,
)
async def update_teaching_policy(
    course_id: UUID,
    payload: TeachingPolicyUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await upsert_teaching_policy(
            session,
            course_id,
            current_user,
            payload.content,
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
    except TeachingPolicyForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can update the teaching policy",
        ) from exc
    except TeachingPolicyConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teaching policy update conflicted with another request",
        ) from exc
