from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession, KnowledgeProviderDep
from app.models.knowledge import Chapter
from app.schemas.knowledge import ChapterResponse
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeGenerationForbiddenError,
    KnowledgeStructureConflictError,
    KnowledgeStructureEmptyError,
    generate_document_structure,
    list_course_chapters,
)
from app.services.llm import (
    LLMConfigurationError,
    LLMContextLimitError,
    LLMProviderError,
)

router = APIRouter(tags=["knowledge"])


@router.post(
    "/documents/{document_id}/generate-structure",
    response_model=list[ChapterResponse],
)
async def generate_structure(
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    provider: KnowledgeProviderDep,
) -> list[Chapter]:
    try:
        return await generate_document_structure(
            session,
            provider,
            document_id,
            current_user.id,
        )
    except KnowledgeDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from exc
    except KnowledgeDocumentNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document must be parsed and ready before generating structure",
        ) from exc
    except KnowledgeGenerationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can generate document structure",
        ) from exc
    except KnowledgeStructureEmptyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Generated structure is empty",
        ) from exc
    except KnowledgeStructureConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Generated structure conflicts with existing data",
        ) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM provider is not configured",
        ) from exc
    except LLMContextLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Document exceeds the configured LLM context limit",
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM provider failed to generate a valid structure",
        ) from exc


@router.get("/courses/{course_id}/chapters", response_model=list[ChapterResponse])
async def get_course_chapters(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> list[Chapter]:
    try:
        return await list_course_chapters(session, course_id, current_user.id)
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
