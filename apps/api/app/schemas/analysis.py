from datetime import datetime
from enum import StrEnum
from uuid import UUID

from database.models.analysis import (
    AIAnalysisEvidenceSource,
    AIAnalysisScope,
    AIAnalysisStage,
    AIAnalysisStatus,
    AIAnalysisType,
)
from database.models.planning import (
    TeachingStrategyPriority,
    TeachingStrategyType,
)
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class AIAnalysisInsufficientCategory(StrEnum):
    NO_EVIDENCE = "no_evidence"
    PARTIAL_COVERAGE = "partial_coverage"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    MISSING_CAUSAL_EVIDENCE = "missing_causal_evidence"
    MODEL_UNCERTAIN = "model_uncertain"


class AIAnalysisCreateRequest(BaseModel):
    knowledge_point_id: UUID | None = Field(
        default=None,
        validation_alias=AliasChoices("knowledge_point_id", "knowledgePointId"),
    )
    scope: AIAnalysisScope = Field(
        default=AIAnalysisScope.WHOLE_CLASS,
        validation_alias=AliasChoices("scope", "student_scope", "studentScope"),
    )
    student_ids: list[UUID] = Field(
        default_factory=list,
        max_length=500,
        validation_alias=AliasChoices("student_ids", "studentIds"),
    )
    time_range_days: int = Field(
        default=28,
        ge=7,
        le=180,
        validation_alias=AliasChoices("time_range_days", "timeRangeDays"),
    )
    focus: str | None = Field(default=None, max_length=2000)
    run_async: bool = Field(
        default=True,
        validation_alias=AliasChoices("async", "run_async", "async_mode"),
    )
    client_request_id: str | None = Field(
        default=None,
        max_length=128,
        validation_alias=AliasChoices("client_request_id", "clientRequestId"),
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    @field_validator("client_request_id")
    @classmethod
    def normalize_client_request_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_scope(self) -> "AIAnalysisCreateRequest":
        if self.scope == AIAnalysisScope.WHOLE_CLASS and self.student_ids:
            raise ValueError("whole_class analysis must not provide student_ids")
        if self.scope != AIAnalysisScope.WHOLE_CLASS and not self.student_ids:
            raise ValueError("student-scoped analysis requires student_ids")
        return self


class AIAnalysisReanalyzeRequest(BaseModel):
    focus: str | None = Field(default=None, max_length=2000)
    time_range_days: int | None = Field(
        default=None,
        ge=7,
        le=180,
        validation_alias=AliasChoices("time_range_days", "timeRangeDays"),
    )
    run_async: bool = Field(
        default=True,
        validation_alias=AliasChoices("async", "run_async", "async_mode"),
    )
    client_request_id: str | None = Field(
        default=None,
        max_length=128,
        validation_alias=AliasChoices("client_request_id", "clientRequestId"),
    )

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    @field_validator("client_request_id")
    @classmethod
    def normalize_client_request_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AIAnalysisFactResponse(BaseModel):
    fact: str
    evidence_ids: list[UUID] = Field(default_factory=list)


class AIAnalysisEvidenceResponse(BaseModel):
    id: UUID
    source_type: AIAnalysisEvidenceSource
    source_id: UUID
    student_id: UUID | None
    knowledge_point_id: UUID | None
    label: str
    description: str | None
    snapshot: dict[str, object]
    created_at: datetime


class AIAnalysisResultResponse(BaseModel):
    conclusion: str
    root_cause: str
    recommendation: str
    affected_student_ids: list[UUID] = Field(default_factory=list)
    facts: list[AIAnalysisFactResponse] = Field(default_factory=list)
    evidence_summary: list[dict[str, object]] = Field(default_factory=list)
    recommendation_payload: dict[str, object] = Field(default_factory=dict)
    insufficient_evidence: bool
    insufficient_reason: str | None = None
    insufficient_categories: list[AIAnalysisInsufficientCategory] = Field(default_factory=list)
    model_name: str | None
    strategy_id: UUID | None
    generated_at: datetime


class AIAnalysisProgressSummary(BaseModel):
    stage: AIAnalysisStage | None
    stage_label: str | None
    percent: int = Field(ge=0, le=100)
    message: str | None
    heartbeat_at: datetime | None


class AIAnalysisProgressResponse(AIAnalysisProgressSummary):
    analysis_id: UUID
    status: AIAnalysisStatus
    started_at: datetime | None
    updated_at: datetime
    completed_at: datetime | None
    error_message: str | None


class AIAnalysisResponse(BaseModel):
    id: UUID
    analysis_id: UUID
    course_id: UUID
    knowledge_point_id: UUID | None
    previous_analysis_id: UUID | None
    analysis_type: AIAnalysisType
    scope: AIAnalysisScope
    student_ids: list[UUID] = Field(default_factory=list)
    time_range_days: int
    focus: str | None
    client_request_id: str | None
    status: AIAnalysisStatus
    error_message: str | None
    progress: AIAnalysisProgressSummary | None = None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime
    result: AIAnalysisResultResponse | None = None
    evidence: list[AIAnalysisEvidenceResponse] = Field(default_factory=list)


class AIAnalysisListItem(BaseModel):
    id: UUID
    course_id: UUID
    knowledge_point_id: UUID | None
    analysis_type: AIAnalysisType
    scope: AIAnalysisScope
    status: AIAnalysisStatus
    student_count: int
    evidence_count: int
    insufficient_evidence: bool
    conclusion: str | None
    recommendation: str | None
    progress: AIAnalysisProgressSummary | None = None
    created_at: datetime
    completed_at: datetime | None


class AIAnalysisPage(BaseModel):
    items: list[AIAnalysisListItem]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")


class AIAnalysisStrategyRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    type: TeachingStrategyType | None = None
    priority: TeachingStrategyPriority | None = None

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AIAnalysisFactDraft(BaseModel):
    fact: str = Field(min_length=1, max_length=4000)
    evidence_ids: list[UUID] = Field(default_factory=list, max_length=50)


class AIAnalysisDraft(BaseModel):
    conclusion: str = Field(default="", max_length=10000)
    root_cause: str = Field(default="", max_length=10000)
    recommendation: str = Field(default="", max_length=10000)
    affected_student_ids: list[UUID] = Field(default_factory=list, max_length=500)
    facts: list[AIAnalysisFactDraft] = Field(default_factory=list, max_length=100)
    insufficient_evidence: bool = False
    insufficient_reason: str | None = Field(default=None, max_length=4000)
    insufficient_categories: list[AIAnalysisInsufficientCategory] = Field(
        default_factory=list, max_length=10
    )

    @model_validator(mode="after")
    def require_explanation_unless_insufficient(self) -> "AIAnalysisDraft":
        if self.insufficient_evidence:
            return self
        for name in ("conclusion", "root_cause", "recommendation"):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} is required unless insufficient_evidence is true")
        return self
