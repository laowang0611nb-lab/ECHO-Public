from datetime import datetime
from enum import StrEnum
from uuid import UUID

from database.models.review import (
    ReviewGenerationStatus,
    ReviewHistoryAction,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
    ReviewVersionSource,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.learning import LearningEventResponse


class ReviewDecision(StrEnum):
    CONFIRM_CORRECT = "confirm_correct"
    MARK_INCORRECT = "mark_incorrect"
    DISMISS = "dismiss"


class ReviewCitationResponse(BaseModel):
    document_id: UUID | None
    chunk_id: UUID | None
    page_start: int
    page_end: int
    quote: str


class ReviewVersionResponse(BaseModel):
    version: int
    answer: str
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    citations: list[ReviewCitationResponse] = Field(default_factory=list)
    source: ReviewVersionSource
    instruction: str | None
    created_at: datetime

    model_config = ConfigDict(populate_by_name=True)


class ReviewHistoryEntryResponse(BaseModel):
    id: UUID
    review_flag_id: UUID
    version: int
    action: ReviewHistoryAction
    from_status: ReviewStatus
    to_status: ReviewStatus
    teacher_id: UUID | None
    teacher_display_name: str | None
    note: str | None
    answer_snapshot: str | None
    corrected_answer_snapshot: str | None
    created_at: datetime


class ReviewFlagResponse(BaseModel):
    id: UUID
    course_id: UUID
    conversation_id: UUID
    message_id: UUID
    student_id: UUID
    student_display_name: str
    reason: ReviewReason
    severity: ReviewSeverity
    status: ReviewStatus
    details: dict[str, object]
    question: str | None
    answer: str
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    citations: list[ReviewCitationResponse] = Field(default_factory=list)
    current_version: int
    generation_status: ReviewGenerationStatus
    teacher_note: str | None
    corrected_answer: str | None
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    versions: list[ReviewVersionResponse] = Field(default_factory=list)
    review_history: list[ReviewHistoryEntryResponse] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class ReviewDecisionRequest(BaseModel):
    decision: ReviewDecision
    note: str | None = Field(default=None, max_length=2000)
    corrected_answer: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_corrected_answer(self) -> "ReviewDecisionRequest":
        if self.decision != ReviewDecision.MARK_INCORRECT and self.corrected_answer:
            raise ValueError("corrected_answer is only valid for mark_incorrect")
        return self


class NotResolvedRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class ReviewRegenerationRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=4000)
    base_version: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def strip_instruction(self) -> "ReviewRegenerationRequest":
        normalized = self.instruction.strip()
        if not normalized:
            raise ValueError("instruction must not be blank")
        self.instruction = normalized
        return self


class ReviewRegenerationResponse(BaseModel):
    review_id: UUID
    status: ReviewGenerationStatus
    version: int
    answer: str
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    citations: list[ReviewCitationResponse] = Field(default_factory=list)
    error: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class ReviewRegenerationStatusResponse(BaseModel):
    status: ReviewGenerationStatus
    progress: int
    version: int
    answer: str | None
    error: str | None
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    citations: list[ReviewCitationResponse] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class ReviewFlagSummaryResponse(BaseModel):
    pending: int
    high_risk: int
    reasons: dict[ReviewReason, int]
    generating: int
    pending_rereview: int
    regeneration_failed: int


class ReviewFlagQueryResponse(BaseModel):
    items: list[ReviewFlagResponse]
    total: int
    next_cursor: str | None = Field(default=None, alias="nextCursor")
    summary: ReviewFlagSummaryResponse

    model_config = ConfigDict(populate_by_name=True)


class ReviewTeachingPolicyConflictResponse(BaseModel):
    code: str
    detail: str


class ReviewContextResponse(BaseModel):
    review_id: UUID
    question: str | None
    current_version: ReviewVersionResponse
    citations: list[ReviewCitationResponse] = Field(default_factory=list)
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    message_id: UUID = Field(alias="messageId")
    conversation_id: UUID = Field(alias="conversationId")
    student_id: UUID = Field(alias="studentId")
    recent_learning_events: list[LearningEventResponse] = Field(default_factory=list)
    teaching_policy: str | None = None
    teaching_policy_conflicts: list[ReviewTeachingPolicyConflictResponse] = Field(
        default_factory=list
    )
    review_history: list[ReviewHistoryEntryResponse] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)
