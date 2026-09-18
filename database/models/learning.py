from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
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
    from database.models.knowledge import KnowledgePoint
    from database.models.user import User


class LearningEventType(StrEnum):
    QUESTION_ASKED = "question_asked"
    HINT_REQUESTED = "hint_requested"
    QUIZ_CORRECT = "quiz_correct"
    QUIZ_WRONG = "quiz_wrong"
    CONCEPT_CONFUSION = "concept_confusion"
    REPEATED_ERROR = "repeated_error"
    RESOLVED = "resolved"
    TEACHER_ADJUSTMENT = "teacher_adjustment"


class LearningEvent(Base):
    __tablename__ = "learning_events"
    __table_args__ = (
        CheckConstraint(
            "week_number IS NULL OR week_number >= 1",
            name="ck_learning_events_week_number_positive",
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
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    knowledge_point_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    message_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    plan_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("execution_plans.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    task_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("plan_tasks.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    week_number: Mapped[int | None] = mapped_column(Integer)
    event_type: Mapped[LearningEventType] = mapped_column(
        Enum(
            LearningEventType,
            name="learning_event_type",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    evidence: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    course: Mapped["Course"] = relationship()
    user: Mapped["User"] = relationship()
    knowledge_point: Mapped["KnowledgePoint | None"] = relationship()
    conversation: Mapped["Conversation | None"] = relationship()
    message: Mapped["Message | None"] = relationship()

    @property
    def result(self) -> str:
        if self.event_type == LearningEventType.QUIZ_CORRECT:
            return "correct"
        if self.event_type == LearningEventType.QUIZ_WRONG:
            return "wrong"
        if self.event_type in {
            LearningEventType.RESOLVED,
            LearningEventType.TEACHER_ADJUSTMENT,
        }:
            return "completed"
        return "unresolved"


class StudentKnowledgeState(Base):
    __tablename__ = "student_knowledge_states"
    __table_args__ = (
        UniqueConstraint(
            "course_id",
            "user_id",
            "knowledge_point_id",
            name="uq_student_knowledge_state_identity",
        ),
        CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_student_knowledge_states_score_range",
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
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    knowledge_point_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
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
    user: Mapped["User"] = relationship()
    knowledge_point: Mapped["KnowledgePoint"] = relationship()


class MasterySnapshot(Base):
    __tablename__ = "mastery_snapshots"
    __table_args__ = (
        CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_mastery_snapshots_score_range",
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
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    knowledge_point_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_event_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("learning_events.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    course: Mapped["Course"] = relationship()
    user: Mapped["User"] = relationship()
    knowledge_point: Mapped["KnowledgePoint"] = relationship()
    source_event: Mapped["LearningEvent | None"] = relationship()
