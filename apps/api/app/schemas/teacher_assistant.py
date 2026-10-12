from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

TeacherAssistantPage = Literal[
    "dashboard",
    "ai_insights",
    "student_analytics",
    "student_detail",
    "student_conversation",
    "knowledge_base",
    "knowledge_point_detail",
    "ai_review",
    "teaching_strategy",
    "execution_plan",
    "courses",
    "unknown",
]

TeacherAssistantNavigationType = Literal[
    "dashboard",
    "ai_insights",
    "students_list",
    "student_detail",
    "student_conversation",
    "knowledge_base",
    "knowledge_point_detail",
    "ai_review",
    "ai_review_pending",
    "review_flag",
    "teaching_strategies",
    "teaching_strategy",
    "execution_plans",
    "execution_plan",
    "courses",
    "course_detail",
]

TeacherAssistantMessageStatus = Literal["complete", "failed", "interrupted"]


class TeacherAssistantPageContext(BaseModel):
    page: TeacherAssistantPage = "unknown"
    student_id: UUID | None = None
    conversation_id: UUID | None = None
    knowledge_point_id: UUID | None = None
    review_flag_id: UUID | None = None
    strategy_id: UUID | None = None
    plan_id: UUID | None = None
    time_range_days: int | None = Field(default=None, ge=7, le=180)


class TeacherAssistantHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1500)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("history content must not be blank")
        return normalized


class TeacherAssistantMessageCreateRequest(BaseModel):
    client_message_id: UUID
    content: str = Field(min_length=1, max_length=4000)
    history: list[TeacherAssistantHistoryMessage] = Field(default_factory=list, max_length=16)
    page_context: TeacherAssistantPageContext | None = None
    locale: str = Field(default="zh-CN", min_length=2, max_length=20)

    @field_validator("content", "locale")
    @classmethod
    def strip_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must not be blank")
        return normalized


class TeacherAssistantNavigationTarget(BaseModel):
    type: TeacherAssistantNavigationType
    course_id: UUID
    student_id: UUID | None = None
    conversation_id: UUID | None = None
    knowledge_point_id: UUID | None = None
    review_flag_id: UUID | None = None
    strategy_id: UUID | None = None
    plan_id: UUID | None = None


class TeacherAssistantSuggestedAction(BaseModel):
    id: str
    label: str
    reason: str | None = None
    target: TeacherAssistantNavigationTarget


class TeacherAssistantMessage(BaseModel):
    id: UUID
    role: Literal["assistant"] = "assistant"
    content: str
    status: TeacherAssistantMessageStatus = "complete"
    insufficient_evidence: bool = False
    suggested_actions: list[TeacherAssistantSuggestedAction] = Field(default_factory=list)
    created_at: datetime


class TeacherAssistantCapabilities(BaseModel):
    enabled: bool
    read_only: Literal[True] = True
    streaming: bool
    memory_mode: Literal["client_session"] = "client_session"
    max_message_chars: int
    max_context_days: int
    suggested_prompts: list[str]
    supported_pages: list[TeacherAssistantPage]
