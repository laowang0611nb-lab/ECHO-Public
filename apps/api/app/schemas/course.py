from datetime import datetime
from uuid import UUID

from database.models.course import CourseStatus
from database.models.user import UserRole
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    term: str | None = Field(
        default=None,
        max_length=80,
        validation_alias=AliasChoices("term", "semester"),
    )
    course_type: str | None = Field(default=None, max_length=80)
    target_audience: str | None = Field(default=None, max_length=200)
    expected_student_count: int | None = Field(default=None, ge=1, le=100_000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("course name must not be blank")
        return normalized

    @field_validator("description", "term", "course_type", "target_audience")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    term: str | None = Field(
        default=None,
        max_length=80,
        validation_alias=AliasChoices("term", "semester"),
    )
    course_type: str | None = Field(default=None, max_length=80)
    target_audience: str | None = Field(default=None, max_length=200)
    expected_student_count: int | None = Field(default=None, ge=1, le=100_000)

    @field_validator("name")
    @classmethod
    def strip_update_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("course name must not be blank")
        return normalized

    @field_validator("description", "term", "course_type", "target_audience")
    @classmethod
    def strip_update_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_change(self) -> "CourseUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one course field must be provided")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name must not be null")
        return self


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
    semester: str | None
    course_type: str | None
    target_audience: str | None
    expected_student_count: int | None
    status: CourseStatus
    code: str
    created_by: UUID
    archived_at: datetime | None
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
