from datetime import UTC, datetime
from uuid import UUID

from database.models.chat import MessageCitation
from database.models.document import Document, DocumentPage
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.resource import (
    ExternalResource,
    QuestionItem,
    external_resource_knowledge_points,
    question_item_knowledge_points,
)
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.teacher_resources import (
    PermanentDeleteResponse,
    ResourceListItem,
    ResourceListPage,
)
from app.services.knowledge import (
    KnowledgeStructureConflictError,
    delete_chapter,
    delete_knowledge_point,
    purge_chapter,
    purge_knowledge_point,
    restore_chapter,
    restore_knowledge_point,
)
from app.services.storage import LocalDocumentStorage
from app.services.teacher_access import (
    TeacherContentConflictError,
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
)


async def _course_resource_items(
    session: AsyncSession,
    course_id: UUID,
    *,
    trashed: bool,
) -> list[ResourceListItem]:
    trashed_filter = Document.trashed_at.is_not(None) if trashed else Document.trashed_at.is_(None)
    documents = list(
        await session.scalars(
            select(Document).where(
                Document.course_id == course_id,
                trashed_filter,
            )
        )
    )
    chapters = list(
        await session.scalars(
            select(Chapter)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.course_id == course_id,
                Chapter.trashed_at.is_not(None) if trashed else Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    points = list(
        await session.scalars(
            select(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_not(None)
                if trashed
                else KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    question_items = list(
        await session.scalars(
            select(QuestionItem).where(
                QuestionItem.course_id == course_id,
                QuestionItem.trashed_at.is_not(None)
                if trashed
                else QuestionItem.trashed_at.is_(None),
            )
        )
    )
    external_resources = list(
        await session.scalars(
            select(ExternalResource).where(
                ExternalResource.course_id == course_id,
                ExternalResource.trashed_at.is_not(None)
                if trashed
                else ExternalResource.trashed_at.is_(None),
            )
        )
    )
    items = [
        ResourceListItem(
            id=document.id,
            course_id=course_id,
            item_type="document",
            title=document.display_name or document.original_name,
            resource_type=document.resource_type,
            trashed_at=document.trashed_at,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )
        for document in documents
    ]
    items.extend(
        ResourceListItem(
            id=chapter.id,
            course_id=course_id,
            item_type="chapter",
            title=chapter.title,
            resource_type="chapter",
            trashed_at=chapter.trashed_at,
            created_at=chapter.created_at,
            updated_at=chapter.updated_at,
        )
        for chapter in chapters
    )
    items.extend(
        ResourceListItem(
            id=point.id,
            course_id=course_id,
            item_type="knowledge_point",
            title=point.name,
            resource_type="knowledge_point",
            trashed_at=point.trashed_at,
            created_at=point.created_at,
            updated_at=point.updated_at,
        )
        for point in points
    )
    items.extend(
        ResourceListItem(
            id=item.id,
            course_id=course_id,
            item_type="question_item",
            title=item.title,
            resource_type="question_bank",
            trashed_at=item.trashed_at,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in question_items
    )
    items.extend(
        ResourceListItem(
            id=resource.id,
            course_id=course_id,
            item_type="external_resource",
            title=resource.title,
            resource_type="external_link",
            trashed_at=resource.trashed_at,
            created_at=resource.created_at,
            updated_at=resource.updated_at,
        )
        for resource in external_resources
    )
    return sorted(items, key=lambda item: (item.created_at, item.id), reverse=True)


async def list_course_resources(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    trashed: bool,
    cursor: str | None,
    limit: int,
) -> ResourceListPage:
    await ensure_teacher(session, course_id, requester_id)
    items = await _course_resource_items(session, course_id, trashed=trashed)
    offset = decode_cursor(cursor)
    page = items[offset : offset + limit]
    next_cursor = encode_cursor(offset + limit) if offset + limit < len(items) else None
    return ResourceListPage(items=page, total=len(items), next_cursor=next_cursor)


async def _resolve_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
) -> tuple[str, object]:
    document = await session.scalar(
        select(Document).where(
            Document.id == resource_id,
            Document.course_id == course_id,
        )
    )
    if document is not None:
        return "document", document
    chapter = await session.scalar(
        select(Chapter).where(
            Chapter.id == resource_id,
            Chapter.course_id == course_id,
        )
    )
    if chapter is not None:
        return "chapter", chapter
    point = await session.scalar(
        select(KnowledgePoint).where(
            KnowledgePoint.id == resource_id,
            KnowledgePoint.course_id == course_id,
        )
    )
    if point is not None:
        return "knowledge_point", point
    question_item = await session.scalar(
        select(QuestionItem).where(
            QuestionItem.id == resource_id,
            QuestionItem.course_id == course_id,
        )
    )
    if question_item is not None:
        return "question_item", question_item
    external_resource = await session.scalar(
        select(ExternalResource).where(
            ExternalResource.id == resource_id,
            ExternalResource.course_id == course_id,
        )
    )
    if external_resource is not None:
        return "external_resource", external_resource
    raise TeacherContentNotFoundError


async def trash_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
) -> ResourceListItem:
    await ensure_teacher(session, course_id, requester_id)
    item_type, entity = await _resolve_resource(session, course_id, resource_id)
    if item_type == "chapter":
        await delete_chapter(session, resource_id, requester_id)
    elif item_type == "knowledge_point":
        await delete_knowledge_point(session, resource_id, requester_id)
    else:
        entity.trashed_at = datetime.now(UTC)
        await session.commit()
    items = await _course_resource_items(session, course_id, trashed=True)
    return next(item for item in items if item.id == resource_id)


async def restore_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
) -> ResourceListItem:
    await ensure_teacher(session, course_id, requester_id)
    item_type, entity = await _resolve_resource(session, course_id, resource_id)
    try:
        if item_type == "chapter":
            await restore_chapter(session, resource_id, requester_id)
        elif item_type == "knowledge_point":
            await restore_knowledge_point(session, resource_id, requester_id)
        else:
            entity.trashed_at = None
            await session.commit()
    except KnowledgeStructureConflictError as exc:
        raise TeacherContentConflictError from exc
    items = await _course_resource_items(session, course_id, trashed=False)
    return next(item for item in items if item.id == resource_id)


async def _association_count(
    session: AsyncSession,
    table,
    column_name: str,
    resource_id: UUID,
) -> int:
    return int(
        await session.scalar(
            select(func.count()).select_from(
                table.select().where(table.c[column_name] == resource_id).subquery()
            )
        )
        or 0
    )


async def permanent_delete_resource(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
    *,
    permanent: bool,
) -> PermanentDeleteResponse:
    if not permanent:
        raise ValueError("permanent=true is required")
    await ensure_teacher(session, course_id, requester_id)
    item_type, entity = await _resolve_resource(session, course_id, resource_id)
    storage_key: str | None = None
    if item_type == "chapter":
        affected = await purge_chapter(session, resource_id, requester_id)
    elif item_type == "knowledge_point":
        affected = await purge_knowledge_point(session, resource_id, requester_id)
    elif item_type == "document":
        document = entity
        storage_key = document.storage_key
        affected = int(
            await session.scalar(
                select(func.count())
                .select_from(MessageCitation)
                .where(MessageCitation.document_id == document.id)
            )
            or 0
        )
        chapter_ids = list(
            await session.scalars(select(Chapter.id).where(Chapter.document_id == document.id))
        )
        for chapter_id in chapter_ids:
            affected += await purge_chapter(
                session,
                chapter_id,
                requester_id,
                commit=False,
            )
        await session.execute(
            update(QuestionItem)
            .where(QuestionItem.source_document_id == document.id)
            .values(source_document_id=None)
        )
        await session.execute(
            delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
        )
        await session.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
        await session.delete(document)
        await session.commit()
        if storage_key is not None:
            storage.delete(storage_key)
    elif item_type == "question_item":
        affected = await _association_count(
            session,
            question_item_knowledge_points,
            "question_item_id",
            resource_id,
        )
        await session.delete(entity)
        await session.commit()
    else:
        affected = await _association_count(
            session,
            external_resource_knowledge_points,
            "external_resource_id",
            resource_id,
        )
        await session.delete(entity)
        await session.commit()
    return PermanentDeleteResponse(
        id=resource_id,
        item_type=item_type,
        affected_reference_count=affected,
        deleted=True,
    )
