from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.db.base_class import Base

if TYPE_CHECKING:
    from database.models.chat import Conversation, Message
    from database.models.course import Course
    from database.models.user import User


class ReviewReason(StrEnum):
    MISSING_COURSE_BASIS = "missing_course_basis"
    OUTSIDE_MATERIAL_HEAVY = "outside_material_heavy"
    REPEATED_FOLLOW_UP = "repeated_follow_up"
    STUDENT_NOT_RESOLVED = "student_not_resolved"
    TEACHER_RULE_VIOLATION = "teacher_rule_violation"


class ReviewSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ReviewStatus(StrEnum):
    OPEN = "open"
    CONFIRMED_CORRECT = "confirmed_correct"
    MARKED_INCORRECT = "marked_incorrect"
    DISMISSED = "dismissed"
    GENERATING = "generating"
    PENDING_REREVIEW = "pending_rereview"
    REGENERATION_FAILED = "regeneration_failed"


class ReviewGenerationStatus(StrEnum):
    IDLE = "idle"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ReviewVersionSource(StrEnum):
    ORIGINAL = "original"
    REGENERATED = "regenerated"
    TEACHER = "teacher"


class ReviewHistoryAction(StrEnum):
    CONFIRM_CORRECT = "confirm_correct"
    MARK_INCORRECT = "mark_incorrect"
    DISMISS = "dismiss"
    REGENERATE = "regenerate"


class AIReviewFlag(Base):
    __tablename__ = "ai_review_flags"
    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "reason",
            name="uq_ai_review_flags_message_reason",
        ),
        CheckConstraint(
            "current_version > 0",
            name="ck_ai_review_flags_current_version_positive",
        ),
        CheckConstraint(
            "generation_progress >= 0 AND generation_progress <= 100",
            name="ck_ai_review_flags_generation_progress_range",
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
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    message_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    reason: Mapped[ReviewReason] = mapped_column(
        Enum(
            ReviewReason,
            name="review_reason",
            native_enum=False,
            length=40,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    severity: Mapped[ReviewSeverity] = mapped_column(
        Enum(
            ReviewSeverity,
            name="review_severity",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(
            ReviewStatus,
            name="ck_ai_review_flags_review_status",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=ReviewStatus.OPEN,
        server_default=ReviewStatus.OPEN.value,
        nullable=False,
    )
    current_version: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    generation_status: Mapped[ReviewGenerationStatus] = mapped_column(
        Enum(
            ReviewGenerationStatus,
            name="review_generation_status",
            native_enum=False,
            length=16,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=ReviewGenerationStatus.IDLE,
        server_default=ReviewGenerationStatus.IDLE.value,
        nullable=False,
    )
    generation_progress: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    generation_error: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    teacher_note: Mapped[str | None] = mapped_column(Text)
    corrected_answer: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    conversation: Mapped["Conversation"] = relationship()
    message: Mapped["Message"] = relationship()
    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewed_by])
    versions: Mapped[list["ReviewAnswerVersion"]] = relationship(
        back_populates="review_flag",
        cascade="all, delete-orphan",
        order_by="ReviewAnswerVersion.version",
    )
    regeneration_runs: Mapped[list["ReviewRegenerationRun"]] = relationship(
        back_populates="review_flag",
        cascade="all, delete-orphan",
        order_by="ReviewRegenerationRun.created_at",
    )
    review_history: Mapped[list["ReviewHistoryEntry"]] = relationship(
        back_populates="review_flag",
        cascade="all, delete-orphan",
        order_by="ReviewHistoryEntry.sequence",
    )


class ReviewAnswerVersion(Base):
    __tablename__ = "review_answer_versions"
    __table_args__ = (
        UniqueConstraint(
            "review_flag_id",
            "version",
            name="uq_review_answer_versions_flag_version",
        ),
        CheckConstraint(
            "version > 0",
            name="ck_review_answer_versions_version_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    review_flag_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_review_flags.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    knowledge_point_ids: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    citations: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    source: Mapped[ReviewVersionSource] = mapped_column(
        Enum(
            ReviewVersionSource,
            name="review_version_source",
            native_enum=False,
            length=16,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    instruction: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    review_flag: Mapped[AIReviewFlag] = relationship(back_populates="versions")


class ReviewRegenerationRun(Base):
    __tablename__ = "review_regeneration_runs"
    __table_args__ = (
        CheckConstraint(
            "progress >= 0 AND progress <= 100",
            name="ck_review_regeneration_runs_progress_range",
        ),
        CheckConstraint(
            "base_version > 0 AND version > 0",
            name="ck_review_regeneration_runs_versions_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    review_flag_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_review_flags.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[ReviewGenerationStatus] = mapped_column(
        Enum(
            ReviewGenerationStatus,
            name="review_generation_run_status",
            native_enum=False,
            length=16,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
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

    review_flag: Mapped[AIReviewFlag] = relationship(back_populates="regeneration_runs")


class ReviewHistoryEntry(Base):
    __tablename__ = "review_history"
    __table_args__ = (
        UniqueConstraint(
            "review_flag_id",
            "sequence",
            name="uq_review_history_flag_sequence",
        ),
        CheckConstraint(
            "sequence > 0 AND version > 0",
            name="ck_review_history_sequence_and_version_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    review_flag_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("ai_review_flags.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[ReviewHistoryAction] = mapped_column(
        Enum(
            ReviewHistoryAction,
            name="review_history_action",
            native_enum=False,
            length=24,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    from_status: Mapped[ReviewStatus] = mapped_column(
        Enum(
            ReviewStatus,
            name="review_history_from_status",
            native_enum=False,
            length=32,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    to_status: Mapped[ReviewStatus] = mapped_column(
        Enum(
            ReviewStatus,
            name="review_history_to_status",
            native_enum=False,
            length=32,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    teacher_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text)
    answer_snapshot: Mapped[str | None] = mapped_column(Text)
    corrected_answer_snapshot: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    review_flag: Mapped[AIReviewFlag] = relationship(back_populates="review_history")
    teacher: Mapped["User | None"] = relationship(foreign_keys=[teacher_id])
