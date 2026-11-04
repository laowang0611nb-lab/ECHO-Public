from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
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
    from database.models.document import Document
    from database.models.knowledge import KnowledgeChunk, KnowledgePoint
    from database.models.resource import QuestionItem
    from database.models.user import User


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageStatus(StrEnum):
    SENDING = "sending"
    SENT = "sent"
    STREAMING = "streaming"
    COMPLETE = "complete"
    INTERRUPTED = "interrupted"
    FAILED = "failed"


class ChatAttachmentKind(StrEnum):
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class TeachingIntent(StrEnum):
    CHITCHAT = "chitchat"
    CONCEPT = "concept"
    EXERCISE = "exercise"
    AMBIGUOUS = "ambiguous"
    ATTEMPT = "attempt"
    ANSWER_REQUEST = "answer_request"


class TeachingStage(StrEnum):
    IDLE = "idle"
    CLARIFY_WAITING = "clarify_waiting"
    AWAITING_ATTEMPT = "awaiting_attempt"
    HINTING = "hinting"
    EXPLAINING = "explaining"
    READY_FOR_QUICK_CHECK = "ready_for_quick_check"
    COMPLETED = "completed"


class TeachingPolicy(Base):
    __tablename__ = "teaching_policies"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    course_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("courses.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
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
    updater: Mapped["User"] = relationship()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index(
            "ix_conversations_course_user",
            "course_id",
            "user_id",
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
    title: Mapped[str | None] = mapped_column(String(255))
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
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    teaching_states: Mapped[list["ConversationTeachingState"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationTeachingState.created_at",
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "client_request_id",
            name="uq_messages_conversation_client_request_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    client_request_id: Mapped[str | None] = mapped_column(String(128))
    role: Mapped[MessageRole] = mapped_column(
        Enum(
            MessageRole,
            name="message_role",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    status: Mapped[MessageStatus] = mapped_column(
        Enum(
            MessageStatus,
            name="message_status",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=MessageStatus.COMPLETE,
        server_default=MessageStatus.COMPLETE.value,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    blocks: Mapped[list[dict[str, object]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    citations: Mapped[list["MessageCitation"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="MessageCitation.citation_index",
    )

    attachments: Mapped[list["ChatAttachment"]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="ChatAttachment.created_at",
    )


class ConversationTeachingState(Base):
    __tablename__ = "conversation_teaching_states"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "topic_key",
            name="uq_conversation_teaching_states_topic",
        ),
        CheckConstraint(
            "hint_level >= 0",
            name="ck_conversation_teaching_states_hint_level_nonnegative",
        ),
        CheckConstraint(
            "attempt_count >= 0",
            name="ck_conversation_teaching_states_attempt_count_nonnegative",
        ),
        CheckConstraint(
            "consecutive_incorrect_count >= 0",
            name="ck_conversation_teaching_states_incorrect_count_nonnegative",
        ),
        CheckConstraint(
            "state_version >= 1",
            name="ck_conversation_teaching_states_version_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    knowledge_point_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_points.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    topic_key: Mapped[str] = mapped_column(String(255), nullable=False)
    intent: Mapped[TeachingIntent] = mapped_column(
        Enum(
            TeachingIntent,
            name="teaching_intent",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    stage: Mapped[TeachingStage] = mapped_column(
        Enum(
            TeachingStage,
            name="teaching_stage",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        default=TeachingStage.IDLE,
        server_default=TeachingStage.IDLE.value,
        nullable=False,
    )
    hint_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consecutive_incorrect_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    answer_requested: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    pending_question: Mapped[str | None] = mapped_column(Text)
    last_user_message_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_assistant_message_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    quick_check_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("question_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    state_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    conversation: Mapped[Conversation] = relationship(back_populates="teaching_states")
    knowledge_point: Mapped["KnowledgePoint | None"] = relationship()
    quick_check: Mapped["QuestionItem | None"] = relationship()
    events: Mapped[list["TeachingDialogEvent"]] = relationship(
        back_populates="state",
        cascade="all, delete-orphan",
        order_by="TeachingDialogEvent.created_at",
    )


class TeachingDialogEvent(Base):
    __tablename__ = "teaching_dialog_events"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    state_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversation_teaching_states.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    message_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    from_stage: Mapped[TeachingStage | None] = mapped_column(
        Enum(
            TeachingStage,
            name="teaching_event_from_stage",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=True,
    )
    to_stage: Mapped[TeachingStage] = mapped_column(
        Enum(
            TeachingStage,
            name="teaching_event_to_stage",
            native_enum=False,
            length=32,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    state: Mapped[ConversationTeachingState] = relationship(back_populates="events")


class ChatAttachment(Base):
    __tablename__ = "chat_attachments"
    __table_args__ = (
        CheckConstraint(
            "size_bytes >= 0",
            name="ck_chat_attachments_size_bytes_nonnegative",
        ),
        CheckConstraint(
            "width IS NULL OR width > 0",
            name="ck_chat_attachments_width_positive",
        ),
        CheckConstraint(
            "height IS NULL OR height > 0",
            name="ck_chat_attachments_height_positive",
        ),
        CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds >= 0",
            name="ck_chat_attachments_duration_nonnegative",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
    )
    message_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True,
    )
    kind: Mapped[ChatAttachmentKind] = mapped_column(
        Enum(
            ChatAttachmentKind,
            name="chat_attachment_kind",
            native_enum=False,
            length=16,
            create_constraint=True,
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
    )
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(
        String(512), unique=True, index=True, nullable=False
    )
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    transcript: Mapped[str | None] = mapped_column(Text)
    model_file_url: Mapped[str | None] = mapped_column(Text)
    model_file_model: Mapped[str | None] = mapped_column(String(120))
    model_file_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()
    conversation: Mapped["Conversation"] = relationship()
    message: Mapped["Message | None"] = relationship(back_populates="attachments")

    @property
    def url(self) -> str:
        return f"/api/v1/chat/attachments/{self.id}/file"


class MessageCitation(Base):
    __tablename__ = "message_citations"
    __table_args__ = (
        CheckConstraint(
            "page_start > 0 AND page_end >= page_start",
            name="ck_message_citations_page_range",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    message_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    citation_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("knowledge_chunks.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    document_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    page_start: Mapped[int] = mapped_column(Integer, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False)
    document_name: Mapped[str | None] = mapped_column(String(512))
    chapter_title: Mapped[str | None] = mapped_column(String(255))
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    message: Mapped[Message] = relationship(back_populates="citations")
    chunk: Mapped["KnowledgeChunk | None"] = relationship()
    document: Mapped["Document | None"] = relationship()
