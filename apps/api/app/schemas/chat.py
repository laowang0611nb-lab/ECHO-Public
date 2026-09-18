from datetime import datetime
from uuid import UUID

from database.models.chat import MessageRole
from database.models.review import ReviewStatus
from pydantic import BaseModel, ConfigDict, Field


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
    page_start: int
    page_end: int
    quote: str

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    created_at: datetime
    citations: list[CitationResponse] = Field(default_factory=list)

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
    retrieval_limit: int = Field(default=5, ge=1, le=10)
