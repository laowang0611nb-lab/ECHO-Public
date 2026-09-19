from datetime import datetime
from uuid import UUID

from database.models.notification import NotificationSeverity, NotificationType
from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    id: UUID
    type: NotificationType
    severity: NotificationSeverity
    title: str
    body: str
    action_url: str | None
    payload_json: dict[str, object]
    course_id: UUID | None
    actor_id: UUID | None
    read_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationPage(BaseModel):
    items: list[NotificationResponse]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")
    unread_count: int = Field(serialization_alias="unreadCount")

    model_config = ConfigDict(populate_by_name=True)


class NotificationUnreadCount(BaseModel):
    unread_count: int = Field(serialization_alias="unreadCount")


class NotificationMarkAllReadResponse(BaseModel):
    updated: int
    unread_count: int = Field(serialization_alias="unreadCount")
