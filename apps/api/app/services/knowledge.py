from uuid import UUID

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
from sqlalchemy import delete, or_, select, update
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
)
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
) -> list[Chapter]:
    existing_chapters = list(
        await session.scalars(
            select(Chapter)
            .options(selectinload(Chapter.knowledge_points))
            .where(Chapter.document_id == document.id)
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
            .where(KnowledgePoint.chapter_id.in_(existing_chapter_ids))
            .values(order_index=KnowledgePoint.order_index + REORDER_OFFSET)
        )

    chapters_by_title: dict[str, list[Chapter]] = {}
    points_by_name: dict[str, list[KnowledgePoint]] = {}
    for chapter in existing_chapters:
        chapters_by_title.setdefault(chapter.title.casefold(), []).append(chapter)
        for point in chapter.knowledge_points:
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
            if point.id not in reused_point_ids
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
        chapters.append(chapter)

    await session.flush()
    existing_point_ids = {
        point.id for chapter in existing_chapters for point in chapter.knowledge_points
    }
    await _remove_knowledge_points(
        session,
        list(existing_point_ids - reused_point_ids),
    )

    unused_chapter_ids = set(existing_chapter_ids) - reused_chapter_ids
    if unused_chapter_ids:
        await session.execute(
            update(KnowledgeChunk)
            .where(KnowledgeChunk.chapter_id.in_(unused_chapter_ids))
            .values(chapter_id=None)
        )
        await session.execute(delete(Chapter).where(Chapter.id.in_(unused_chapter_ids)))

    return chapters


async def generate_document_structure(
    session: AsyncSession,
    provider: KnowledgeStructureProvider,
    document_id: UUID,
    requester_id: UUID,
) -> list[Chapter]:
    document = await session.get(Document, document_id)
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

    try:
        chapters = await _replace_document_structure(session, document, drafts)
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc
    chapter_ids = [chapter.id for chapter in chapters]
    result = await session.scalars(
        select(Chapter)
        .options(selectinload(Chapter.knowledge_points))
        .where(Chapter.id.in_(chapter_ids))
        .order_by(Chapter.order_index)
    )
    return list(result)


async def list_course_chapters(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> list[Chapter]:
    await get_course_for_member(session, course_id, requester_id)
    result = await session.scalars(
        select(Chapter)
        .options(selectinload(Chapter.knowledge_points))
        .where(Chapter.course_id == course_id)
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
        .options(selectinload(Chapter.knowledge_points))
        .execution_options(populate_existing=True)
        .where(Chapter.id == chapter_id)
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
        .where(Chapter.document_id == document_id)
        .values(order_index=Chapter.order_index + REORDER_OFFSET)
    )
    for index, chapter_id in enumerate(ordered_ids):
        await session.execute(
            update(Chapter).where(Chapter.id == chapter_id).values(order_index=index)
        )


async def _set_point_order(
    session: AsyncSession,
    chapter_id: UUID,
    ordered_ids: list[UUID],
) -> None:
    await session.execute(
        update(KnowledgePoint)
        .where(KnowledgePoint.chapter_id == chapter_id)
        .values(order_index=KnowledgePoint.order_index + REORDER_OFFSET)
    )
    for index, point_id in enumerate(ordered_ids):
        await session.execute(
            update(KnowledgePoint).where(KnowledgePoint.id == point_id).values(order_index=index)
        )


async def create_chapter(
    session: AsyncSession,
    document_id: UUID,
    requester_id: UUID,
    payload: ChapterCreate,
) -> Chapter:
    document = await session.scalar(
        select(Document).where(Document.id == document_id).with_for_update()
    )
    if document is None:
        raise KnowledgeDocumentNotFoundError
    await _ensure_course_teacher(session, document.course_id, requester_id)

    existing_ids = list(
        await session.scalars(
            select(Chapter.id)
            .where(Chapter.document_id == document_id)
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
                .where(Chapter.document_id == chapter.document_id)
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
    await _remove_knowledge_points(session, point_ids)
    await session.execute(
        update(KnowledgeChunk)
        .where(KnowledgeChunk.chapter_id == chapter_id)
        .values(chapter_id=None)
    )
    await session.delete(chapter)
    await session.flush()

    await session.scalar(
        select(Document.id).where(Document.id == chapter.document_id).with_for_update()
    )
    remaining_ids = list(
        await session.scalars(
            select(Chapter.id)
            .where(Chapter.document_id == chapter.document_id)
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    await _set_chapter_order(session, chapter.document_id, remaining_ids)
    await session.commit()


async def create_knowledge_point(
    session: AsyncSession,
    chapter_id: UUID,
    requester_id: UUID,
    payload: KnowledgePointCreate,
) -> KnowledgePoint:
    chapter = await session.get(Chapter, chapter_id)
    if chapter is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, chapter.course_id, requester_id)

    existing_ids = list(
        await session.scalars(
            select(KnowledgePoint.id)
            .where(KnowledgePoint.chapter_id == chapter_id)
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
    point = await session.get(KnowledgePoint, point_id)
    if point is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)

    source_chapter_id = point.chapter_id
    target_chapter_id = source_chapter_id
    if "chapter_id" in payload.model_fields_set and payload.chapter_id is not None:
        target_chapter = await session.get(Chapter, payload.chapter_id)
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
                    .where(KnowledgePoint.chapter_id == source_chapter_id)
                    .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
                )
            )
            await _set_point_order(session, source_chapter_id, source_ids)

            target_ids = list(
                await session.scalars(
                    select(KnowledgePoint.id)
                    .where(KnowledgePoint.chapter_id == target_chapter_id)
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
                    .where(KnowledgePoint.chapter_id == target_chapter_id)
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
    point = await session.get(KnowledgePoint, point_id)
    if point is None:
        raise KnowledgeNodeNotFoundError
    await _ensure_course_teacher(session, point.course_id, requester_id)
    chapter_id = point.chapter_id
    await session.scalar(select(Chapter.id).where(Chapter.id == chapter_id).with_for_update())
    await _remove_knowledge_points(session, [point.id])
    await session.flush()

    remaining_ids = list(
        await session.scalars(
            select(KnowledgePoint.id)
            .where(KnowledgePoint.chapter_id == chapter_id)
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    await _set_point_order(session, chapter_id, remaining_ids)
    await session.commit()


async def merge_knowledge_points(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: KnowledgePointMergeRequest,
) -> KnowledgePoint:
    await _ensure_course_teacher(session, course_id, requester_id)
    target = await session.get(KnowledgePoint, payload.target_knowledge_point_id)
    if target is None or target.course_id != course_id:
        raise KnowledgeNodeNotFoundError

    sources = list(
        await session.scalars(
            select(KnowledgePoint).where(
                KnowledgePoint.id.in_(payload.source_knowledge_point_ids),
                KnowledgePoint.course_id == course_id,
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
            .where(KnowledgePoint.chapter_id == target.chapter_id)
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
