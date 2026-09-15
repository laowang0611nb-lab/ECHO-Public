from uuid import UUID

from pydantic import BaseModel, ConfigDict


class KnowledgeChunkResponse(BaseModel):
    id: UUID
    course_id: UUID
    document_id: UUID
    chapter_id: UUID | None
    chunk_index: int
    page_start: int
    page_end: int
    content: str
    char_count: int

    model_config = ConfigDict(from_attributes=True)
