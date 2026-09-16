from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.review import ReviewReason, ReviewSeverity, ReviewStatus


class ReviewDecision(StrEnum):
    CONFIRM_CORRECT = "confirm_correct"
    MARK_INCORRECT = "mark_incorrect"
    DISMISS = "dismiss"


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
    teacher_note: str | None
    corrected_answer: str | None
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


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
