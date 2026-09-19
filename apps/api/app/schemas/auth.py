import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from database.models.user import UserRole
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class LoginRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    role: UserRole

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("display_name must not be blank")
        return normalized


class TeacherProfileResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    role: UserRole
    avatar_url: str | None
    school_name: str | None
    department: str | None
    employee_no: str | None
    title: str | None
    teaching_fields: list[str]
    created_at: datetime
    updated_at: datetime


class TeacherProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    school_name: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    employee_no: str | None = Field(
        default=None,
        max_length=100,
        validation_alias=AliasChoices("employee_no", "teacher_no"),
    )
    title: str | None = Field(default=None, max_length=100)
    teaching_fields: list[str] | None = Field(default=None, max_length=50)

    @field_validator("display_name", "school_name", "department", "employee_no", "title")
    @classmethod
    def normalize_profile_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_change(self) -> "TeacherProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one profile field must be provided")
        if "display_name" in self.model_fields_set and self.display_name is None:
            raise ValueError("display_name must not be null")
        return self


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("new_password must not be blank")
        if not any(character.isalpha() for character in value):
            raise ValueError("new_password must contain a letter")
        if not any(character.isdigit() for character in value):
            raise ValueError("new_password must contain a digit")
        return value


class PasswordChangeResponse(BaseModel):
    changed_at: datetime
    sessions_revoked: int


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    role: UserRole
    avatar_url: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AvatarResponse(BaseModel):
    avatar_url: str


class SmsSendRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = re.sub(r"[\s-]", "", value.strip())
        if normalized.startswith("+86"):
            normalized = normalized[3:]
        elif normalized.startswith("86") and len(normalized) == 13:
            normalized = normalized[2:]
        return normalized


class SmsSendResponse(BaseModel):
    success: Literal[True] = True
    message: str = "Verification code sent"
    cooldown_seconds: int = Field(ge=1)


class SmsVerifyRequest(BaseModel):
    phone: str = Field(min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=4, max_length=8, pattern=r"^[A-Za-z0-9]+$")

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = re.sub(r"[\s-]", "", value.strip())
        if normalized.startswith("+86"):
            normalized = normalized[3:]
        elif normalized.startswith("86") and len(normalized) == 13:
            normalized = normalized[2:]
        return normalized

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip()


class SmsVerifyResponse(BaseModel):
    success: Literal[True] = True
    verified: Literal[True] = True
    verification_token: str
    expires_in_seconds: int = Field(default=300, ge=1)


class SmsErrorDetail(BaseModel):
    code: str
    message: str


class SmsErrorResponse(BaseModel):
    detail: SmsErrorDetail
