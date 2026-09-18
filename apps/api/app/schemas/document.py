from datetime import datetime
from uuid import UUID

from database.models.document import DocumentStatus, ResourceType
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class DocumentResponse(BaseModel):
    id: UUID
    course_id: UUID
    uploaded_by: UUID
    original_name: str
    display_name: str | None
    summary: str | None
    keywords: list[str]
    author: str | None
    publisher: str | None
    copyright: str | None
    content_type: str
    size_bytes: int
    status: DocumentStatus
    resource_type: ResourceType
    page_count: int | None
    trashed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentMetadataUpdate(BaseModel):
    display_name: str | None = Field(
        default=None,
        max_length=255,
        validation_alias=AliasChoices("display_name", "title"),
    )
    summary: str | None = Field(default=None, max_length=5000)
    keywords: list[str] | None = Field(default=None, max_length=50)
    author: str | None = Field(default=None, max_length=255)
    publisher: str | None = Field(default=None, max_length=255)
    copyright: str | None = Field(default=None, max_length=255)

    @field_validator("display_name", "summary", "author", "publisher", "copyright")
    @classmethod
    def normalize_metadata_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))

    @model_validator(mode="after")
    def require_change(self) -> "DocumentMetadataUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one metadata field must be provided")
        return self
