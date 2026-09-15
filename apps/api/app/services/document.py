from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseMember
from app.models.document import Document
from app.models.user import User, UserRole
from app.services.course import CourseNotFoundError
from app.services.storage import LocalDocumentStorage, UnsupportedDocumentTypeError

PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


class DocumentUploadForbiddenError(Exception):
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
