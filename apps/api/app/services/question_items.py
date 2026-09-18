from datetime import UTC, datetime
from uuid import UUID

from database.models.document import Document
from database.models.resource import (
    QuestionItem,
    question_item_knowledge_points,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.teacher_resources import (
    QuestionItemCreate,
    QuestionItemPage,
    QuestionItemResponse,
    QuestionItemUpdate,
)
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
    load_course_knowledge_points,
)


async def _validate_source_document(
    session: AsyncSession,
    course_id: UUID,
    document_id: UUID | None,
    source_page: int | None,
) -> None:
    if document_id is None:
        return
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.course_id == course_id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise TeacherContentNotFoundError
    if (
        source_page is not None
        and document.page_count is not None
        and source_page > document.page_count
    ):
        raise TeacherContentNotFoundError


def _question_response(item: QuestionItem) -> QuestionItemResponse:
    return QuestionItemResponse(
        id=item.id,
        course_id=item.course_id,
        knowledge_point_ids=sorted(
            {point.id for point in item.knowledge_points},
            key=str,
        ),
        type=item.type,
        difficulty=item.difficulty,
        title=item.title,
        content=item.content,
        answer=item.answer,
        explanation=item.explanation,
        source_document_id=item.source_document_id,
        source_page=item.source_page,
        metadata_json=item.metadata_json,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def create_question_item(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: QuestionItemCreate,
) -> QuestionItemResponse:
    await ensure_teacher(session, course_id, requester_id)
    points = await load_course_knowledge_points(
        session,
        course_id,
        payload.knowledge_point_ids,
    )
    await _validate_source_document(
        session,
        course_id,
        payload.source_document_id,
        payload.source_page,
    )
    item = QuestionItem(
        course_id=course_id,
        type=payload.type,
        difficulty=payload.difficulty,
        title=payload.title,
        content=payload.content,
        answer=payload.answer,
        explanation=payload.explanation,
        source_document_id=payload.source_document_id,
        source_page=payload.source_page,
        metadata_json=payload.metadata_json,
        created_by=requester_id,
    )
    item.knowledge_points = points
    session.add(item)
    await session.commit()
    loaded = await _load_question_item(session, course_id, item.id)
    if loaded is None:
        raise TeacherContentNotFoundError
    return _question_response(loaded)


async def _load_question_item(
    session: AsyncSession,
    course_id: UUID,
    item_id: UUID,
) -> QuestionItem | None:
    item = await session.scalar(
        select(QuestionItem).where(
            QuestionItem.id == item_id,
            QuestionItem.course_id == course_id,
            QuestionItem.trashed_at.is_(None),
        )
    )
    if item is not None:
        await session.refresh(item, attribute_names=["knowledge_points"])
    return item


async def get_question_item(
    session: AsyncSession,
    course_id: UUID,
    item_id: UUID,
    requester_id: UUID,
) -> QuestionItemResponse:
    await ensure_teacher(session, course_id, requester_id)
    item = await _load_question_item(session, course_id, item_id)
    if item is None:
        raise TeacherContentNotFoundError
    return _question_response(item)


async def list_question_items(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    knowledge_point_id: UUID | None,
    cursor: str | None,
    limit: int,
) -> QuestionItemPage:
    await ensure_teacher(session, course_id, requester_id)
    statement = select(QuestionItem).where(
        QuestionItem.course_id == course_id,
        QuestionItem.trashed_at.is_(None),
    )
    if knowledge_point_id is not None:
        statement = statement.where(
            QuestionItem.id.in_(
                select(question_item_knowledge_points.c.question_item_id).where(
                    question_item_knowledge_points.c.knowledge_point_id == knowledge_point_id
                )
            )
        )
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    offset = decode_cursor(cursor)
    items = list(
        await session.scalars(
            statement.order_by(QuestionItem.created_at.desc(), QuestionItem.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    for item in items:
        await session.refresh(item, attribute_names=["knowledge_points"])
    next_cursor = encode_cursor(offset + limit) if offset + limit < int(total or 0) else None
    return QuestionItemPage(
        items=[_question_response(item) for item in items],
        total=int(total or 0),
        next_cursor=next_cursor,
    )


async def update_question_item(
    session: AsyncSession,
    course_id: UUID,
    item_id: UUID,
    requester_id: UUID,
    payload: QuestionItemUpdate,
) -> QuestionItemResponse:
    await ensure_teacher(session, course_id, requester_id)
    item = await _load_question_item(session, course_id, item_id)
    if item is None:
        raise TeacherContentNotFoundError
    if "knowledge_point_ids" in payload.model_fields_set:
        points = await load_course_knowledge_points(
            session,
            course_id,
            payload.knowledge_point_ids or [],
        )
        item.knowledge_points = points
    if (
        "source_document_id" in payload.model_fields_set
        or "source_page" in payload.model_fields_set
    ):
        await _validate_source_document(
            session,
            course_id,
            payload.source_document_id
            if "source_document_id" in payload.model_fields_set
            else item.source_document_id,
            payload.source_page if "source_page" in payload.model_fields_set else item.source_page,
        )
    for field in (
        "type",
        "difficulty",
        "title",
        "content",
        "answer",
        "explanation",
        "source_document_id",
        "source_page",
        "metadata_json",
    ):
        if field in payload.model_fields_set:
            setattr(item, field, getattr(payload, field))
    await session.commit()
    loaded = await _load_question_item(session, course_id, item.id)
    if loaded is None:
        raise TeacherContentNotFoundError
    return _question_response(loaded)


async def delete_question_item(
    session: AsyncSession,
    course_id: UUID,
    item_id: UUID,
    requester_id: UUID,
) -> None:
    await ensure_teacher(session, course_id, requester_id)
    item = await _load_question_item(session, course_id, item_id)
    if item is None:
        raise TeacherContentNotFoundError
    item.trashed_at = datetime.now(UTC)
    await session.commit()
