from uuid import UUID

from database.models.knowledge import Chapter
from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession, KnowledgeProviderDep
from app.schemas.knowledge import (
    ChapterCreate,
    ChapterResponse,
    ChapterUpdate,
    KnowledgePointCreate,
    KnowledgePointMergeRequest,
    KnowledgePointResponse,
    KnowledgePointUpdate,
    KnowledgeRelationGenerationResponse,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.knowledge import (
    KnowledgeDocumentNotFoundError,
    KnowledgeDocumentNotReadyError,
    KnowledgeEditForbiddenError,
    KnowledgeGenerationForbiddenError,
    KnowledgeNodeNotFoundError,
    KnowledgeStructureConflictError,
    KnowledgeStructureEmptyError,
    create_chapter,
    create_knowledge_point,
    delete_chapter,
    delete_knowledge_point,
    generate_document_relations,
    generate_document_structure,
    list_course_chapters,
    merge_knowledge_points,
    update_chapter,
    update_knowledge_point,
)
from app.services.llm import (
    LLMConfigurationError,
    LLMContextLimitError,
    LLMProviderError,
    LLMProviderTimeoutError,
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
    except LLMProviderTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="LLM provider timed out while generating the structure",
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM provider failed to generate a valid structure",
        ) from exc


@router.post(
    "/documents/{document_id}/generate-relations",
    response_model=KnowledgeRelationGenerationResponse,
)
async def generate_relations(
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    provider: KnowledgeProviderDep,
) -> KnowledgeRelationGenerationResponse:
    try:
        result = await generate_document_relations(
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
    except KnowledgeGenerationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can generate document relations",
        ) from exc
    except KnowledgeStructureEmptyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No active knowledge points are available for relation generation",
        ) from exc
    except KnowledgeStructureConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Generated relations conflict with existing data",
        ) from exc
    except LLMConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM provider is not configured",
        ) from exc
    except LLMContextLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Knowledge structure exceeds the configured LLM context limit",
        ) from exc
    except LLMProviderTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="LLM provider timed out while generating relations",
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM provider failed to generate valid relations",
        ) from exc
    return KnowledgeRelationGenerationResponse(**result)


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


def _translate_edit_error(exc: Exception) -> HTTPException:
    if isinstance(exc, KnowledgeNodeNotFoundError | KnowledgeDocumentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge node not found",
        )
    if isinstance(exc, KnowledgeEditForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can edit the knowledge structure",
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Knowledge structure conflicts with existing data",
    )


@router.post(
    "/documents/{document_id}/chapters",
    response_model=ChapterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course_chapter(
    document_id: UUID,
    payload: ChapterCreate,
    current_user: CurrentUser,
    session: DBSession,
) -> Chapter:
    try:
        return await create_chapter(session, document_id, current_user.id, payload)
    except (
        KnowledgeDocumentNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.patch("/chapters/{chapter_id}", response_model=ChapterResponse)
async def patch_chapter(
    chapter_id: UUID,
    payload: ChapterUpdate,
    current_user: CurrentUser,
    session: DBSession,
) -> Chapter:
    try:
        return await update_chapter(session, chapter_id, current_user.id, payload)
    except (
        KnowledgeNodeNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chapter(
    chapter_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> None:
    try:
        await delete_chapter(session, chapter_id, current_user.id)
    except (
        KnowledgeNodeNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.post(
    "/chapters/{chapter_id}/knowledge-points",
    response_model=KnowledgePointResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_chapter_knowledge_point(
    chapter_id: UUID,
    payload: KnowledgePointCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_knowledge_point(session, chapter_id, current_user.id, payload)
    except (
        KnowledgeNodeNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.patch("/knowledge-points/{point_id}", response_model=KnowledgePointResponse)
async def patch_knowledge_point(
    point_id: UUID,
    payload: KnowledgePointUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_knowledge_point(session, point_id, current_user.id, payload)
    except (
        KnowledgeNodeNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.post(
    "/courses/{course_id}/knowledge-points/merge",
    response_model=KnowledgePointResponse,
)
async def merge_course_knowledge_points(
    course_id: UUID,
    payload: KnowledgePointMergeRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await merge_knowledge_points(
            session,
            course_id,
            current_user.id,
            payload,
        )
    except (
        KnowledgeNodeNotFoundError,
        KnowledgeEditForbiddenError,
        KnowledgeStructureConflictError,
    ) as exc:
        raise _translate_edit_error(exc) from exc


@router.delete("/knowledge-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_knowledge_point(
    point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> None:
    try:
        await delete_knowledge_point(session, point_id, current_user.id)
    except (KnowledgeNodeNotFoundError, KnowledgeEditForbiddenError) as exc:
        raise _translate_edit_error(exc) from exc
