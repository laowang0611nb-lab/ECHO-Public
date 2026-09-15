from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgePointDraft(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class ChapterDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=2000)
    knowledge_points: list[KnowledgePointDraft] = Field(default_factory=list)


class KnowledgePointResponse(KnowledgePointDraft):
    id: UUID
    course_id: UUID
    chapter_id: UUID
    order_index: int

    model_config = ConfigDict(from_attributes=True)


class ChapterResponse(ChapterDraft):
    id: UUID
    course_id: UUID
    document_id: UUID
    order_index: int
    knowledge_points: list[KnowledgePointResponse]

    model_config = ConfigDict(from_attributes=True)
