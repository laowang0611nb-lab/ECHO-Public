from typing import Annotated
from uuid import UUID

from database.models.chat import ChatAttachmentKind
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.dependencies import (
    ChatAttachmentStorageDep,
    ChatProviderDep,
    CurrentUser,
    DBSession,
    EmbeddingProviderDep,
)
from app.core.config import settings
from app.schemas.chat import (
    ChatAttachmentUploadResponse,
    ChatContinueRequest,
    ChatModalitiesResponse,
    ChatStreamRequest,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
    TeacherMessageResponse,
)
from app.services.chat import (
    ConversationForbiddenError,
    ConversationNotFoundError,
    StudentConversationTargetNotFoundError,
    continue_chat_response,
    create_conversation,
    list_conversation_messages_for_teacher,
    list_conversations,
    list_messages,
    list_student_conversations,
    stream_chat_response,
)
from app.services.chat_attachments import (
    ChatAttachmentFileMissingError,
    ChatAttachmentForbiddenError,
    ChatAttachmentInvalidStateError,
    ChatAttachmentInvalidTypeError,
    ChatAttachmentNotFoundError,
    ChatAttachmentTooLargeError,
    get_chat_attachment_path,
    upload_chat_attachment,
)
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError

router = APIRouter(tags=["chat"])


def _attachment_max_bytes(kind: ChatAttachmentKind) -> int:
    if kind == ChatAttachmentKind.IMAGE:
        return settings.chat_image_max_upload_bytes
    if kind == ChatAttachmentKind.AUDIO:
        return settings.chat_audio_max_upload_bytes
    return settings.chat_video_max_upload_bytes


def _attachment_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, ChatAttachmentInvalidTypeError):
        return HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_attachment_type", "message": str(exc)},
        )
    if isinstance(exc, ChatAttachmentTooLargeError):
        return HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={"code": "attachment_too_large", "message": str(exc)},
        )
    if isinstance(exc, ChatAttachmentForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "attachment_forbidden", "message": str(exc)},
        )
    if isinstance(exc, ChatAttachmentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "attachment_not_found", "message": str(exc)},
        )
    if isinstance(exc, (ChatAttachmentInvalidStateError, ChatAttachmentFileMissingError)):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "attachment_unavailable", "message": str(exc)},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "attachment_error", "message": str(exc)},
    )


@router.get("/chat/modalities", response_model=ChatModalitiesResponse)
async def get_chat_modalities(_current_user: CurrentUser) -> ChatModalitiesResponse:
    return ChatModalitiesResponse(
        input_modalities=["text", "image", "audio", "video"],
        output_modalities=["text"],
        attachments_enabled=True,
        message=(
            "支持文本、图片、音频和视频输入；模型对附件内容的理解取决于当前 Chat Provider 能力。"
        ),
    )


@router.post("/chat/attachments", response_model=ChatAttachmentUploadResponse)
async def upload_chat_attachment_endpoint(
    kind: Annotated[ChatAttachmentKind, Form()],
    file: Annotated[UploadFile, File()],
    current_user: CurrentUser,
    session: DBSession,
    storage: ChatAttachmentStorageDep,
) -> ChatAttachmentUploadResponse:
    try:
        attachment = await upload_chat_attachment(
            session,
            storage,
            user=current_user,
            kind=kind,
            upload=file,
            max_bytes=_attachment_max_bytes(kind),
            expiry_hours=settings.chat_attachment_expiry_hours,
        )
    except (
        ChatAttachmentInvalidTypeError,
        ChatAttachmentTooLargeError,
        ChatAttachmentForbiddenError,
        ChatAttachmentNotFoundError,
        ChatAttachmentInvalidStateError,
        ChatAttachmentFileMissingError,
    ) as exc:
        raise _attachment_http_exception(exc) from exc
    return ChatAttachmentUploadResponse(
        attachment=attachment,
        expires_at=attachment.expires_at,
    )


@router.get("/chat/attachments/{attachment_id}/file")
async def get_chat_attachment_file_endpoint(
    attachment_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    storage: ChatAttachmentStorageDep,
) -> FileResponse:
    try:
        attachment, path = await get_chat_attachment_path(
            session,
            storage,
            attachment_id,
            current_user.id,
        )
    except (
        ChatAttachmentNotFoundError,
        ChatAttachmentForbiddenError,
        ChatAttachmentFileMissingError,
    ) as exc:
        raise _attachment_http_exception(exc) from exc
    return FileResponse(
        path,
        media_type=attachment.mime_type,
        filename=attachment.file_name,
    )


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


@router.get(
    "/courses/{course_id}/students/{student_id}/conversations",
    response_model=list[ConversationResponse],
)
async def get_student_conversations_for_teacher(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_student_conversations(
            session,
            course_id,
            student_id,
            current_user.id,
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
    except ConversationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view student conversations",
        ) from exc
    except StudentConversationTargetNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student is not a member of this course",
        ) from exc


@router.get(
    "/courses/{course_id}/conversations/{conversation_id}/messages",
    response_model=list[TeacherMessageResponse],
)
async def get_conversation_messages_for_teacher(
    course_id: UUID,
    conversation_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_conversation_messages_for_teacher(
            session,
            course_id,
            conversation_id,
            current_user.id,
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
    except ConversationForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can view conversation evidence",
        ) from exc
    except ConversationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        ) from exc
    except StudentConversationTargetNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation owner is not a student in this course",
        ) from exc


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: UUID,
    payload: ChatStreamRequest,
    current_user: CurrentUser,
    session: DBSession,
    embedding_provider: EmbeddingProviderDep,
    chat_provider: ChatProviderDep,
    attachment_storage: ChatAttachmentStorageDep,
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
            payload.client_request_id,
            payload.knowledge_point_id,
            payload.retrieval_limit,
            [attachment.id for attachment in payload.attachments],
            attachment_storage,
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


@router.post("/conversations/{conversation_id}/messages/{message_id}/continue")
async def continue_message(
    conversation_id: UUID,
    message_id: UUID,
    payload: ChatContinueRequest,
    current_user: CurrentUser,
    session: DBSession,
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
        async for event in continue_chat_response(
            session,
            chat_provider,
            conversation_id,
            message_id,
            current_user.id,
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
