from pathlib import Path
from uuid import UUID

from database.models.chat import Conversation, Message, MessageCitation
from database.models.document import Document, DocumentPage
from database.models.knowledge import KnowledgeChunk
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.teacher_resources import (
    DocumentCitationItem,
    DocumentCitationPage,
    DocumentIndexStatusResponse,
    DocumentPageBlock,
    DocumentPageEvidenceResponse,
)
from app.services.storage import LocalDocumentStorage
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
)


async def get_document_for_teacher(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    course_id: UUID,
    document_id: UUID,
    requester_id: UUID,
) -> tuple[Document, Path]:
    await ensure_teacher(session, course_id, requester_id)
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.course_id == course_id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise TeacherContentNotFoundError
    path = storage.path_for(document.storage_key)
    if not path.is_file():
        raise TeacherContentNotFoundError
    return document, path


async def get_document_page_evidence(
    session: AsyncSession,
    course_id: UUID,
    document_id: UUID,
    page_number: int,
    requester_id: UUID,
) -> DocumentPageEvidenceResponse:
    await ensure_teacher(session, course_id, requester_id)
    page = await session.scalar(
        select(DocumentPage)
        .join(Document, Document.id == DocumentPage.document_id)
        .where(
            DocumentPage.document_id == document_id,
            DocumentPage.page_number == page_number,
            Document.course_id == course_id,
            Document.trashed_at.is_(None),
        )
    )
    if page is None:
        raise TeacherContentNotFoundError
    chunks = list(
        await session.scalars(
            select(KnowledgeChunk)
            .where(
                KnowledgeChunk.document_id == document_id,
                KnowledgeChunk.page_start <= page_number,
                KnowledgeChunk.page_end >= page_number,
            )
            .order_by(KnowledgeChunk.chunk_index)
        )
    )
    blocks: list[DocumentPageBlock] = []
    for chunk in chunks:
        raw_bbox = chunk.metadata_json.get("bbox")
        bbox: list[float] | None = None
        metadata_page = chunk.metadata_json.get("page_number")
        if (
            isinstance(raw_bbox, list | tuple)
            and len(raw_bbox) == 4
            and all(isinstance(value, int | float) for value in raw_bbox)
            and (metadata_page is None or metadata_page == page_number)
        ):
            bbox = [float(value) for value in raw_bbox]
        blocks.append(
            DocumentPageBlock(
                chunk_id=chunk.id,
                text=chunk.content,
                bbox=bbox,
            )
        )
    return DocumentPageEvidenceResponse(
        page_number=page.page_number,
        width=page.width,
        height=page.height,
        text=page.text or "",
        blocks=blocks,
    )


async def get_document_index_status(
    session: AsyncSession,
    course_id: UUID,
    document_id: UUID,
    requester_id: UUID,
) -> DocumentIndexStatusResponse:
    await ensure_teacher(session, course_id, requester_id)
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.course_id == course_id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise TeacherContentNotFoundError
    pages_total = int(
        await session.scalar(
            select(func.count())
            .select_from(DocumentPage)
            .where(DocumentPage.document_id == document_id)
        )
        or 0
    )
    pages_parsed = pages_total
    chunks_total = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id)
        )
        or 0
    )
    chunks_embedded = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgeChunk)
            .where(
                KnowledgeChunk.document_id == document_id,
                KnowledgeChunk.embedding.is_not(None),
            )
        )
        or 0
    )
    last_indexed_at = await session.scalar(
        select(func.max(KnowledgeChunk.created_at)).where(KnowledgeChunk.document_id == document_id)
    )
    return DocumentIndexStatusResponse(
        document_id=document.id,
        status=document.status.value,
        pages_total=document.page_count or pages_total,
        pages_parsed=pages_parsed,
        chunks_total=chunks_total,
        chunks_embedded=chunks_embedded,
        last_indexed_at=last_indexed_at,
        error="Document parsing failed" if document.status.value == "failed" else None,
    )


async def list_document_citations(
    session: AsyncSession,
    course_id: UUID,
    document_id: UUID,
    requester_id: UUID,
    *,
    cursor: str | None,
    limit: int,
) -> DocumentCitationPage:
    await ensure_teacher(session, course_id, requester_id)
    document = await session.scalar(
        select(Document.id).where(
            Document.id == document_id,
            Document.course_id == course_id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise TeacherContentNotFoundError
    statement = (
        select(MessageCitation, Conversation.user_id, Message.conversation_id)
        .join(Message, Message.id == MessageCitation.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            MessageCitation.document_id == document_id,
            Conversation.course_id == course_id,
        )
    )
    total = int(await session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    offset = decode_cursor(cursor)
    rows = await session.execute(
        statement.order_by(
            MessageCitation.created_at.desc(),
            MessageCitation.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    items = [
        DocumentCitationItem(
            id=citation.id,
            message_id=citation.message_id,
            conversation_id=conversation_id,
            student_id=student_id,
            citation_index=citation.citation_index,
            document_id=citation.document_id,
            chunk_id=citation.chunk_id,
            page_start=citation.page_start,
            page_end=citation.page_end,
            quote=citation.quote,
            created_at=citation.created_at,
        )
        for citation, student_id, conversation_id in rows.all()
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return DocumentCitationPage(items=items, total=total, next_cursor=next_cursor)
