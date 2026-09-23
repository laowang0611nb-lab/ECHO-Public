from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import ChatProviderDep, CurrentUser, DBSession
from app.schemas.analysis import (
    AIAnalysisCreateRequest,
    AIAnalysisPage,
    AIAnalysisReanalyzeRequest,
    AIAnalysisResponse,
    AIAnalysisResultResponse,
    AIAnalysisStrategyRequest,
)
from app.schemas.planning import TeachingStrategyDetail
from app.services.analysis import (
    AIAnalysisConflictError,
    AIAnalysisNotFoundError,
    create_initial_analysis,
    create_strategy_from_analysis,
    get_analysis,
    get_analysis_result,
    list_analyses,
    reanalyze,
)
from app.services.analysis_generation import AIAnalysisProviderError
from app.services.chat_provider import (
    ChatConfigurationError,
    ChatProviderError,
)
from app.services.teacher_access import (
    TeacherContentForbiddenError,
    TeacherContentNotFoundError,
)

router = APIRouter(tags=["ai-analysis"])


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, (TeacherContentNotFoundError, AIAnalysisNotFoundError)):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI analysis resource not found",
        )
    if isinstance(exc, TeacherContentForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can access AI analysis",
        )
    if isinstance(exc, AIAnalysisConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc) or "AI analysis conflicts with existing state",
        )
    if isinstance(exc, ChatConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI analysis provider is not configured",
        )
    if isinstance(exc, (ChatProviderError, AIAnalysisProviderError)):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis provider failed",
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="AI analysis operation conflicts with existing state",
    )


@router.post(
    "/courses/{course_id}/ai-analysis",
    response_model=AIAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_analysis_endpoint(
    course_id: UUID,
    payload: AIAnalysisCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
) -> AIAnalysisResponse:
    try:
        return await create_initial_analysis(
            session,
            provider,
            course_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        AIAnalysisConflictError,
        ChatConfigurationError,
        ChatProviderError,
        AIAnalysisProviderError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/courses/{course_id}/ai-analysis",
    response_model=AIAnalysisPage,
)
async def list_analyses_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    knowledge_point_id: Annotated[
        UUID | None,
        Query(alias="knowledgePointId"),
    ] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AIAnalysisPage:
    try:
        return await list_analyses(
            session,
            course_id,
            current_user.id,
            knowledge_point_id=knowledge_point_id,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate(exc) from exc


@router.get(
    "/courses/{course_id}/ai-analysis/{analysis_id}",
    response_model=AIAnalysisResponse,
)
async def get_analysis_endpoint(
    course_id: UUID,
    analysis_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> AIAnalysisResponse:
    try:
        return await get_analysis(
            session,
            course_id,
            analysis_id,
            current_user.id,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        AIAnalysisNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/courses/{course_id}/ai-analysis/{analysis_id}/result",
    response_model=AIAnalysisResultResponse,
)
async def get_analysis_result_endpoint(
    course_id: UUID,
    analysis_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> AIAnalysisResultResponse:
    try:
        return await get_analysis_result(
            session,
            course_id,
            analysis_id,
            current_user.id,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        AIAnalysisNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze",
    response_model=AIAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
)
async def reanalyze_endpoint(
    course_id: UUID,
    analysis_id: UUID,
    payload: AIAnalysisReanalyzeRequest | None,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
) -> AIAnalysisResponse:
    try:
        return await reanalyze(
            session,
            provider,
            course_id,
            analysis_id,
            current_user.id,
            payload or AIAnalysisReanalyzeRequest(),
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        AIAnalysisNotFoundError,
        AIAnalysisConflictError,
        ChatConfigurationError,
        ChatProviderError,
        AIAnalysisProviderError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/courses/{course_id}/ai-analysis/{analysis_id}/strategy",
    response_model=TeachingStrategyDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_analysis_strategy_endpoint(
    course_id: UUID,
    analysis_id: UUID,
    payload: AIAnalysisStrategyRequest | None,
    current_user: CurrentUser,
    session: DBSession,
) -> TeachingStrategyDetail:
    try:
        return await create_strategy_from_analysis(
            session,
            course_id,
            analysis_id,
            current_user.id,
            payload or AIAnalysisStrategyRequest(),
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        AIAnalysisNotFoundError,
        AIAnalysisConflictError,
    ) as exc:
        raise _translate(exc) from exc
