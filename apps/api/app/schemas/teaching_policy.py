from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TeachingPolicyUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("content must not be blank")
        return normalized


class TeachingPolicyResponse(BaseModel):
    id: UUID
    course_id: UUID
    content: str
    updated_by: UUID
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
