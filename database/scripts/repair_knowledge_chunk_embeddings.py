from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.config import settings
from app.services.embedding import QwenEmbeddingProvider

from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Repair knowledge chunk chapter mappings and generate embeddings "
            "with the configured Qwen embedding model."
        )
    )
    parser.add_argument("--database-url", default=settings.database_url)
    parser.add_argument("--course-id", type=UUID)
    parser.add_argument("--batch-size", type=int, default=settings.embedding_batch_size)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-reindex", action="store_true")
    return parser.parse_args()


async def _repair_chapter_mappings(
    session: AsyncSession,
    course_id: UUID | None,
    *,
    dry_run: bool,
) -> int:
    statement = (
        select(KnowledgeChunk)
        .join(Chapter, Chapter.id == KnowledgeChunk.chapter_id)
        .where(Chapter.document_id != KnowledgeChunk.document_id)
    )
    if course_id is not None:
        statement = statement.where(KnowledgeChunk.course_id == course_id)
    chunks = list(await session.scalars(statement))
    if dry_run:
        return len(chunks)
    for chunk in chunks:
        chunk.chapter_id = None
        chunk.metadata_json = {
            **(chunk.metadata_json or {}),
            "chapter_mapping_repaired": True,
        }
    await session.commit()
    return len(chunks)


def _needs_embedding(chunk: KnowledgeChunk, *, force: bool) -> bool:
    if force or chunk.embedding is None:
        return True
    metadata = chunk.metadata_json or {}
    return not (
        metadata.get("embedding_source") == "qwen"
        and metadata.get("embedding_model") == settings.embedding_model
        and metadata.get("embedding_dimension") == settings.embedding_dimension
    )


async def _repair_embeddings(
    session: AsyncSession,
    provider: QwenEmbeddingProvider,
    *,
    course_id: UUID | None,
    batch_size: int,
    force: bool,
    dry_run: bool,
) -> int:
    statement = (
        select(KnowledgeChunk)
        .join(Document, Document.id == KnowledgeChunk.document_id)
        .where(
            Document.status == DocumentStatus.READY,
            Document.trashed_at.is_(None),
            KnowledgeChunk.content != "",
        )
        .order_by(
            KnowledgeChunk.course_id,
            KnowledgeChunk.document_id,
            KnowledgeChunk.chunk_index,
        )
    )
    if course_id is not None:
        statement = statement.where(KnowledgeChunk.course_id == course_id)
    candidates = [
        chunk
        for chunk in await session.scalars(statement)
        if _needs_embedding(chunk, force=force)
    ]
    if dry_run:
        return len(candidates)

    completed = 0
    for start in range(0, len(candidates), batch_size):
        batch = candidates[start : start + batch_size]
        vectors = await provider.embed([chunk.content for chunk in batch])
        if len(vectors) != len(batch):
            raise RuntimeError("embedding provider returned the wrong vector count")
        embedded_at = datetime.now(UTC).isoformat()
        for chunk, vector in zip(batch, vectors, strict=True):
            if len(vector) != settings.embedding_dimension:
                raise RuntimeError("embedding provider returned the wrong dimension")
            chunk.embedding = vector
            chunk.metadata_json = {
                **(chunk.metadata_json or {}),
                "embedding_source": "qwen",
                "embedding_model": settings.embedding_model,
                "embedding_dimension": settings.embedding_dimension,
                "embedded_at": embedded_at,
            }
        await session.commit()
        completed += len(batch)
    return completed


async def _reindex(session: AsyncSession) -> None:
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return
    await session.execute(text("ANALYZE knowledge_chunks"))
    await session.execute(text("REINDEX INDEX ix_knowledge_chunks_embedding_hnsw"))
    await session.commit()


async def run(args: argparse.Namespace) -> dict[str, object]:
    if args.batch_size <= 0:
        raise ValueError("--batch-size must be positive")
    engine = create_async_engine(args.database_url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    provider = QwenEmbeddingProvider(
        api_key=settings.embedding_api_key,
        base_url=settings.embedding_base_url,
        model=settings.embedding_model,
        dimension=settings.embedding_dimension,
        timeout_seconds=settings.llm_timeout_seconds,
        batch_size=args.batch_size,
    )
    try:
        async with factory() as session:
            repaired_mappings = await _repair_chapter_mappings(
                session,
                args.course_id,
                dry_run=args.dry_run,
            )
            embedded = await _repair_embeddings(
                session,
                provider,
                course_id=args.course_id,
                batch_size=args.batch_size,
                force=args.force,
                dry_run=args.dry_run,
            )
            if not args.dry_run and not args.skip_reindex:
                await _reindex(session)
            return {
                "databaseUrlKind": args.database_url.split(":", 1)[0],
                "courseId": str(args.course_id) if args.course_id else None,
                "repairedChapterMappings": repaired_mappings,
                "embeddedChunks": embedded,
                "embeddingModel": settings.embedding_model,
                "embeddingDimension": settings.embedding_dimension,
                "dryRun": args.dry_run,
            }
    finally:
        await engine.dispose()


def main() -> int:
    args = _parse_args()
    print(json.dumps(asyncio.run(run(args)), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
