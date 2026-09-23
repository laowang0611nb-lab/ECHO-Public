from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class AnnouncementUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=20000)
    publish: bool | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("title", "content")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("announcement text must not be null")
        normalized = value.strip()
        if not normalized:
            raise ValueError("announcement text must not be blank")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> "AnnouncementUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("at least one announcement field must be provided")
        return self


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
