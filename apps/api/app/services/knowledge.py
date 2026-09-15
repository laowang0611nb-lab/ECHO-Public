from uuid import UUID

from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import CourseMember
from app.models.document import Document, DocumentPage, DocumentStatus
from app.models.knowledge import (
    Chapter,
    KnowledgeChunk,
    KnowledgePoint,
    KnowledgeRelation,
)
from app.models.learning import LearningEvent, MasterySnapshot, StudentKnowledgeState
from app.models.user import UserRole
from app.schemas.knowledge import (
    ChapterCreate,
    ChapterDraft,
    ChapterUpdate,
    KnowledgePointCreate,
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


async def _delete_existing_structure(session: AsyncSession, document_id: UUID) -> None:
    chapter_ids = list(
        await session.scalars(select(Chapter.id).where(Chapter.document_id == document_id))
    )
    if not chapter_ids:
        return

    point_ids = list(
        await session.scalars(
            select(KnowledgePoint.id).where(KnowledgePoint.chapter_id.in_(chapter_ids))
        )
    )
    if point_ids:
        await _remove_knowledge_points(session, point_ids)
    await session.execute(delete(Chapter).where(Chapter.id.in_(chapter_ids)))


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

    await _delete_existing_structure(session, document_id)

    chapters: list[Chapter] = []
    for chapter_index, draft in enumerate(drafts):
        chapter = Chapter(
            course_id=document.course_id,
            document_id=document.id,
            title=draft.title,
            summary=draft.summary,
            order_index=chapter_index,
        )
        chapter.knowledge_points = [
            KnowledgePoint(
                course_id=document.course_id,
                name=point.name,
                description=point.description,
                order_index=point_index,
            )
            for point_index, point in enumerate(draft.knowledge_points)
        ]
        session.add(chapter)
        chapters.append(chapter)

    try:
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


REORDER_OFFSET = 100000


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
    document = await session.get(Document, document_id)
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
    await session.flush()

    ordered_ids = existing_ids.copy()
    ordered_ids.insert(position, chapter.id)
    await _set_chapter_order(session, document_id, ordered_ids)
    await session.commit()
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
    chapter = await session.get(Chapter, chapter_id)
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
    except IntegrityError as exc:
        await session.rollback()
        raise KnowledgeStructureConflictError from exc

    ordered_ids = existing_ids.copy()
    ordered_ids.insert(position, point.id)
    await _set_point_order(session, chapter_id, ordered_ids)
    await session.commit()
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
