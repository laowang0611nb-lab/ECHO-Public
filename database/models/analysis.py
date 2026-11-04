from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
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
    from database.models.planning import TeachingStrategy
    from database.models.user import User


class AIAnalysisType(StrEnum):
    INITIAL = "initial"
    SECONDARY = "secondary"


class AIAnalysisStatus(StrEnum):
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class AIAnalysisStage(StrEnum):
    COLLECTING_PREVIOUS_ANALYSIS = "collecting_previous_analysis"
    QUERYING_EVIDENCE = "querying_evidence"
    EXPANDING_KNOWLEDGE_GRAPH = "expanding_knowledge_graph"
    ANALYZING_STUDENT_IMPACT = "analyzing_student_impact"
    GENERATING_RECOMMENDATION = "generating_recommendation"


class AIAnalysisScope(StrEnum):
    WHOLE_CLASS = "whole_class"
    STUDENT_GROUP = "student_group"
    CUSTOM_STUDENTS = "custom_students"


class AIAnalysisEvidenceSource(StrEnum):
    INITIAL_ANALYSIS = "initial_analysis"
    LEARNING_EVENT = "learning_event"
    MASTERY_SNAPSHOT = "mastery_snapshot"
    QUICK_CHECK_ATTEMPT = "quick_check_attempt"
    CONVERSATION_MESSAGE = "conversation_message"
    REVIEW_FLAG = "review_flag"
    MESSAGE_CITATION = "message_citation"
    KNOWLEDGE_CHUNK = "knowledge_chunk"


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"
    __table_args__ = (
        CheckConstraint(
            "time_range_days >= 1",
            name="ck_ai_analyses_time_range_days_positive",
        ),
        CheckConstraint(
            "progress_percent >= 0 AND progress_percent <= 100",
            name="ck_ai_analyses_progress_percent_range",
        ),
        UniqueConstraint(
            "course_id",
            "created_by",
            "client_request_id",
            name="uq_ai_analyses_course_creator_request",
        ),
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
    knowledge_point_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="SET NULL"),
        index=True,
    )
    previous_analysis_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_analyses.id", ondelete="SET NULL"),
        index=True,
    )
    analysis_type: Mapped[AIAnalysisType] = mapped_column(
        Enum(
            AIAnalysisType,
            name="ai_analysis_type",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    scope: Mapped[AIAnalysisScope] = mapped_column(
        Enum(
            AIAnalysisScope,
            name="ai_analysis_scope",
            native_enum=False,
            length=24,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    student_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    time_range_days: Mapped[int] = mapped_column(Integer, default=28, nullable=False)
    focus: Mapped[str | None] = mapped_column(Text)
    client_request_id: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[AIAnalysisStatus] = mapped_column(
        Enum(
            AIAnalysisStatus,
            name="ai_analysis_status",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=AIAnalysisStatus.ANALYZING,
        server_default=AIAnalysisStatus.ANALYZING.value,
        nullable=False,
    )
    stage: Mapped[AIAnalysisStage | None] = mapped_column(
        Enum(
            AIAnalysisStage,
            name="ai_analysis_stage",
            native_enum=False,
            length=40,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        )
    )
    progress_percent: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    progress_message: Mapped[str | None] = mapped_column(Text)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course: Mapped["Course"] = relationship()
    knowledge_point: Mapped["KnowledgePoint | None"] = relationship()
    previous_analysis: Mapped["AIAnalysis | None"] = relationship(
        remote_side="AIAnalysis.id"
    )
    creator: Mapped["User"] = relationship()
    evidence: Mapped[list["AIAnalysisEvidence"]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        order_by="AIAnalysisEvidence.created_at",
    )
    result: Mapped["AIAnalysisResult | None"] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        uselist=False,
    )
    stage_events: Mapped[list["AIAnalysisStageEvent"]] = relationship(
        back_populates="analysis",
        cascade="all, delete-orphan",
        order_by="AIAnalysisStageEvent.sequence",
    )


class AIAnalysisEvidence(Base):
    __tablename__ = "ai_analysis_evidence"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    analysis_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_analyses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_type: Mapped[AIAnalysisEvidenceSource] = mapped_column(
        Enum(
            AIAnalysisEvidenceSource,
            name="ai_analysis_evidence_source",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        index=True,
        nullable=False,
    )
    source_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    student_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    knowledge_point_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="SET NULL"),
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    snapshot_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    analysis: Mapped[AIAnalysis] = relationship(back_populates="evidence")


class AIAnalysisStageEvent(Base):
    __tablename__ = "ai_analysis_stage_events"
    __table_args__ = (
        UniqueConstraint(
            "analysis_id",
            "sequence",
            name="uq_ai_analysis_stage_events_sequence",
        ),
        CheckConstraint(
            "percent >= 0 AND percent <= 100",
            name="ck_ai_analysis_stage_events_percent_range",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    analysis_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_analyses.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    stage: Mapped[AIAnalysisStage] = mapped_column(
        Enum(
            AIAnalysisStage,
            name="ai_analysis_stage_event_stage",
            native_enum=False,
            length=40,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    percent: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    analysis: Mapped[AIAnalysis] = relationship(back_populates="stage_events")


class AIAnalysisResult(Base):
    __tablename__ = "ai_analysis_results"

    analysis_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_analyses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    conclusion: Mapped[str] = mapped_column(Text, nullable=False)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    affected_student_ids: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    facts: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    evidence_summary: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    recommendation_payload: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    insufficient_evidence: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    insufficient_reason: Mapped[str | None] = mapped_column(Text)
    insufficient_categories: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    model_name: Mapped[str | None] = mapped_column(String(120))
    strategy_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teaching_strategies.id", ondelete="SET NULL"),
        index=True,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    analysis: Mapped[AIAnalysis] = relationship(back_populates="result")
    strategy: Mapped["TeachingStrategy | None"] = relationship()
