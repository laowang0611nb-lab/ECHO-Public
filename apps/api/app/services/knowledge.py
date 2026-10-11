from datetime import UTC, datetime
from uuid import UUID, uuid4

from database.models.course import CourseMember
from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import (
    Chapter,
    KnowledgeChunk,
    KnowledgePoint,
    KnowledgeRelation,
)
from database.models.learning import LearningEvent, MasterySnapshot, StudentKnowledgeState
from database.models.user import UserRole
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.knowledge import (
    ChapterCreate,
    ChapterDraft,
    ChapterUpdate,
    KnowledgePointCreate,
    KnowledgePointMergeRequest,
    KnowledgePointUpdate,
    KnowledgeRelationDraft,
    KnowledgeRelationPointDraft,
)
from app.services.chunk_mapping import assign_document_chunks_to_chapters
from app.services.course import get_course_for_member
from app.services.llm import KnowledgeStructureProvider


class KnowledgeDocumentNotFoundError(Exception):
    pass


class KnowledgeDocumentNotReadyError(Exception):
    pass


class KnowledgeGenerationForbiddenError(Exception):
    pass


class KnowledgeStructureEmptyError(Exception):
    pass


class KnowledgeStructureConflictError(Exception):
    pass


class KnowledgeEditForbiddenError(Exception):
    pass


class KnowledgeNodeNotFoundError(Exception):
    pass


REORDER_OFFSET = 100000


async def _replace_document_structure(
    session: AsyncSession,
    document: Document,
    drafts: list[ChapterDraft],
    point_key_map: dict[str, UUID] | None = None,
) -> list[Chapter]:
    existing_chapters = list(
        await session.scalars(
            select(Chapter)
            .options(
                selectinload(Chapter.knowledge_points.and_(KnowledgePoint.trashed_at.is_(None)))
            )
            .where(Chapter.document_id == document.id, Chapter.trashed_at.is_(None))
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    existing_chapter_ids = [chapter.id for chapter in existing_chapters]
    if existing_chapter_ids:
        await session.execute(
            update(Chapter)
            .where(Chapter.id.in_(existing_chapter_ids))
            .values(order_index=Chapter.order_index + REORDER_OFFSET)
        )
        await session.execute(
            update(KnowledgePoint)
            .where(
                KnowledgePoint.chapter_id.in_(existing_chapter_ids),
                KnowledgePoint.trashed_at.is_(None),
            )
            .values(order_index=KnowledgePoint.order_index + REORDER_OFFSET)
        )

    chapters_by_title: dict[str, list[Chapter]] = {}
    points_by_name: dict[str, list[KnowledgePoint]] = {}
    for chapter in existing_chapters:
        chapters_by_title.setdefault(chapter.title.casefold(), []).append(chapter)
        for point in chapter.knowledge_points:
            if point.trashed_at is not None:
                continue
            points_by_name.setdefault(point.name.casefold(), []).append(point)

    reused_chapter_ids: set[UUID] = set()
    reused_point_ids: set[UUID] = set()
    chapters: list[Chapter] = []
    for chapter_index, draft in enumerate(drafts):
        title_key = draft.title.casefold()
        chapter = next(
            (
                candidate
                for candidate in chapters_by_title.get(title_key, [])
                if candidate.id not in reused_chapter_ids
            ),
            None,
        )
        if chapter is None:
            chapter = Chapter(
                course_id=document.course_id,
                document_id=document.id,
                title=draft.title,
                summary=draft.summary,
                order_index=chapter_index,
            )
            session.add(chapter)
        else:
            chapter.title = draft.title
            chapter.summary = draft.summary
            chapter.order_index = chapter_index
            reused_chapter_ids.add(chapter.id)

        existing_points = {
            point.name.casefold(): point
            for point in chapter.knowledge_points
            if point.trashed_at is None and point.id not in reused_point_ids
        }
        for point_index, point_draft in enumerate(draft.knowledge_points):
            name_key = point_draft.name.casefold()
            point = existing_points.get(name_key)
            fallback_points = points_by_name.get(name_key, [])
            if point is None and len(fallback_points) == 1:
                fallback = fallback_points[0]
                if fallback.id not in reused_point_ids:
                    point = fallback

            if point is None:
                point = KnowledgePoint(
                    id=uuid4(),
                    course_id=document.course_id,
                    chapter=chapter,
                    name=point_draft.name,
                    description=point_draft.description,
                    order_index=point_index,
                )
                session.add(point)
            else:
                point.chapter = chapter
                point.name = point_draft.name
                point.description = point_draft.description
                point.order_index = point_index
                reused_point_ids.add(point.id)
            if point_key_map is not None:
                point_key_map[f"c{chapter_index}:p{point_index}"] = point.id
        chapters.append(chapter)

    await session.flush()
    existing_point_ids = {
        point.id for chapter in existing_chapters for point in chapter.knowledge_points
    }
    preserved_point_ids = (
        set(point_key_map.values()) if point_key_map is not None else reused_point_ids
    )
    await _remove_knowledge_points(
        session,
        list(existing_point_ids - preserved_point_ids),
    )

    unused_chapter_ids = set(existing_chapter_ids) - reused_chapter_ids
    if unused_chapter_ids:
        await session.execute(
            update(KnowledgeChunk)
            .where(KnowledgeChunk.chapter_id.in_(unused_chapter_ids))
            .values(chapter_id=None)
        )
        await session.execute(delete(Chapter).where(Chapter.id.in_(unused_chapter_ids)))

    await assign_document_chunks_to_chapters(session, document.id, chapters)
    return chapters


def _draft_relation_points(
    drafts: list[ChapterDraft],
) -> list[KnowledgeRelationPointDraft]:
    points: list[KnowledgeRelationPointDraft] = []
    for chapter_index, draft in enumerate(drafts):
        for point_index, point in enumerate(draft.knowledge_points):
            points.append(
                KnowledgeRelationPointDraft(
                    key=f"c{chapter_index}:p{point_index}",
                    name=point.name,
                    description=point.description,
                    chapter_title=draft.title,
                    chapter_order=chapter_index,
                )
            )
    return points


def _structural_relation_fallback(
    drafts: list[ChapterDraft],
) -> list[KnowledgeRelationDraft]:
    relations: list[KnowledgeRelationDraft] = []
    previous_last_key: str | None = None
    for chapter_index, draft in enumerate(drafts):
        keys = [
            f"c{chapter_index}:p{point_index}" for point_index in range(len(draft.knowledge_points))
        ]
        if previous_last_key is not None and keys:
            relations.append(
                KnowledgeRelationDraft(
                    source_key=previous_last_key,
                    target_key=keys[0],
                    relation_type="prerequisite",
                    reason="章节顺序前置",
                )
            )
        for source_key, target_key in zip(keys, keys[1:], strict=False):
            relations.append(
                KnowledgeRelationDraft(
                    source_key=source_key,
                    target_key=target_key,
                    relation_type="prerequisite",
                    reason="同章节学习顺序",
                )
            )
        if keys:
            previous_last_key = keys[-1]
    return relations


def _structural_relation_fallback_for_groups(
    groups: list[list[str]],
) -> list[KnowledgeRelationDraft]:
    relations: list[KnowledgeRelationDraft] = []
    previous_last_key: str | None = None
    for keys in groups:
        if previous_last_key is not None and keys:
            relations.append(
                KnowledgeRelationDraft(
                    source_key=previous_last_key,
                    target_key=keys[0],
                    relation_type="prerequisite",
                    reason="章节顺序前置",
                )
            )
        for source_key, target_key in zip(keys, keys[1:], strict=False):
            relations.append(
                KnowledgeRelationDraft(
                    source_key=source_key,
                    target_key=target_key,
                    relation_type="prerequisite",
                    reason="同章节学习顺序",
                )
            )
        if keys:
            previous_last_key = keys[-1]
    return relations


def _merge_relation_drafts(
    primary: list[KnowledgeRelationDraft],
    fallback: list[KnowledgeRelationDraft],
) -> list[KnowledgeRelationDraft]:
    merged: list[KnowledgeRelationDraft] = []
    seen_pairs: set[tuple[str, str]] = set()
    for relation in [*primary, *fallback]:
        pair = tuple(sorted((relation.source_key, relation.target_key)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        merged.append(relation)
    return merged


async def _replace_document_relations(
    session: AsyncSession,
    document: Document,
    point_key_map: dict[str, UUID],
    relation_drafts: list[KnowledgeRelationDraft],
) -> None:
    point_ids = set(point_key_map.values())
    if point_ids:
        await session.execute(
            delete(KnowledgeRelation).where(
                KnowledgeRelation.source_knowledge_point_id.in_(point_ids),
                KnowledgeRelation.target_knowledge_point_id.in_(point_ids),
            )
        )
    seen: set[tuple[UUID, UUID, str]] = set()
    for relation in relation_drafts:
        source_id = point_key_map.get(relation.source_key)
        target_id = point_key_map.get(relation.target_key)
        if source_id is None or target_id is None or source_id == target_id:
            continue
        key = (source_id, target_id, relation.relation_type)
        if key in seen:
            continue
        seen.add(key)
        session.add(
            KnowledgeRelation(
                course_id=document.course_id,
                source_knowledge_point_id=source_id,
                target_knowledge_point_id=target_id,
                relation_type=relation.relation_type,
            )
        )


async def generate_document_structure(
    session: AsyncSession,
    provider: KnowledgeStructureProvider,
    document_id: UUID,
    requester_id: UUID,
) -> list[Chapter]:
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.trashed_at.is_(None),
        )
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

    page_texts = [text or "" for text in pages]
    drafts: list[ChapterDraft] = await provider.generate(page_texts)
    if not drafts:
        raise KnowledgeStructureEmptyError

    relation_points = _draft_relation_points(drafts)
    relation_generator = getattr(provider, "generate_relations", None)
    relation_drafts: list[KnowledgeRelationDraft] = []
    if callable(relation_generator) and len(relation_points) >= 2:
        relation_drafts = await relation_generator(relation_points)
    relation_drafts = _merge_relation_drafts(
        relation_drafts,
        _structural_relation_fallback(drafts),
    )

    try:
        point_key_map: dict[str, UUID] = {}
        chapters = await _replace_document_structure(
            session,
            document,
            drafts,
            point_key_map=point_key_map,
        )
        await _replace_document_relations(
            session,
            document,
            point_key_map,
            relation_drafts,
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    chapter_ids = [chapter.id for chapter in chapters]
    session.expire_all()
    result = await session.scalars(
        select(Chapter)
        .options(selectinload(Chapter.knowledge_points.and_(KnowledgePoint.trashed_at.is_(None))))
        .execution_options(populate_existing=True)
        .where(Chapter.id.in_(chapter_ids))
        .order_by(Chapter.order_index)
    )
    return list(result)


async def generate_document_relations(
    session: AsyncSession,
    provider: KnowledgeStructureProvider,
    document_id: UUID,
    requester_id: UUID,
) -> dict[str, UUID | int]:
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.trashed_at.is_(None),
        )
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

    chapters = list(
        await session.scalars(
            select(Chapter)
            .where(
                Chapter.document_id == document_id,
                Chapter.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    relation_points: list[KnowledgeRelationPointDraft] = []
    groups: list[list[str]] = []
    for chapter in chapters:
        points = list(
            await session.scalars(
                select(KnowledgePoint)
                .where(
                    KnowledgePoint.chapter_id == chapter.id,
                    KnowledgePoint.trashed_at.is_(None),
                )
                .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
            )
        )
        keys: list[str] = []
        for point in points:
            key = f"p:{point.id}"
            keys.append(key)
            relation_points.append(
                KnowledgeRelationPointDraft(
                    key=key,
                    name=point.name,
                    description=point.description,
                    chapter_title=chapter.title,
                    chapter_order=chapter.order_index,
                )
            )
        groups.append(keys)
    if not relation_points:
        raise KnowledgeStructureEmptyError

    relation_generator = getattr(provider, "generate_relations", None)
    model_relations: list[KnowledgeRelationDraft] = []
    if callable(relation_generator):
        model_relations = await relation_generator(relation_points)
    relation_drafts = _merge_relation_drafts(
        model_relations,
        _structural_relation_fallback_for_groups(groups),
    )
    point_key_map = {point.key: UUID(point.key.removeprefix("p:")) for point in relation_points}
    try:
        await _replace_document_relations(
            session,
            document,
            point_key_map,
            relation_drafts,
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    return {
        "document_id": document.id,
        "relation_count": len(relation_drafts),
        "prerequisite_count": sum(
            1 for relation in relation_drafts if relation.relation_type == "prerequisite"
        ),
        "related_count": sum(
            1 for relation in relation_drafts if relation.relation_type == "related"
        ),
    }


async def list_course_chapters(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> list[Chapter]:
    await get_course_for_member(session, course_id, requester_id)
    result = await session.scalars(
        select(Chapter)
        .join(Document, Document.id == Chapter.document_id)
        .options(selectinload(Chapter.knowledge_points.and_(KnowledgePoint.trashed_at.is_(None))))
        .where(
            Chapter.course_id == course_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .order_by(Chapter.order_index)
    )
    return list(result)


async def _ensure_course_teacher(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> None:
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise KnowledgeEditForbiddenError


async def _load_chapter(session: AsyncSession, chapter_id: UUID) -> Chapter | None:
    return await session.scalar(
        select(Chapter)
        .join(Document, Document.id == Chapter.document_id)
        .options(selectinload(Chapter.knowledge_points.and_(KnowledgePoint.trashed_at.is_(None))))
        .execution_options(populate_existing=True)
        .where(
            Chapter.id == chapter_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
    )


async def _remove_knowledge_points(
    session: AsyncSession,
    point_ids: list[UUID],
) -> None:
    if not point_ids:
        return

    await session.execute(
        delete(KnowledgeRelation).where(
            or_(
                KnowledgeRelation.source_knowledge_point_id.in_(point_ids),
                KnowledgeRelation.target_knowledge_point_id.in_(point_ids),
            )
        )
    )
    await session.execute(
        update(LearningEvent)
        .where(LearningEvent.knowledge_point_id.in_(point_ids))
        .values(knowledge_point_id=None)
    )
    await session.execute(
        delete(MasterySnapshot).where(MasterySnapshot.knowledge_point_id.in_(point_ids))
    )
    await session.execute(
        delete(StudentKnowledgeState).where(StudentKnowledgeState.knowledge_point_id.in_(point_ids))
    )
    await session.execute(delete(KnowledgePoint).where(KnowledgePoint.id.in_(point_ids)))


async def _set_chapter_order(
    session: AsyncSession,
    document_id: UUID,
    ordered_ids: list[UUID],
) -> None:
    await session.execute(
        update(Chapter)
        .where(
            Chapter.document_id == document_id,
            Chapter.trashed_at.is_(None),
        )
        .values(order_index=Chapter.order_index + REORDER_OFFSET)
    )
    for index, chapter_id in enumerate(ordered_ids):
        await session.execute(
            update(Chapter)
            .where(Chapter.id == chapter_id, Chapter.trashed_at.is_(None))
            .values(order_index=index)
        )


async def _set_point_order(
    session: AsyncSession,
    chapter_id: UUID,
    ordered_ids: list[UUID],
) -> None:
    await session.execute(
        update(KnowledgePoint)
        .where(KnowledgePoint.chapter_id == chapter_id, KnowledgePoint.trashed_at.is_(None))
        .values(order_index=KnowledgePoint.order_index + REORDER_OFFSET)
    )
    for index, point_id in enumerate(ordered_ids):
        await session.execute(
            update(KnowledgePoint)
            .where(KnowledgePoint.id == point_id, KnowledgePoint.trashed_at.is_(None))
            .values(order_index=index)
        )


async def create_chapter(
    session: AsyncSession,
    document_id: UUID,
    requester_id: UUID,
    payload: ChapterCreate,
) -> Chapter:
    document = await session.scalar(
        select(Document)
        .where(
            Document.id == document_id,
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if document is None:
        raise KnowledgeDocumentNotFoundError
    await _ensure_course_teacher(session, document.course_id, requester_id)

    existing_ids = list(
        await session.scalars(
            select(Chapter.id)
            .where(
                Chapter.document_id == document_id,
                Chapter.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    position = (
        min(payload.order_index, len(existing_ids))
        if payload.order_index is not None
        else len(existing_ids)
    )
    chapter = Chapter(
        course_id=document.course_id,
        document_id=document.id,
        title=payload.title,
        summary=payload.summary,
        order_index=len(existing_ids) + REORDER_OFFSET,
    )
    session.add(chapter)
    try:
        await session.flush()
        ordered_ids = existing_ids.copy()
        ordered_ids.insert(position, chapter.id)
        await _set_chapter_order(session, document_id, ordered_ids)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    created = await _load_chapter(session, chapter.id)
    if created is None:
        raise KnowledgeNodeNotFoundError
    return created


async def update_chapter(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
    payload: ChapterUpdate,
) -> Chapter:
    chapter = await _load_chapter(session, chapter_id)
    if chapter is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)

    if "title" in payload.model_fields_set and payload.title is not None:
        chapter.title = payload.title
    if "summary" in payload.model_fields_set:
        chapter.summary = payload.summary
    if "order_index" in payload.model_fields_set and payload.order_index is not None:
        await session.scalar(
            select(Document.id).where(Document.id == chapter.document_id).with_for_update()
        )
        ordered_ids = list(
            await session.scalars(
                select(Chapter.id)
                .where(
                    Chapter.document_id == chapter.document_id,
                    Chapter.trashed_at.is_(None),
                )
                .order_by(Chapter.order_index, Chapter.id)
            )
        )
        ordered_ids.remove(chapter.id)
        position = min(payload.order_index, len(ordered_ids))
        ordered_ids.insert(position, chapter.id)
        await _set_chapter_order(session, chapter.document_id, ordered_ids)

    await session.commit()
    updated = await _load_chapter(session, chapter.id)
    if updated is None:
        raise KnowledgeNodeNotFoundError
    return updated


async def delete_chapter(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
) -> None:
    chapter = await session.scalar(
        select(Chapter)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            Chapter.id == chapter_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if chapter is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)
    chapter.trashed_at = datetime.now(UTC)
    await session.commit()


async def restore_chapter(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
) -> Chapter:
    chapter = await session.scalar(
        select(Chapter)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            Chapter.id == chapter_id,
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if chapter is None or chapter.trashed_at is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)
    conflict = await session.scalar(
        select(Chapter.id).where(
            Chapter.document_id == chapter.document_id,
            Chapter.order_index == chapter.order_index,
            Chapter.trashed_at.is_(None),
        )
    )
    if conflict is not None:
        maximum = await session.scalar(
            select(func.max(Chapter.order_index)).where(
                Chapter.document_id == chapter.document_id,
                Chapter.trashed_at.is_(None),
            )
        )
        chapter.order_index = (maximum or -1) + 1
    chapter.trashed_at = None
    await session.commit()
    await session.refresh(chapter)
    return chapter


async def purge_chapter(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
    *,
    commit: bool = True,
) -> int:
    chapter = await session.scalar(
        select(Chapter).where(Chapter.id == chapter_id).with_for_update()
    )
    if chapter is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)
    point_ids = list(
        await session.scalars(
            select(KnowledgePoint.id).where(KnowledgePoint.chapter_id == chapter_id)
        )
    )
    affected_references = (
        await session.scalar(
            select(func.count())
            .select_from(LearningEvent)
            .where(LearningEvent.knowledge_point_id.in_(point_ids))
        )
        if point_ids
        else 0
    )
    await _remove_knowledge_points(session, point_ids)
    await session.execute(
        update(KnowledgeChunk)
        .where(KnowledgeChunk.chapter_id == chapter_id)
        .values(chapter_id=None)
    )
    await session.delete(chapter)
    await session.flush()
    remaining_ids = list(
        await session.scalars(
            select(Chapter.id)
            .where(
                Chapter.document_id == chapter.document_id,
                Chapter.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    await _set_chapter_order(session, chapter.document_id, remaining_ids)
    if commit:
        await session.commit()
    return int(affected_references or 0)


async def create_knowledge_point(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
    payload: KnowledgePointCreate,
) -> KnowledgePoint:
    chapter = await session.scalar(
        select(Chapter)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            Chapter.id == chapter_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if chapter is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)

    existing_ids = list(
        await session.scalars(
            select(KnowledgePoint.id)
            .where(KnowledgePoint.chapter_id == chapter_id, KnowledgePoint.trashed_at.is_(None))
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    position = (
        min(payload.order_index, len(existing_ids))
        if payload.order_index is not None
        else len(existing_ids)
    )
    point = KnowledgePoint(
        course_id=chapter.course_id,
        chapter_id=chapter.id,
        name=payload.name,
        description=payload.description,
        order_index=len(existing_ids) + REORDER_OFFSET,
    )
    session.add(point)
    try:
        await session.flush()
        ordered_ids = existing_ids.copy()
        ordered_ids.insert(position, point.id)
        await _set_point_order(session, chapter_id, ordered_ids)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    await session.refresh(point)
    return point


async def update_knowledge_point(
    session: AsyncSession,
    point_id: UUID,
    requester_id: UUID,
    payload: KnowledgePointUpdate,
) -> KnowledgePoint:
    point = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == point_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if point is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)

    source_chapter_id = point.chapter_id
    target_chapter_id = source_chapter_id
    if "chapter_id" in payload.model_fields_set and payload.chapter_id is not None:
        target_chapter = await session.scalar(
            select(Chapter)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.id == payload.chapter_id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .with_for_update()
        )
        if target_chapter is None:
            raise KnowledgeNodeNotFoundError
        if target_chapter.course_id != point.course_id:
            raise KnowledgeEditForbiddenError
        await _ensure_course_teacher(session, target_chapter.course_id, requester_id)
        point.chapter_id = target_chapter.id
        target_chapter_id = target_chapter.id

    locked_chapter_ids = sorted({source_chapter_id, target_chapter_id}, key=str)
    await session.scalars(
        select(Chapter)
        .where(Chapter.id.in_(locked_chapter_ids))
        .order_by(Chapter.id)
        .with_for_update()
    )

    if "name" in payload.model_fields_set and payload.name is not None:
        point.name = payload.name
    if "description" in payload.model_fields_set:
        point.description = payload.description

    try:
        await session.flush()
        if target_chapter_id != source_chapter_id:
            source_ids = list(
                await session.scalars(
                    select(KnowledgePoint.id)
                    .where(
                        KnowledgePoint.chapter_id == source_chapter_id,
                        KnowledgePoint.trashed_at.is_(None),
                    )
                    .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
                )
            )
            await _set_point_order(session, source_chapter_id, source_ids)

            target_ids = list(
                await session.scalars(
                    select(KnowledgePoint.id)
                    .where(
                        KnowledgePoint.chapter_id == target_chapter_id,
                        KnowledgePoint.trashed_at.is_(None),
                    )
                    .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
                )
            )
            target_ids.remove(point.id)
            position = (
                min(payload.order_index, len(target_ids))
                if payload.order_index is not None
                else len(target_ids)
            )
            target_ids.insert(position, point.id)
            await _set_point_order(session, target_chapter_id, target_ids)
        elif "order_index" in payload.model_fields_set and payload.order_index is not None:
            ordered_ids = list(
                await session.scalars(
                    select(KnowledgePoint.id)
                    .where(
                        KnowledgePoint.chapter_id == target_chapter_id,
                        KnowledgePoint.trashed_at.is_(None),
                    )
                    .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
                )
            )
            ordered_ids.remove(point.id)
            position = min(payload.order_index, len(ordered_ids))
            ordered_ids.insert(position, point.id)
            await _set_point_order(session, target_chapter_id, ordered_ids)

        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    await session.refresh(point)
    return point


async def delete_knowledge_point(
    session: AsyncSession,
    point_id: UUID,
    requester_id: UUID,
) -> None:
    point = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == point_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if point is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)
    point.trashed_at = datetime.now(UTC)
    await session.commit()


async def restore_knowledge_point(
    session: AsyncSession,
    point_id: UUID,
    requester_id: UUID,
) -> KnowledgePoint:
    point = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == point_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .with_for_update()
    )
    if point is None or point.trashed_at is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)
    name_conflict = await session.scalar(
        select(KnowledgePoint.id).where(
            KnowledgePoint.chapter_id == point.chapter_id,
            KnowledgePoint.name == point.name,
            KnowledgePoint.trashed_at.is_(None),
        )
    )
    if name_conflict is not None:
        raise KnowledgeStructureConflictError
    maximum = await session.scalar(
        select(func.max(KnowledgePoint.order_index)).where(
            KnowledgePoint.chapter_id == point.chapter_id,
            KnowledgePoint.trashed_at.is_(None),
        )
    )
    point.order_index = (maximum if maximum is not None else -1) + 1
    point.trashed_at = None
    await session.commit()
    await session.refresh(point)
    return point


async def purge_knowledge_point(
    session: AsyncSession,
    point_id: UUID,
    requester_id: UUID,
) -> int:
    point = await session.scalar(
        select(KnowledgePoint).where(KnowledgePoint.id == point_id).with_for_update()
    )
    if point is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)
    affected_references = await session.scalar(
        select(func.count())
        .select_from(LearningEvent)
        .where(LearningEvent.knowledge_point_id == point.id)
    )
    chapter_id = point.chapter_id
    await _remove_knowledge_points(session, [point.id])
    await session.flush()
    remaining_ids = list(
        await session.scalars(
            select(KnowledgePoint.id)
            .where(
                KnowledgePoint.chapter_id == chapter_id,
                KnowledgePoint.trashed_at.is_(None),
            )
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    await _set_point_order(session, chapter_id, remaining_ids)
    await session.commit()
    return int(affected_references or 0)


async def merge_knowledge_points(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: KnowledgePointMergeRequest,
) -> KnowledgePoint:
    await _ensure_course_teacher(session, course_id, requester_id)
    target = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == payload.target_knowledge_point_id,
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
    )
    if target is None:
        raise KnowledgeNodeNotFoundError

    sources = list(
        await session.scalars(
            select(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.id.in_(payload.source_knowledge_point_ids),
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    if len(sources) != len(payload.source_knowledge_point_ids):
        raise KnowledgeNodeNotFoundError

    source_ids = {point.id for point in sources}
    relation_rows = list(
        await session.scalars(
            select(KnowledgeRelation).where(KnowledgeRelation.course_id == course_id)
        )
    )
    existing_relation_keys = {
        (
            relation.source_knowledge_point_id,
            relation.target_knowledge_point_id,
            relation.relation_type,
        )
        for relation in relation_rows
        if relation.source_knowledge_point_id not in source_ids
        and relation.target_knowledge_point_id not in source_ids
    }
    mapped_relation_keys: set[tuple[UUID, UUID, str]] = set()
    for relation in relation_rows:
        if (
            relation.source_knowledge_point_id not in source_ids
            and relation.target_knowledge_point_id not in source_ids
        ):
            continue
        mapped_source = (
            target.id
            if relation.source_knowledge_point_id in source_ids
            else relation.source_knowledge_point_id
        )
        mapped_target = (
            target.id
            if relation.target_knowledge_point_id in source_ids
            else relation.target_knowledge_point_id
        )
        if mapped_source != mapped_target:
            mapped_relation_keys.add((mapped_source, mapped_target, relation.relation_type))

    await session.execute(
        delete(KnowledgeRelation).where(
            or_(
                KnowledgeRelation.source_knowledge_point_id.in_(source_ids),
                KnowledgeRelation.target_knowledge_point_id.in_(source_ids),
            )
        )
    )
    for source_id, target_id, relation_type in mapped_relation_keys - existing_relation_keys:
        session.add(
            KnowledgeRelation(
                course_id=course_id,
                source_knowledge_point_id=source_id,
                target_knowledge_point_id=target_id,
                relation_type=relation_type,
            )
        )

    await session.execute(
        update(LearningEvent)
        .where(LearningEvent.knowledge_point_id.in_(source_ids))
        .values(knowledge_point_id=target.id)
    )
    await session.execute(
        update(MasterySnapshot)
        .where(MasterySnapshot.knowledge_point_id.in_(source_ids))
        .values(knowledge_point_id=target.id)
    )

    target_states = list(
        await session.scalars(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.knowledge_point_id == target.id,
            )
        )
    )
    source_states = list(
        await session.scalars(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.knowledge_point_id.in_(source_ids),
            )
        )
    )
    scores_by_user: dict[UUID, list[float]] = {}
    state_by_user: dict[UUID, StudentKnowledgeState] = {}
    for state in [*target_states, *source_states]:
        scores_by_user.setdefault(state.user_id, []).append(state.score)
        if state.knowledge_point_id == target.id:
            state_by_user[state.user_id] = state

    for user_id, scores in scores_by_user.items():
        merged_score = round(sum(scores) / len(scores), 2)
        state = state_by_user.get(user_id)
        if state is None:
            state = StudentKnowledgeState(
                course_id=course_id,
                user_id=user_id,
                knowledge_point_id=target.id,
                score=merged_score,
            )
            session.add(state)
        else:
            state.score = merged_score
        session.add(
            MasterySnapshot(
                course_id=course_id,
                user_id=user_id,
                knowledge_point_id=target.id,
                score=merged_score,
            )
        )

    for state in source_states:
        await session.delete(state)

    if payload.name is not None:
        target.name = payload.name
    if payload.description is not None:
        target.description = payload.description
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    await session.execute(delete(KnowledgePoint).where(KnowledgePoint.id.in_(source_ids)))
    await session.flush()
    remaining_ids = list(
        await session.scalars(
            select(KnowledgePoint.id)
            .where(
                KnowledgePoint.chapter_id == target.chapter_id,
                KnowledgePoint.trashed_at.is_(None),
            )
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    await _set_point_order(session, target.chapter_id, remaining_ids)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    await session.refresh(target)
    return target
