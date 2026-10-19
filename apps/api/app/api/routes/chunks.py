from uuid import UUID

from database.models.knowledge import KnowledgeChunk
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DBSession
from app.core.config import settings
from app.schemas.chunk import KnowledgeChunkResponse
from app.services.chunking import chunk_document
from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeGenerationForbiddenError,
)
from app.services.resource_limits import document_job_limiter

router = APIRouter(tags=["chunks"])


@router.post(
    "/documents/{document_id}/chunks",
    response_model=list[KnowledgeChunkResponse],
)
async def create_document_chunks(
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> list[KnowledgeChunk]:
    try:
        async with document_job_limiter.slot():
            return await chunk_document(
                session,
                document_id,
                current_user.id,
                chunk_size=settings.chunk_size_chars,
                overlap=settings.chunk_overlap_chars,
            )
    except KnowledgeDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from exc
    except KnowledgeDocumentNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document must be parsed and ready before chunking",
        ) from exc
    except KnowledgeGenerationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can chunk documents",
        ) from exc
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document chunks were updated concurrently",
        ) from exc
