from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
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
    from database.models.document import Document
    from database.models.knowledge import KnowledgeChunk
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
