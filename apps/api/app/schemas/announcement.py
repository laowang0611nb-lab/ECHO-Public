from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AnnouncementCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=20000)
    publish: bool = True

    @field_validator("title", "content")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("announcement text must not be blank")
        return normalized


class AnnouncementResponse(BaseModel):
    id: UUID
    course_id: UUID
    title: str
    content: str
    published_at: datetime | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    is_read: bool
    read_at: datetime | None


class AnnouncementPage(BaseModel):
    items: list[AnnouncementResponse]
    total: int
    next_cursor: str | None


class AnnouncementReadResponse(BaseModel):
    announcement_id: UUID
    read_at: datetime
