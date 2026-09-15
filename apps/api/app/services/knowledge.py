from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.course import CourseMember
from app.models.document import Document, DocumentPage, DocumentStatus
from app.models.knowledge import Chapter, KnowledgePoint, KnowledgeRelation
from app.models.user import UserRole
from app.schemas.knowledge import ChapterDraft
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
        await session.execute(
            delete(KnowledgeRelation).where(
                or_(
                    KnowledgeRelation.source_knowledge_point_id.in_(point_ids),
                    KnowledgeRelation.target_knowledge_point_id.in_(point_ids),
                )
            )
        )
        await session.execute(delete(KnowledgePoint).where(KnowledgePoint.id.in_(point_ids)))
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
