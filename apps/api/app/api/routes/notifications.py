from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.notifications import (
    NotificationMarkAllReadResponse,
    NotificationPage,
    NotificationResponse,
    NotificationUnreadCount,
)
from app.services.notifications import (
    InvalidNotificationCursorError,
    NotificationNotFoundError,
    count_unread_notifications,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
async def list_current_user_notifications(
    current_user: CurrentUser,
    session: DBSession,
    unread: Annotated[bool, Query()] = False,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> NotificationPage:
    try:
        items, total, next_cursor, unread_count = await list_notifications(
            session,
            current_user.id,
            unread=unread,
            cursor=cursor,
            limit=limit,
        )
    except InvalidNotificationCursorError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid notification cursor",
        ) from exc
    return NotificationPage(
        items=[NotificationResponse.model_validate(item) for item in items],
        total=total,
        next_cursor=next_cursor,
        unread_count=unread_count,
    )


@router.get("/unread-count", response_model=NotificationUnreadCount)
async def get_unread_notification_count(
    current_user: CurrentUser,
    session: DBSession,
) -> NotificationUnreadCount:
    return NotificationUnreadCount(
        unread_count=await count_unread_notifications(session, current_user.id)
    )


@router.post("/read-all", response_model=NotificationMarkAllReadResponse)
async def mark_all_current_user_notifications_read(
    current_user: CurrentUser,
    session: DBSession,
) -> NotificationMarkAllReadResponse:
    updated = await mark_all_notifications_read(session, current_user.id)
    return NotificationMarkAllReadResponse(updated=updated, unread_count=0)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_current_user_notification_read(
    notification_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> NotificationResponse:
    try:
        notification = await mark_notification_read(
            session,
            current_user.id,
            notification_id,
        )
    except NotificationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        ) from exc
    return NotificationResponse.model_validate(notification)
