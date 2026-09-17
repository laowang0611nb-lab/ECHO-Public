from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.course import CourseStatus
from app.models.user import UserRole


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    term: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("course name must not be blank")
        return normalized

    @field_validator("description", "term")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CourseJoinRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class CourseResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    term: str | None
    status: CourseStatus
    code: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CourseMemberResponse(BaseModel):
    id: UUID
    course_id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: UserRole
    joined_at: datetime
