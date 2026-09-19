from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.announcement import (
    AnnouncementCreateRequest,
    AnnouncementPage,
    AnnouncementReadResponse,
    AnnouncementResponse,
)
from app.services.announcements import (
    AnnouncementForbiddenError,
    AnnouncementNotFoundError,
    create_course_announcement,
    list_course_announcements,
    mark_announcement_read,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError

router = APIRouter(tags=["announcements"])


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (CourseNotFoundError, AnnouncementNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Announcement not found",
        )
    if isinstance(exc, (CourseMembershipRequiredError, AnnouncementForbiddenError)):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Announcement access denied",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to process announcement",
    )


@router.post(
    "/courses/{course_id}/announcements",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_announcement(
    course_id: UUID,
    payload: AnnouncementCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_course_announcement(
            session,
            course_id,
            current_user.id,
            payload,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/announcements",
    response_model=AnnouncementPage,
)
async def get_announcements(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    include_drafts: Annotated[bool, Query(alias="includeDrafts")] = False,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_course_announcements(
            session,
            course_id,
            current_user.id,
            include_drafts=include_drafts,
            cursor=cursor,
            limit=limit,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/courses/{course_id}/announcements/{announcement_id}/read",
    response_model=AnnouncementReadResponse,
)
async def read_announcement(
    course_id: UUID,
    announcement_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await mark_announcement_read(
            session,
            course_id,
            announcement_id,
            current_user.id,
        )
    except Exception as exc:
        raise _translate_error(exc) from exc
