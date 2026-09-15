from uuid import UUID

from pydantic import BaseModel, Field


class EmbeddingResponse(BaseModel):
    document_id: UUID
    embedded_chunks: int


class ChunkSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    limit: int = Field(default=5, ge=1, le=20)


class ChunkSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    page_start: int
    page_end: int
    content: str
    distance: float
