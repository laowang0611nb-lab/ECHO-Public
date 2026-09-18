from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.db.base_class import Base

if TYPE_CHECKING:
    from database.models.course import Course
    from database.models.knowledge import KnowledgePoint
    from database.models.user import User


class TeachingStrategyType(StrEnum):
    CONTENT_ADJUSTMENT = "content_adjustment"
    TEACHING_METHOD = "teaching_method"
    DIFFERENTIATED_INSTRUCTION = "differentiated_instruction"
    ASSIGNMENT_DESIGN = "assignment_design"
    CLASSROOM_INTERACTION = "classroom_interaction"


class TeachingStrategyPriority(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TeachingStrategyStatus(StrEnum):
    SUGGESTED = "suggested"
    ACCEPTED = "accepted"
    PLANNED = "planned"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    DISMISSED = "dismissed"


class TeachingStrategySource(StrEnum):
    AI_GENERATED = "ai_generated"
    TEACHER_CREATED = "teacher_created"


class TeachingStrategyHistoryAction(StrEnum):
    GENERATED = "generated"
    CREATED = "created"
    UPDATED = "updated"
    ACCEPT = "accept"
    DISMISS = "dismiss"
    ACTIVATE = "activate"
    PAUSE = "pause"
    RESUME = "resume"
    COMPLETE = "complete"
    PLAN_CREATED = "plan_created"
    PLAN_PUBLISHED = "plan_published"


class ExecutionPlanStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PlanTargetScope(StrEnum):
    WHOLE_CLASS = "whole_class"
    STUDENT_GROUP = "student_group"
    CUSTOM_STUDENTS = "custom_students"


class PlanTaskType(StrEnum):
    SUPPLEMENTARY_PRACTICE = "supplementary_practice"
    RESOURCE_PUSH = "resource_push"
    CLASSROOM_LECTURE = "classroom_lecture"
    QUICK_CHECK = "quick_check"
    INDIVIDUAL_TUTORING = "individual_tutoring"
    PROJECT_TASK = "project_task"


class PlanTaskStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class ExecutionPlanGenerationStatus(StrEnum):
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


strategy_target_knowledge_points = Table(
    "strategy_target_knowledge_points",
    Base.metadata,
    Column(
        "strategy_id",
        Uuid(as_uuid=True),
        ForeignKey("teaching_strategies.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "knowledge_point_id",
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

strategy_target_students = Table(
    "strategy_target_students",
    Base.metadata,
    Column(
        "strategy_id",
        Uuid(as_uuid=True),
        ForeignKey("teaching_strategies.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

plan_target_knowledge_points = Table(
    "plan_target_knowledge_points",
    Base.metadata,
    Column(
        "plan_id",
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "knowledge_point_id",
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

plan_target_students = Table(
    "plan_target_students",
    Base.metadata,
    Column(
        "plan_id",
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

plan_task_knowledge_points = Table(
    "plan_task_knowledge_points",
    Base.metadata,
    Column(
        "task_id",
        Uuid(as_uuid=True),
        ForeignKey("plan_tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "knowledge_point_id",
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

plan_task_target_students = Table(
    "plan_task_target_students",
    Base.metadata,
    Column(
        "task_id",
        Uuid(as_uuid=True),
        ForeignKey("plan_tasks.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class TeachingStrategy(Base):
    __tablename__ = "teaching_strategies"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_teaching_strategies_version_positive"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    course_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[TeachingStrategyType] = mapped_column(
        Enum(
            TeachingStrategyType,
            name="teaching_strategy_type",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    priority: Mapped[TeachingStrategyPriority] = mapped_column(
        Enum(
            TeachingStrategyPriority,
            name="teaching_strategy_priority",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    status: Mapped[TeachingStrategyStatus] = mapped_column(
        Enum(
            TeachingStrategyStatus,
            name="teaching_strategy_status",
            native_enum=False,
            length=24,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=TeachingStrategyStatus.SUGGESTED,
        server_default=TeachingStrategyStatus.SUGGESTED.value,
        nullable=False,
    )
    source: Mapped[TeachingStrategySource] = mapped_column(
        Enum(
            TeachingStrategySource,
            name="teaching_strategy_source",
            native_enum=False,
            length=24,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    goals: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    teaching_methods: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    teaching_flow: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    personalization_rules: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    ai_rules: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    expected_effect: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    generated_context: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    resources_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    updated_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course: Mapped["Course"] = relationship()
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    updater: Mapped["User"] = relationship(foreign_keys=[updated_by])
    target_knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary=strategy_target_knowledge_points,
        order_by="KnowledgePoint.order_index",
    )
    target_students: Mapped[list["User"]] = relationship(
        secondary=strategy_target_students,
        order_by="User.display_name",
    )
    versions: Mapped[list["TeachingStrategyVersion"]] = relationship(
        back_populates="strategy",
        cascade="all, delete-orphan",
        order_by="TeachingStrategyVersion.version",
    )
    plans: Mapped[list["ExecutionPlan"]] = relationship(back_populates="strategy")


class TeachingStrategyVersion(Base):
    __tablename__ = "teaching_strategy_versions"
    __table_args__ = (
        UniqueConstraint(
            "strategy_id",
            "version",
            name="uq_teaching_strategy_versions_number",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_teaching_strategy_versions_version_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    strategy_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teaching_strategies.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[TeachingStrategyHistoryAction] = mapped_column(
        Enum(
            TeachingStrategyHistoryAction,
            name="teaching_strategy_history_action",
            native_enum=False,
            length=24,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    snapshot_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    changed_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    strategy: Mapped[TeachingStrategy] = relationship(back_populates="versions")
    changer: Mapped["User"] = relationship()


class ExecutionPlan(Base):
    __tablename__ = "execution_plans"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_execution_plans_date_range"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    course_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    strategy_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teaching_strategies.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ExecutionPlanStatus] = mapped_column(
        Enum(
            ExecutionPlanStatus,
            name="execution_plan_status",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=ExecutionPlanStatus.DRAFT,
        server_default=ExecutionPlanStatus.DRAFT.value,
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_scope: Mapped[PlanTargetScope] = mapped_column(
        Enum(
            PlanTargetScope,
            name="plan_target_scope",
            native_enum=False,
            length=24,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    actions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    plan_parameters: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    evaluation_metrics: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    resources_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    teacher_note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    updated_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course: Mapped["Course"] = relationship()
    strategy: Mapped[TeachingStrategy] = relationship(back_populates="plans")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    updater: Mapped["User"] = relationship(foreign_keys=[updated_by])
    target_students: Mapped[list["User"]] = relationship(
        secondary=plan_target_students,
        order_by="User.display_name",
    )
    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary=plan_target_knowledge_points,
        order_by="KnowledgePoint.order_index",
    )
    weeks: Mapped[list["ExecutionPlanWeek"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="ExecutionPlanWeek.week_number",
    )
    tasks: Mapped[list["PlanTask"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanTask.week_number, PlanTask.order_index",
    )
    generations: Mapped[list["ExecutionPlanGeneration"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="ExecutionPlanGeneration.created_at.desc()",
    )


class ExecutionPlanWeek(Base):
    __tablename__ = "execution_plan_weeks"
    __table_args__ = (
        UniqueConstraint(
            "plan_id",
            "week_number",
            name="uq_execution_plan_weeks_number",
        ),
        CheckConstraint(
            "week_number >= 1", name="ck_execution_plan_weeks_number_positive"
        ),
        CheckConstraint(
            "end_date >= start_date", name="ck_execution_plan_weeks_date_range"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    knowledge_point_ids: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    resources_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    plan: Mapped[ExecutionPlan] = relationship(back_populates="weeks")
    tasks: Mapped[list["PlanTask"]] = relationship(
        back_populates="week",
        order_by="PlanTask.order_index",
    )


class ExecutionPlanGeneration(Base):
    __tablename__ = "execution_plan_generations"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[ExecutionPlanGenerationStatus] = mapped_column(
        Enum(
            ExecutionPlanGenerationStatus,
            name="execution_plan_generation_status",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    request_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    response_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[ExecutionPlan] = relationship(back_populates="generations")
    creator: Mapped["User"] = relationship()


class PlanTask(Base):
    __tablename__ = "plan_tasks"
    __table_args__ = (
        CheckConstraint("week_number >= 1", name="ck_plan_tasks_week_number_positive"),
        CheckConstraint(
            "order_index >= 0", name="ck_plan_tasks_order_index_nonnegative"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    plan_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    week_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("execution_plan_weeks.id", ondelete="SET NULL"),
        index=True,
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[PlanTaskType] = mapped_column(
        Enum(
            PlanTaskType,
            name="plan_task_type",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    status: Mapped[PlanTaskStatus] = mapped_column(
        Enum(
            PlanTaskStatus,
            name="plan_task_status",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=PlanTaskStatus.NOT_STARTED,
        server_default=PlanTaskStatus.NOT_STARTED.value,
        nullable=False,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resources_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    plan: Mapped[ExecutionPlan] = relationship(back_populates="tasks")
    week: Mapped[ExecutionPlanWeek | None] = relationship(back_populates="tasks")
    creator: Mapped["User"] = relationship()
    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary=plan_task_knowledge_points,
        order_by="KnowledgePoint.order_index",
    )
    target_students: Mapped[list["User"]] = relationship(
        secondary=plan_task_target_students,
        order_by="User.display_name",
    )
