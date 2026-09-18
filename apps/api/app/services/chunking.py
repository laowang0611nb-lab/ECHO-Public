import re
from dataclasses import dataclass
from uuid import UUID

from database.models.course import CourseMember
from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import KnowledgeChunk
from database.models.user import UserRole
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeGenerationForbiddenError,
)


@dataclass(frozen=True)
class ChunkDraft:
    chunk_index: int
    page_start: int
    page_end: int
    content: str
    char_count: int


def chunk_pages(
    pages: list[str],
    *,
    chunk_size: int,
    overlap: int,
) -> list[ChunkDraft]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and smaller than chunk_size")

    chunks: list[ChunkDraft] = []
    chunk_index = 0
    for page_number, page_text in enumerate(pages, start=1):
        normalized = re.sub(r"\s+", " ", page_text).strip()
        start = 0
        while start < len(normalized):
            end = min(start + chunk_size, len(normalized))
            content = normalized[start:end].strip()
            if content:
                chunks.append(
                    ChunkDraft(
                        chunk_index=chunk_index,
                        page_start=page_number,
                        page_end=page_number,
                        content=content,
                        char_count=len(content),
                    )
                )
                chunk_index += 1
            if end == len(normalized):
                break
            start = end - overlap
    return chunks


async def chunk_document(
    session: AsyncSession,
    document_id: UUID,
    requester_id: UUID,
    *,
    chunk_size: int,
    overlap: int,
) -> list[KnowledgeChunk]:
    document = await session.scalar(
        select(Document).where(Document.id == document_id).with_for_update()
    )
    if document is None:
        raise KnowledgeDocumentNotFoundError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == document.course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise KnowledgeGenerationForbiddenError

    if document.status != DocumentStatus.READY:
        raise KnowledgeDocumentNotReadyError

    pages = list(
        await session.scalars(
            select(DocumentPage.text)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number)
        )
    )
    if not pages:
        raise KnowledgeDocumentNotReadyError

    drafts = chunk_pages(
        [page or "" for page in pages],
        chunk_size=chunk_size,
        overlap=overlap,
    )
    if not drafts:
        raise KnowledgeDocumentNotReadyError

    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))
    session.add_all(
        [
            KnowledgeChunk(
                course_id=document.course_id,
                document_id=document_id,
                chunk_index=draft.chunk_index,
                page_start=draft.page_start,
                page_end=draft.page_end,
                content=draft.content,
                char_count=draft.char_count,
                metadata_json={"source": "document_page"},
            )
            for draft in drafts
        ]
    )
    await session.commit()

    result = await session.scalars(
        select(KnowledgeChunk)
        .where(KnowledgeChunk.document_id == document_id)
        .order_by(KnowledgeChunk.chunk_index)
    )
    return list(result)
