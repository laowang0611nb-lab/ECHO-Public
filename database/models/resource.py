from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.db.base_class import Base

if TYPE_CHECKING:
    from database.models.course import Course
    from database.models.document import Document
    from database.models.knowledge import KnowledgePoint
    from database.models.user import User


class QuestionType(StrEnum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"
    SHORT_ANSWER = "short_answer"
    CODING = "coding"
    EXPERIMENT = "experiment"


class QuestionDifficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ExternalResourceStatus(StrEnum):
    UNCHECKED = "unchecked"
    VALID = "valid"
    INVALID = "invalid"
    UNKNOWN = "unknown"


question_item_knowledge_points = Table(
    "question_item_knowledge_points",
    Base.metadata,
    Column(
        "question_item_id",
        Uuid(as_uuid=True),
        ForeignKey("question_items.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "knowledge_point_id",
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


external_resource_knowledge_points = Table(
    "external_resource_knowledge_points",
    Base.metadata,
    Column(
        "external_resource_id",
        Uuid(as_uuid=True),
        ForeignKey("external_resources.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "knowledge_point_id",
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class QuestionItem(Base):
    __tablename__ = "question_items"
    __table_args__ = (
        CheckConstraint(
            "source_page IS NULL OR source_page > 0",
            name="ck_question_items_source_page_positive",
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
    type: Mapped[QuestionType] = mapped_column(
        Enum(
            QuestionType,
            name="question_item_type",
            native_enum=False,
            length=24,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        Enum(
            QuestionDifficulty,
            name="question_item_difficulty",
            native_enum=False,
            length=16,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=QuestionDifficulty.MEDIUM,
        server_default=QuestionDifficulty.MEDIUM.value,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    source_document_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
    )
    source_page: Mapped[int | None] = mapped_column(Integer)
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    source_document: Mapped["Document | None"] = relationship()
    creator: Mapped["User"] = relationship()
    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary=question_item_knowledge_points,
        order_by="KnowledgePoint.order_index",
    )


class ExternalResource(Base):
    __tablename__ = "external_resources"

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
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    check_status: Mapped[ExternalResourceStatus] = mapped_column(
        Enum(
            ExternalResourceStatus,
            name="external_resource_status",
            native_enum=False,
            length=16,
            create_constraint=False,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=ExternalResourceStatus.UNCHECKED,
        server_default=ExternalResourceStatus.UNCHECKED.value,
        nullable=False,
    )
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    creator: Mapped["User"] = relationship()
    knowledge_points: Mapped[list["KnowledgePoint"]] = relationship(
        secondary=external_resource_knowledge_points,
        order_by="KnowledgePoint.order_index",
    )
