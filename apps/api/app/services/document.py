from pathlib import Path
from uuid import UUID, uuid4

import anyio
from database.models.course import Course, CourseMember
from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import KnowledgeChunk
from database.models.user import User, UserRole
from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.course import CourseNotFoundError
from app.services.storage import LocalDocumentStorage, UnsupportedDocumentTypeError

PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


class DocumentUploadForbiddenError(Exception):
    pass


class DocumentListForbiddenError(Exception):
    pass


class DocumentNotFoundError(Exception):
    pass


class DocumentParseForbiddenError(Exception):
    pass


class DocumentFileMissingError(Exception):
    pass


class DocumentParseError(Exception):
    pass


async def upload_course_document(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    course_id: UUID,
    uploader: User,
    upload: UploadFile,
    max_bytes: int,
) -> Document:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == uploader.id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise DocumentUploadForbiddenError

    original_name = Path(upload.filename or "").name
    if not original_name or Path(original_name).suffix.lower() != ".pdf":
        raise UnsupportedDocumentTypeError
    if (
        upload.content_type
        and upload.content_type not in PDF_CONTENT_TYPES
        and upload.content_type != "application/octet-stream"
    ):
        raise UnsupportedDocumentTypeError

    document_id = uuid4()
    storage_key = f"courses/{course_id}/documents/{document_id}.pdf"
    size_bytes = await storage.save(storage_key, upload, max_bytes)

    document = Document(
        id=document_id,
        course_id=course_id,
        uploaded_by=uploader.id,
        original_name=original_name,
        storage_key=storage_key,
        content_type="application/pdf",
        size_bytes=size_bytes,
    )
    session.add(document)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        storage.delete(storage_key)
        raise

    await session.refresh(document)
    return document


async def list_course_documents(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> list[Document]:
    course = await session.get(Course, course_id)
    if course is None:
        raise CourseNotFoundError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise DocumentListForbiddenError

    documents = await session.scalars(
        select(Document)
        .where(Document.course_id == course_id)
        .order_by(Document.created_at.desc(), Document.id.desc())
    )
    return list(documents)


def _extract_pdf_pages(path: Path) -> list[str]:
    reader = PdfReader(str(path))
    return [(page.extract_text() or "") for page in reader.pages]


async def parse_document(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    document_id: UUID,
    requester_id: UUID,
) -> Document:
    document = await session.scalar(
        select(Document).where(Document.id == document_id).with_for_update()
    )
    if document is None:
        raise DocumentNotFoundError

    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == document.course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise DocumentParseForbiddenError

    path = storage.path_for(document.storage_key)
    if not path.is_file():
        document.status = DocumentStatus.FAILED
        await session.commit()
        raise DocumentFileMissingError

    document.status = DocumentStatus.PARSING
    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    await session.flush()

    try:
        page_texts = await anyio.to_thread.run_sync(_extract_pdf_pages, path)
    except Exception as exc:
        document.status = DocumentStatus.FAILED
        await session.commit()
        raise DocumentParseError from exc

    await session.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
    session.add_all(
        [
            DocumentPage(
                document_id=document.id,
                page_number=page_number,
                text=text or None,
                char_count=len(text),
            )
            for page_number, text in enumerate(page_texts, start=1)
        ]
    )
    document.page_count = len(page_texts)
    document.status = DocumentStatus.READY
    await session.commit()
    await session.refresh(document)
    return document
