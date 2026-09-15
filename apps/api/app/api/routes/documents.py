from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.dependencies import CurrentUser, DBSession, DocumentStorageDep
from app.core.config import settings
from app.models.document import Document
from app.schemas.document import DocumentResponse
from app.services.course import CourseNotFoundError
from app.services.document import (
    DocumentFileMissingError,
    DocumentNotFoundError,
    DocumentParseError,
    DocumentParseForbiddenError,
    DocumentUploadForbiddenError,
    parse_document,
    upload_course_document,
)
from app.services.storage import DocumentTooLargeError, UnsupportedDocumentTypeError

router = APIRouter(tags=["documents"])


@router.post(
    "/courses/{course_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    course_id: UUID,
    file: Annotated[UploadFile, File()],
    current_user: CurrentUser,
    session: DBSession,
    storage: DocumentStorageDep,
) -> Document:
    try:
        return await upload_course_document(
            session=session,
            storage=storage,
            course_id=course_id,
            uploader=current_user,
            upload=file,
            max_bytes=settings.max_upload_bytes,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except DocumentUploadForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can upload documents",
        ) from exc
    except UnsupportedDocumentTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF documents are supported",
        ) from exc
    except DocumentTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Document exceeds the configured upload limit",
        ) from exc


@router.post("/documents/{document_id}/parse", response_model=DocumentResponse)
async def parse_uploaded_document(
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    storage: DocumentStorageDep,
) -> Document:
    try:
        return await parse_document(session, storage, document_id, current_user.id)
    except DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from exc
    except DocumentFileMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored document file is missing",
        ) from exc
    except DocumentParseForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can parse documents",
        ) from exc
    except DocumentParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unable to parse PDF document",
        ) from exc
