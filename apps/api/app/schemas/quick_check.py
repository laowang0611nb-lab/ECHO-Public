from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class QuickCheckOptionBlock(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=500)


class HintBlock(BaseModel):
    type: str = "hint"
    level: int = Field(ge=1, le=10)
    title: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1, max_length=5000)
    can_request_more: bool


class QuickCheckBlock(BaseModel):
    type: str = "quick_check"
    question_id: UUID
    title: str | None = Field(default=None, max_length=255)
    prompt: str = Field(min_length=1, max_length=5000)
    options: list[QuickCheckOptionBlock] = Field(min_length=2, max_length=6)
    status: str
    selected_option_id: str | None = Field(default=None, max_length=64)
    attempts_remaining: int | None = Field(default=None, ge=0, le=10)
    correct: bool | None = None
    explanation: str | None = Field(default=None, max_length=20000)
    hint: str | None = Field(default=None, max_length=5000)


class MasteryUpdateBlock(BaseModel):
    type: str = "mastery_update"
    knowledge_point_id: UUID
    knowledge_point_name: str | None = None
    before: float | None = Field(default=None, ge=0, le=100)
    after: float = Field(ge=0, le=100)
    reason: str = Field(min_length=1, max_length=500)
    evidence_id: str | None = None


class QuickCheckAttemptRequest(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=128)
    selected_option_id: str = Field(min_length=1, max_length=64)
    conversation_id: UUID | None = None
    message_id: UUID | None = None

    @field_validator("attempt_id", "selected_option_id")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("identifier must not be blank")
        return normalized


class QuickCheckAttemptResponse(BaseModel):
    attempt_id: str
    question_id: UUID
    correct: bool
    locked: bool
    explanation: str | None
    hint: str | None
    mastery_update: MasteryUpdateBlock | None = None


class HintRequest(BaseModel):
    level: int | None = Field(default=None, ge=1, le=10)


class HintResponse(BaseModel):
    message_id: UUID
    hint: HintBlock


class GeneratedQuickCheckOption(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=500)


class GeneratedQuickCheckDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    prompt: str = Field(min_length=1, max_length=5000)
    options: list[GeneratedQuickCheckOption] = Field(min_length=2, max_length=4)
    correct_option_id: str = Field(min_length=1, max_length=64)
    explanation: str = Field(min_length=1, max_length=20000)
    hints: list[str] = Field(min_length=2, max_length=3)

    @model_validator(mode="after")
    def validate_options(self) -> "GeneratedQuickCheckDraft":
        option_ids = [option.id for option in self.options]
        if len(set(option_ids)) != len(option_ids):
            raise ValueError("option ids must be unique")
        if self.correct_option_id not in set(option_ids):
            raise ValueError("correct_option_id must reference an option")
        return self
