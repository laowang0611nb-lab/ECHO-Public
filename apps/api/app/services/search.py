import math
from uuid import UUID

from database.models.course import CourseMember
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.user import UserRole
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.search import ChunkSearchResult
from app.services.course import get_course_for_member
from app.services.embedding import EmbeddingProvider
from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeGenerationForbiddenError,
)


async def embed_document_chunks(
    session: AsyncSession,
    provider: EmbeddingProvider,
    document_id: UUID,
    requester_id: UUID,
    *,
    batch_size: int,
) -> int:
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise KnowledgeDocumentNotFoundError
    if document.status != DocumentStatus.READY:
        raise KnowledgeDocumentNotReadyError

    chunks = list(
        await session.scalars(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id)
            .order_by(KnowledgeChunk.chunk_index)
        )
    )
    if not chunks:
        raise KnowledgeDocumentNotReadyError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == document.course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise KnowledgeGenerationForbiddenError

    vectors: list[list[float]] = []
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors.extend(await provider.embed([chunk.content for chunk in batch]))

    if len(vectors) != len(chunks):
        raise KnowledgeDocumentNotReadyError

    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk.embedding = vector
        chunk.metadata_json = {
            **(chunk.metadata_json or {}),
            "embedding_source": "qwen",
            "embedding_model": settings.embedding_model,
            "embedding_dimension": settings.embedding_dimension,
        }
    await session.commit()
    return len(chunks)


def cosine_distance(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        raise ValueError("embedding dimensions do not match")
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 1.0
    return 1.0 - (dot / (left_norm * right_norm))


async def search_course_chunks(
    session: AsyncSession,
    provider: EmbeddingProvider,
    course_id: UUID,
    requester_id: UUID,
    query: str,
    limit: int,
    max_distance: float | None = None,
) -> list[ChunkSearchResult]:
    threshold = max_distance if max_distance is not None else settings.retrieval_max_distance
    await get_course_for_member(session, course_id, requester_id)
    query_vectors = await provider.embed([query])
    if not query_vectors:
        raise KnowledgeDocumentNotFoundError
    query_vector = query_vectors[0]

    bind = session.get_bind()
    if bind.dialect.name == "postgresql":
        distance_expression = KnowledgeChunk.embedding.cosine_distance(query_vector)
        distance = distance_expression.label("distance")
        rows = await session.execute(
            select(KnowledgeChunk, Document.original_name, Chapter.title, distance)
            .join(Document, Document.id == KnowledgeChunk.document_id)
            .outerjoin(
                Chapter,
                and_(
                    Chapter.id == KnowledgeChunk.chapter_id,
                    Chapter.document_id == KnowledgeChunk.document_id,
                ),
            )
            .where(
                KnowledgeChunk.course_id == course_id,
                Document.status == DocumentStatus.READY,
                Document.trashed_at.is_(None),
                or_(
                    KnowledgeChunk.chapter_id.is_(None),
                    Chapter.trashed_at.is_(None),
                ),
                distance_expression <= threshold,
                KnowledgeChunk.embedding.is_not(None),
            )
            .order_by(distance)
            .limit(limit)
        )
        return [
            ChunkSearchResult(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_name=document_name,
                chapter_title=chapter_title,
                page_start=chunk.page_start,
                page_end=chunk.page_end,
                content=chunk.content,
                distance=float(row_distance),
            )
            for chunk, document_name, chapter_title, row_distance in rows.all()
        ]

    rows = list(
        await session.execute(
            select(KnowledgeChunk, Document.original_name, Chapter.title)
            .join(Document, Document.id == KnowledgeChunk.document_id)
            .outerjoin(
                Chapter,
                and_(
                    Chapter.id == KnowledgeChunk.chapter_id,
                    Chapter.document_id == KnowledgeChunk.document_id,
                ),
            )
            .where(
                KnowledgeChunk.course_id == course_id,
                Document.status == DocumentStatus.READY,
                Document.trashed_at.is_(None),
                or_(
                    KnowledgeChunk.chapter_id.is_(None),
                    Chapter.trashed_at.is_(None),
                ),
                KnowledgeChunk.embedding.is_not(None),
            )
        )
    )
    ranked = sorted(
        (
            (
                cosine_distance(query_vector, chunk.embedding or []),
                chunk,
                document_name,
                chapter_title,
            )
            for chunk, document_name, chapter_title in rows
        ),
        key=lambda item: item[0],
    )
    ranked = [item for item in ranked if item[0] <= threshold]
    return [
        ChunkSearchResult(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_name=document_name,
            chapter_title=chapter_title,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            content=chunk.content,
            distance=distance_value,
        )
        for distance_value, chunk, document_name, chapter_title in ranked[:limit]
    ]


async def load_knowledge_point_chunks(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    limit: int,
) -> list[ChunkSearchResult]:
    rows = list(
        await session.execute(
            select(KnowledgeChunk, Document.original_name, Chapter.title)
            .select_from(KnowledgeChunk)
            .join(
                KnowledgePoint,
                and_(
                    KnowledgePoint.id == knowledge_point_id,
                    KnowledgePoint.chapter_id == KnowledgeChunk.chapter_id,
                ),
            )
            .join(
                Chapter,
                and_(
                    Chapter.id == KnowledgePoint.chapter_id,
                    Chapter.document_id == KnowledgeChunk.document_id,
                ),
            )
            .join(Document, Document.id == KnowledgeChunk.document_id)
            .where(
                KnowledgeChunk.course_id == course_id,
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.status == DocumentStatus.READY,
                Document.trashed_at.is_(None),
            )
            .order_by(KnowledgeChunk.chunk_index)
            .limit(limit)
        )
    )
    return [
        ChunkSearchResult(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_name=document_name,
            chapter_title=chapter_title,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            content=chunk.content,
            distance=0.0,
        )
        for chunk, document_name, chapter_title in rows
    ]
