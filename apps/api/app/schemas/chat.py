from datetime import datetime
from typing import Literal
from uuid import UUID

from database.models.chat import MessageRole, MessageStatus
from database.models.review import ReviewStatus
from pydantic import BaseModel, ConfigDict, Field

ChatAttachmentKind = Literal["image", "audio", "video"]


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ConversationResponse(BaseModel):
    id: UUID
    course_id: UUID
    user_id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CitationResponse(BaseModel):
    citation_index: int
    chunk_id: UUID | None
    document_id: UUID | None
    document_name: str | None = None
    chapter_title: str | None = None
    page_start: int
    page_end: int
    quote: str

    model_config = ConfigDict(from_attributes=True)


class ChatAttachmentResponse(BaseModel):
    id: UUID
    kind: ChatAttachmentKind
    mime_type: str
    file_name: str | None = None
    size_bytes: int | None = None
    width: int | None = None
    height: int | None = None
    duration_seconds: float | None = None
    transcript: str | None = None
    url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ChatAttachmentUploadResponse(BaseModel):
    attachment: ChatAttachmentResponse
    expires_at: datetime | None = None


class ChatModalitiesResponse(BaseModel):
    input_modalities: list[Literal["text", "image", "audio", "video"]]
    output_modalities: list[Literal["text"]]
    attachments_enabled: bool
    message: str | None = None


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    client_request_id: str | None
    status: MessageStatus
    blocks: list[dict[str, object]] = Field(default_factory=list)
    created_at: datetime
    citations: list[CitationResponse] = Field(default_factory=list)
    attachments: list[ChatAttachmentResponse] = Field(default_factory=list, max_length=4)

    model_config = ConfigDict(from_attributes=True)


class TeacherMessageResponse(MessageResponse):
    knowledge_point_ids: list[UUID] = Field(
        default_factory=list,
        alias="knowledgePointIds",
    )
    review_status: ReviewStatus | None = Field(default=None, alias="reviewStatus")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ChatStreamRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    client_request_id: str | None = Field(default=None, max_length=128)
    knowledge_point_id: UUID | None = None
    retrieval_limit: int = Field(default=5, ge=1, le=10)
    attachments: list[ChatAttachmentResponse] = Field(default_factory=list, max_length=4)


class ChatContinueRequest(BaseModel):
    client_request_id: str | None = Field(default=None, max_length=128)
    retrieval_limit: int = Field(default=5, ge=1, le=10)
