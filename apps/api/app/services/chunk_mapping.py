import re
from collections import defaultdict
from uuid import UUID

from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

MATCH_TEXT_PATTERN = re.compile(r"\s+")


def _match_key(value: str) -> str:
    return MATCH_TEXT_PATTERN.sub("", value).casefold()


async def assign_document_chunks_to_chapters(
    session: AsyncSession,
    document_id: UUID,
    chapters: list[Chapter] | None = None,
) -> int:
    if chapters is None:
        chapters = list(
            await session.scalars(
                select(Chapter)
                .options(
                    selectinload(Chapter.knowledge_points.and_(KnowledgePoint.trashed_at.is_(None)))
                )
                .where(
                    Chapter.document_id == document_id,
                    Chapter.trashed_at.is_(None),
                )
                .order_by(Chapter.order_index, Chapter.id)
            )
        )
    if not chapters:
        return 0

    chunks = list(
        await session.scalars(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id)
            .order_by(KnowledgeChunk.chunk_index, KnowledgeChunk.id)
        )
    )
    if not chunks:
        return 0

    chapter_keys = [
        (
            chapter,
            _match_key(chapter.title),
            [_match_key(point.name) for point in chapter.knowledge_points],
        )
        for chapter in chapters
    ]
    assignments: dict[UUID, UUID] = {}
    matched_indexes: dict[UUID, list[int]] = defaultdict(list)

    for chunk in chunks:
        content_key = _match_key(chunk.content)
        best_chapter_id: UUID | None = None
        best_score = 0
        for chapter, title_key, point_keys in chapter_keys:
            score = 0
            if title_key and title_key in content_key:
                score += 12
            score += sum(
                4 + min(len(point_key), 12)
                for point_key in point_keys
                if point_key and point_key in content_key
            )
            if score > best_score:
                best_score = score
                best_chapter_id = chapter.id
        if best_chapter_id is not None:
            assignments[chunk.id] = best_chapter_id
            matched_indexes[best_chapter_id].append(chunk.chunk_index)

    unassigned = [chunk for chunk in chunks if chunk.id not in assignments]
    if unassigned:
        anchors = sorted(
            (
                sorted(indexes)[len(indexes) // 2],
                chapter_id,
            )
            for chapter_id, indexes in matched_indexes.items()
            if indexes
        )
        if anchors:
            for chunk in unassigned:
                assignments[chunk.id] = min(
                    anchors,
                    key=lambda anchor: (abs(anchor[0] - chunk.chunk_index), anchor[0]),
                )[1]
        else:
            weights = [max(1, len(point_keys)) for _, _, point_keys in chapter_keys]
            total_weight = sum(weights)
            cumulative = 0
            chapter_for_chunk: list[UUID] = []
            for index, weight in enumerate(weights):
                cumulative += weight
                target_count = round(len(chunks) * cumulative / total_weight)
                count = target_count - len(chapter_for_chunk)
                chapter_for_chunk.extend([chapter_keys[index][0].id] * count)
            if len(chapter_for_chunk) != len(chunks):
                chapter_for_chunk.extend([chapters[-1].id] * (len(chunks) - len(chapter_for_chunk)))
            for chunk, chapter_id in zip(chunks, chapter_for_chunk, strict=True):
                assignments[chunk.id] = chapter_id

    chunk_ids_by_chapter: dict[UUID, list[UUID]] = defaultdict(list)
    for chunk_id, chapter_id in assignments.items():
        chunk_ids_by_chapter[chapter_id].append(chunk_id)
    for chapter_id, chunk_ids in chunk_ids_by_chapter.items():
        await session.execute(
            update(KnowledgeChunk)
            .where(KnowledgeChunk.id.in_(chunk_ids))
            .values(chapter_id=chapter_id)
            .execution_options(synchronize_session=False)
        )
    return len(assignments)
