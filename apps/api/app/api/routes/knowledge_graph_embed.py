from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.knowledge_graph_embed import (
    KnowledgeGraphEmbedAccessTokenResponse,
    KnowledgeGraphEmbedExchangeRequest,
    KnowledgeGraphEmbedSessionResponse,
)
from app.services.knowledge_graph_embed import (
    KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS,
    KnowledgeGraphEmbedCourseNotFoundError,
    KnowledgeGraphEmbedForbiddenError,
    KnowledgeGraphEmbedTicketInvalidError,
    create_knowledge_graph_embed_session,
    exchange_knowledge_graph_embed_session,
)

router = APIRouter(tags=["knowledge-graph-embed"])


@router.post(
    "/courses/{course_id}/knowledge-graph/embed-session",
    response_model=KnowledgeGraphEmbedSessionResponse,
)
async def create_embed_session(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
) -> KnowledgeGraphEmbedSessionResponse:
    try:
        ticket, expires_in_seconds = await create_knowledge_graph_embed_session(
            session,
            course_id,
            current_user,
        )
    except KnowledgeGraphEmbedCourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except KnowledgeGraphEmbedForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only active course students can create a knowledge graph embed session",
        ) from exc
    return KnowledgeGraphEmbedSessionResponse(
        ticket=ticket,
        expires_in_seconds=expires_in_seconds,
    )


@router.post(
    "/knowledge-graph/embed-sessions/exchange",
    response_model=KnowledgeGraphEmbedAccessTokenResponse,
)
async def exchange_embed_session(
    payload: KnowledgeGraphEmbedExchangeRequest,
    session: DBSession,
) -> KnowledgeGraphEmbedAccessTokenResponse:
    try:
        token_data = await exchange_knowledge_graph_embed_session(
            session,
            payload.ticket,
            payload.course_id,
        )
    except KnowledgeGraphEmbedCourseNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        ) from exc
    except KnowledgeGraphEmbedForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Knowledge graph access forbidden",
        ) from exc
    except KnowledgeGraphEmbedTicketInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Knowledge graph embed ticket is invalid, expired, or already used",
        ) from exc
    return KnowledgeGraphEmbedAccessTokenResponse(
        access_token=token_data.access_token,
        expires_in_seconds=KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS,
        course_id=token_data.course_id,
    )
