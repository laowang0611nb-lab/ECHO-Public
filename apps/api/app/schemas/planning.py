from datetime import date, datetime
from typing import Literal
from uuid import UUID

from database.models.learning import LearningEventType
from database.models.planning import (
    ExecutionPlanStatus,
    PlanTargetScope,
    PlanTaskStatus,
    PlanTaskType,
    TeachingStrategyHistoryAction,
    TeachingStrategyPriority,
    TeachingStrategySource,
    TeachingStrategyStatus,
    TeachingStrategyType,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ResourceReference(BaseModel):
    id: UUID
    title: str
    resource_type: str


class KnowledgePointReference(BaseModel):
    id: UUID
    name: str


class StudentReference(BaseModel):
    id: UUID
    display_name: str


class CourseReference(BaseModel):
    id: UUID
    name: str


class StrategyPlanReference(BaseModel):
    id: UUID
    title: str
    status: ExecutionPlanStatus


class TeachingMethodWeight(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    weight: float = Field(ge=0, le=1)


class TeachingFlowStep(BaseModel):
    order: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=5000)


class ExpectedEffect(BaseModel):
    summary: str = Field(default="", max_length=2000)
    impact: float | None = Field(default=None, ge=-1, le=1)
    metrics: list[dict[str, object]] = Field(default_factory=list)


class StrategyChangeHistoryItem(BaseModel):
    id: UUID
    version: int
    action: TeachingStrategyHistoryAction
    changed_by: UUID
    created_at: datetime


class TeachingStrategyGenerateRequest(BaseModel):
    knowledge_point_ids: list[UUID] = Field(default_factory=list, alias="knowledgePointIds")
    student_ids: list[UUID] = Field(default_factory=list, alias="studentIds")
    insight_ids: list[str] = Field(default_factory=list, alias="insightIds")
    time_range_days: int = Field(default=28, ge=1, le=365, alias="timeRangeDays")

    model_config = ConfigDict(populate_by_name=True)


class TeachingStrategyGenerationDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=10000)
    type: TeachingStrategyType
    priority: TeachingStrategyPriority
    goals: list[str] = Field(default_factory=list, max_length=20)
    teaching_methods: list[TeachingMethodWeight] = Field(default_factory=list, max_length=20)
    teaching_flow: list[TeachingFlowStep] = Field(default_factory=list, max_length=50)
    personalization_rules: list[str] = Field(default_factory=list, max_length=50)
    ai_rules: list[str] = Field(default_factory=list, max_length=50)
    expected_effect: ExpectedEffect = Field(default_factory=ExpectedEffect)


class TeachingStrategyCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=10000)
    type: TeachingStrategyType
    priority: TeachingStrategyPriority
    goals: list[str] = Field(default_factory=list, max_length=20)
    teaching_methods: list[TeachingMethodWeight] = Field(default_factory=list, max_length=20)
    teaching_flow: list[TeachingFlowStep] = Field(default_factory=list, max_length=50)
    personalization_rules: list[str] = Field(default_factory=list, max_length=50)
    ai_rules: list[str] = Field(default_factory=list, max_length=50)
    target_knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=100)
    target_student_ids: list[UUID] = Field(default_factory=list, max_length=500)
    resource_ids: list[UUID] = Field(default_factory=list, max_length=100)
    expected_effect: ExpectedEffect = Field(default_factory=ExpectedEffect)


class TeachingStrategyUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    type: TeachingStrategyType | None = None
    priority: TeachingStrategyPriority | None = None
    goals: list[str] | None = Field(default=None, max_length=20)
    teaching_methods: list[TeachingMethodWeight] | None = Field(default=None, max_length=20)
    teaching_flow: list[TeachingFlowStep] | None = Field(default=None, max_length=50)
    personalization_rules: list[str] | None = Field(default=None, max_length=50)
    ai_rules: list[str] | None = Field(default=None, max_length=50)
    target_knowledge_point_ids: list[UUID] | None = Field(default=None, max_length=100)
    target_student_ids: list[UUID] | None = Field(default=None, max_length=500)
    resource_ids: list[UUID] | None = Field(default=None, max_length=100)
    expected_effect: ExpectedEffect | None = None

    @model_validator(mode="after")
    def require_change(self) -> "TeachingStrategyUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("at least one strategy field must be provided")
        for field in (
            "title",
            "description",
            "type",
            "priority",
            "goals",
            "teaching_methods",
            "teaching_flow",
            "personalization_rules",
            "ai_rules",
            "target_knowledge_point_ids",
            "target_student_ids",
            "resource_ids",
            "expected_effect",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class TeachingStrategyActionRequest(BaseModel):
    action: Literal["accept", "dismiss", "activate", "pause", "resume", "complete"]


class TeachingStrategyListItem(BaseModel):
    id: UUID
    course_id: UUID
    title: str
    description: str
    type: TeachingStrategyType
    priority: TeachingStrategyPriority
    status: TeachingStrategyStatus
    source: TeachingStrategySource
    target_knowledge_points: list[KnowledgePointReference]
    target_student_count: int
    expected_effect: ExpectedEffect
    updated_at: datetime


class TeachingStrategyVersionItem(BaseModel):
    id: UUID
    strategy_id: UUID
    version: int
    action: TeachingStrategyHistoryAction
    status: TeachingStrategyStatus
    snapshot: dict[str, object]
    changed_by: UUID
    created_at: datetime


class TeachingStrategyEvidence(BaseModel):
    learning_event_count: int
    knowledge_point_count: int
    student_count: int


class TeachingStrategyDetail(BaseModel):
    id: UUID
    course: CourseReference
    title: str
    description: str
    type: TeachingStrategyType
    priority: TeachingStrategyPriority
    status: TeachingStrategyStatus
    source: TeachingStrategySource
    version: int
    goals: list[str]
    teaching_methods: list[TeachingMethodWeight]
    teaching_flow: list[TeachingFlowStep]
    personalization_rules: list[str]
    ai_rules: list[str]
    target_knowledge_points: list[KnowledgePointReference]
    target_students: list[StudentReference]
    resources: list[ResourceReference]
    expected_effect: ExpectedEffect
    generated_context: dict[str, object]
    evidence: TeachingStrategyEvidence
    linked_plans: list[StrategyPlanReference]
    change_history: list[TeachingStrategyVersionItem]
    created_at: datetime
    updated_at: datetime


class TeachingStrategyPage(BaseModel):
    items: list[TeachingStrategyListItem]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")


class ExecutionPlanCreateRequest(BaseModel):
    strategy_id: UUID
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1, max_length=10000)
    start_date: date
    end_date: date
    target_scope: PlanTargetScope
    target_student_ids: list[UUID] = Field(default_factory=list, max_length=500)
    knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=100)
    actions: list[PlanTaskType] = Field(default_factory=list, max_length=20)
    resource_ids: list[UUID] = Field(default_factory=list, max_length=100)
    plan_parameters: dict[str, object] = Field(default_factory=dict)
    evaluation_metrics: list[str] = Field(default_factory=list, max_length=50)
    teacher_note: str | None = Field(default=None, max_length=5000)
    publish: bool = False

    @model_validator(mode="after")
    def validate_dates(self) -> "ExecutionPlanCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        if self.target_scope == PlanTargetScope.WHOLE_CLASS and self.target_student_ids:
            raise ValueError("whole_class plans must not provide target_student_ids")
        if self.target_scope != PlanTargetScope.WHOLE_CLASS and not self.target_student_ids:
            raise ValueError("target_student_ids are required for group plans")
        return self


class ExecutionPlanUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    start_date: date | None = None
    end_date: date | None = None
    target_scope: PlanTargetScope | None = None
    target_student_ids: list[UUID] | None = Field(default=None, max_length=500)
    knowledge_point_ids: list[UUID] | None = Field(default=None, max_length=100)
    actions: list[PlanTaskType] | None = Field(default=None, max_length=20)
    resource_ids: list[UUID] | None = Field(default=None, max_length=100)
    plan_parameters: dict[str, object] | None = None
    evaluation_metrics: list[str] | None = Field(default=None, max_length=50)
    teacher_note: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def require_change(self) -> "ExecutionPlanUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("at least one plan field must be provided")
        required = (
            "title",
            "description",
            "start_date",
            "end_date",
            "target_scope",
            "target_student_ids",
            "knowledge_point_ids",
            "actions",
            "resource_ids",
            "plan_parameters",
            "evaluation_metrics",
        )
        for field in required:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class ExecutionPlanActionRequest(BaseModel):
    action: Literal["publish", "pause", "resume", "complete", "cancel"]


class WeeklyPlanGenerateRequest(BaseModel):
    teacher_note: str | None = Field(default=None, max_length=5000)
    regenerate: bool = False


class WeeklyPlanRecommendationDraft(BaseModel):
    id: UUID | None = None
    content: str = Field(min_length=1, max_length=2000)


class WeeklyPlanTaskDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=5000)
    type: PlanTaskType
    due_at: datetime | None = None
    knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=100)
    resource_ids: list[UUID] = Field(default_factory=list, max_length=100)
    target_student_ids: list[UUID] = Field(default_factory=list, max_length=500)


class WeeklyPlanWeekDraft(BaseModel):
    week_number: int = Field(ge=1, le=52)
    start_date: date
    end_date: date
    content: str = Field(min_length=1, max_length=10000)
    knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=100)
    resource_ids: list[UUID] = Field(default_factory=list, max_length=100)
    tasks: list[WeeklyPlanTaskDraft] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_dates(self) -> "WeeklyPlanWeekDraft":
        if self.end_date < self.start_date:
            raise ValueError("week end_date must not be before start_date")
        return self


class WeeklyPlanGenerationDraft(BaseModel):
    weeks: list[WeeklyPlanWeekDraft] = Field(min_length=1, max_length=52)
    recommendations: list[WeeklyPlanRecommendationDraft] = Field(
        default_factory=list,
        max_length=50,
    )

    @model_validator(mode="after")
    def unique_week_numbers(self) -> "WeeklyPlanGenerationDraft":
        week_numbers = [week.week_number for week in self.weeks]
        if len(week_numbers) != len(set(week_numbers)):
            raise ValueError("week_number values must be unique")
        return self


class WeeklyPlanRecommendation(BaseModel):
    id: UUID
    content: str
    status: Literal["pending"]


class PlanTaskCompletion(BaseModel):
    completed: int
    total: int


class PlanTaskItem(BaseModel):
    id: UUID
    plan_id: UUID
    week_number: int
    title: str
    description: str
    type: PlanTaskType
    status: PlanTaskStatus
    due_at: datetime | None
    knowledge_point_ids: list[UUID]
    resource_ids: list[UUID]
    resources: list[ResourceReference]
    target_student_ids: list[UUID]
    completion: PlanTaskCompletion


class PlanTaskPage(BaseModel):
    items: list[PlanTaskItem]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")


class PlanTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    type: PlanTaskType | None = None
    status: PlanTaskStatus | None = None
    due_at: datetime | None = None
    knowledge_point_ids: list[UUID] | None = Field(default=None, max_length=100)
    resource_ids: list[UUID] | None = Field(default=None, max_length=100)
    target_student_ids: list[UUID] | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_change(self) -> "PlanTaskUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("at least one task field must be provided")
        for field in (
            "title",
            "description",
            "type",
            "status",
            "knowledge_point_ids",
            "resource_ids",
            "target_student_ids",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class ExecutionPlanWeekItem(BaseModel):
    id: UUID
    week_number: int
    start_date: date
    end_date: date
    content: str
    knowledge_point_ids: list[UUID]
    resources: list[ResourceReference]
    tasks: list[PlanTaskItem]


class PlanProgress(BaseModel):
    percentage: int
    completed_tasks: int
    total_tasks: int
    overdue_tasks: int
    current_week: int | None


class PlanStrategyReference(BaseModel):
    id: UUID
    title: str
    version: int


class PlanEffectMetric(BaseModel):
    metric: str
    label: str
    before: float | None
    after: float | None
    delta: float | None
    sample_size: int
    source: str


class PlanTaskEffectiveness(BaseModel):
    task_id: UUID
    title: str
    completion_rate: float
    event_count: int
    observed_change: float | None


class PlanEffectResponse(BaseModel):
    plan_id: UUID | None
    strategy_id: UUID | None
    period: dict[str, datetime]
    metrics: list[PlanEffectMetric]
    task_effectiveness: list[PlanTaskEffectiveness]
    remaining_issues: list[str]
    facts: list[str]
    ai_explanation: str | None
    insufficient_evidence: bool


class ExecutionPlanListItem(BaseModel):
    id: UUID
    course_id: UUID
    strategy: PlanStrategyReference
    title: str
    description: str
    status: ExecutionPlanStatus
    start_date: date
    end_date: date
    target_scope: PlanTargetScope
    target_student_count: int
    knowledge_point_count: int
    task_count: int
    progress: PlanProgress
    updated_at: datetime


class ExecutionPlanPage(BaseModel):
    items: list[ExecutionPlanListItem]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")


class ExecutionPlanDetail(BaseModel):
    id: UUID
    course: CourseReference
    strategy: PlanStrategyReference
    title: str
    description: str
    status: ExecutionPlanStatus
    start_date: date
    end_date: date
    target_scope: PlanTargetScope
    target_students: list[StudentReference]
    knowledge_points: list[KnowledgePointReference]
    resources: list[ResourceReference]
    actions: list[PlanTaskType]
    plan_parameters: dict[str, object]
    evaluation_metrics: list[str]
    teacher_note: str | None
    progress: PlanProgress
    weekly_plans: list[ExecutionPlanWeekItem]
    tasks: list[PlanTaskItem]
    recent_learning_events: list["PlanLearningEventItem"]
    effect_summary: PlanEffectResponse | None
    created_at: datetime
    updated_at: datetime


class PlanLearningEventItem(BaseModel):
    id: UUID
    course_id: UUID
    plan_id: UUID
    task_id: UUID | None
    week_number: int | None
    student: StudentReference
    knowledge_point: KnowledgePointReference | None
    event_type: LearningEventType
    result: Literal["correct", "wrong", "completed", "unresolved"]
    weight: float
    evidence: str | None
    metadata_json: dict[str, object]
    created_at: datetime


class PlanLearningEventPage(BaseModel):
    items: list[PlanLearningEventItem]
    total: int
    next_cursor: str | None = Field(default=None, serialization_alias="nextCursor")


class WeeklyPlanGenerationResponse(BaseModel):
    status: Literal["draft"]
    generation_id: UUID
    weeks: list[ExecutionPlanWeekItem]
    recommendations: list[WeeklyPlanRecommendation]


ExecutionPlanDetail.model_rebuild()
