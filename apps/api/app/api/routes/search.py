from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession, EmbeddingProviderDep
from app.core.config import settings
from app.schemas.search import ChunkSearchRequest, ChunkSearchResult, EmbeddingResponse
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.embedding import EmbeddingConfigurationError, EmbeddingProviderError
from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeGenerationForbiddenError,
)
from app.services.search import embed_document_chunks, search_course_chunks

router = APIRouter(tags=["search"])


@router.post("/documents/{document_id}/embeddings", response_model=EmbeddingResponse)
async def create_document_embeddings(
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    provider: EmbeddingProviderDep,
) -> EmbeddingResponse:
    try:
        count = await embed_document_chunks(
            session,
            provider,
            document_id,
            current_user.id,
            batch_size=settings.embedding_batch_size,
        )
        return EmbeddingResponse(document_id=document_id, embedded_chunks=count)
    except KnowledgeDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from exc
    except KnowledgeDocumentNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document must have chunks before embedding",
        ) from exc
    except KnowledgeGenerationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can embed document chunks",
        ) from exc
    except EmbeddingConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding provider is not configured",
        ) from exc
    except EmbeddingProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Embedding provider failed",
        ) from exc


@router.post(
    "/courses/{course_id}/search",
    response_model=list[ChunkSearchResult],
)
async def search_course(
    course_id: UUID,
    payload: ChunkSearchRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: EmbeddingProviderDep,
) -> list[ChunkSearchResult]:
    try:
        return await search_course_chunks(
            session,
            provider,
            course_id,
            current_user.id,
            payload.query,
            payload.limit,
        )
    except CourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except CourseMembershipRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Course membership required",
        ) from exc
    except KnowledgeDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Search query could not be embedded",
        ) from exc
    except EmbeddingConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding provider is not configured",
        ) from exc
    except EmbeddingProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Embedding provider failed",
        ) from exc
