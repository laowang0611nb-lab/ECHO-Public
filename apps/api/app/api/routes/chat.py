from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import ChatProviderDep, CurrentUser, DBSession, EmbeddingProviderDep
from app.schemas.chat import (
    ChatStreamRequest,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
)
from app.services.chat import (
    ConversationForbiddenError,
    ConversationNotFoundError,
    create_conversation,
    list_conversations,
    list_messages,
    stream_chat_response,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError

router = APIRouter(tags=["chat"])


@router.post(
    "/courses/{course_id}/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course_conversation(
    course_id: UUID,
    payload: ConversationCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_conversation(session, course_id, current_user, payload)
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


@router.get(
    "/courses/{course_id}/conversations",
    response_model=list[ConversationResponse],
)
async def get_course_conversations(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_conversations(session, course_id, current_user.id)
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


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
)
async def get_conversation_messages(
    conversation_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_messages(session, conversation_id, current_user.id)
    except ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        ) from exc
    except ConversationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conversation access denied",
        ) from exc


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: UUID,
    payload: ChatStreamRequest,
    current_user: CurrentUser,
    session: DBSession,
    embedding_provider: EmbeddingProviderDep,
    chat_provider: ChatProviderDep,
):
    try:
        await list_messages(session, conversation_id, current_user.id)
    except ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        ) from exc
    except ConversationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conversation access denied",
        ) from exc

    async def event_stream():
        async for event in stream_chat_response(
            session,
            embedding_provider,
            chat_provider,
            conversation_id,
            current_user.id,
            payload.content,
            payload.retrieval_limit,
        ):
            yield event.encode()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
