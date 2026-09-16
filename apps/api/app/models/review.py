from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.chat import Conversation, Message
    from app.models.course import Course
    from app.models.user import User


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


class AIReviewFlag(Base):
    __tablename__ = "ai_review_flags"
    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "reason",
            name="uq_ai_review_flags_message_reason",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
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
            name="review_status",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=ReviewStatus.OPEN,
        server_default=ReviewStatus.OPEN.value,
        nullable=False,
    )
    details: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
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
