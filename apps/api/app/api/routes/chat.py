from typing import Annotated, Literal
from uuid import UUID

from database.models.chat import ChatAttachmentKind
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.dependencies import (
    ASRProviderDep,
    ChatAttachmentStorageDep,
    ChatProviderDep,
    CurrentUser,
    DBSession,
    EmbeddingProviderDep,
)
from app.api.routes.sse import stream_with_heartbeat
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
    MIME_TYPES_BY_KIND,
    ChatAttachmentFileMissingError,
    ChatAttachmentForbiddenError,
    ChatAttachmentInvalidStateError,
    ChatAttachmentInvalidTypeError,
    ChatAttachmentNotFoundError,
    ChatAttachmentTooLargeError,
    get_chat_attachment_path,
    upload_chat_attachment,
)
from app.services.chat_media import video_media_available
from app.services.course import CourseMembershipRequiredError, CourseNotFoundError
from app.services.resource_limits import (
    RateLimitExceededError,
    enforce_chat_rate_limit,
)

router = APIRouter(tags=["chat"])


def _attachment_max_bytes(kind: ChatAttachmentKind) -> int:
    if kind == ChatAttachmentKind.IMAGE:
        return settings.chat_image_max_upload_bytes
    if kind == ChatAttachmentKind.AUDIO:
        return settings.chat_audio_max_upload_bytes
    return settings.chat_video_max_upload_bytes


def _attachment_http_exception(
    exc: Exception,
    *,
    kind: ChatAttachmentKind | None = None,
) -> HTTPException:
    if isinstance(exc, ChatAttachmentInvalidTypeError):
        detail: dict[str, object] = {
            "code": "CHAT_ATTACHMENT_INVALID_TYPE",
            "message": str(exc),
        }
        if kind is not None:
            detail["kind"] = kind.value
            detail["allowed_mime_types"] = sorted(MIME_TYPES_BY_KIND[kind])
        return HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=detail,
        )
    if isinstance(exc, ChatAttachmentTooLargeError):
        limit_bytes = exc.max_bytes
        detail = {
            "code": "CHAT_ATTACHMENT_TOO_LARGE",
            "message": str(exc),
            "limit_bytes": limit_bytes,
            "limit_mb": round(limit_bytes / (1024 * 1024), 2),
        }
        if kind is not None:
            detail["kind"] = kind.value
        return HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=detail,
        )
    if isinstance(exc, ChatAttachmentForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CHAT_ATTACHMENT_FORBIDDEN", "message": str(exc)},
        )
    if isinstance(exc, ChatAttachmentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CHAT_ATTACHMENT_NOT_FOUND", "message": str(exc)},
        )
    if isinstance(exc, (ChatAttachmentInvalidStateError, ChatAttachmentFileMissingError)):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CHAT_ATTACHMENT_UNAVAILABLE", "message": str(exc)},
        )
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": "CHAT_ATTACHMENT_ERROR", "message": str(exc)},
    )


@router.get("/chat/modalities", response_model=ChatModalitiesResponse)
async def get_chat_modalities(
    _current_user: CurrentUser,
    asr_provider: ASRProviderDep,
) -> ChatModalitiesResponse:
    provider_ready = bool(settings.chat_api_key and settings.chat_model)
    modalities: list[Literal["text", "image", "audio", "video"]] = []
    unavailable: list[str] = []
    if provider_ready:
        modalities.extend(["text", "image"])
    else:
        unavailable.append("Chat Provider 未配置")
    if asr_provider is not None:
        modalities.append("audio")
    else:
        unavailable.append("ASR 未启用或未配置")
    if video_media_available():
        modalities.append("video")
    else:
        unavailable.append("视频临时文件服务未启用")
    limits = (
        f"图片上限 {settings.chat_image_max_upload_bytes // (1024 * 1024)} MB，"
        f"音频上限 {settings.chat_audio_max_upload_bytes // (1024 * 1024)} MB，"
        f"视频上限 {settings.chat_video_max_upload_bytes // (1024 * 1024)} MB。"
    )
    message = limits
    if unavailable:
        message = f"{message} 当前不可用：{'；'.join(unavailable)}。"
    return ChatModalitiesResponse(
        input_modalities=modalities,
        output_modalities=["text"],
        attachments_enabled=bool({"image", "audio", "video"}.intersection(modalities)),
        message=message,
    )


@router.post("/chat/attachments", response_model=ChatAttachmentUploadResponse)
async def upload_chat_attachment_endpoint(
    kind: Annotated[ChatAttachmentKind, Form()],
    file: Annotated[UploadFile, File()],
    current_user: CurrentUser,
    session: DBSession,
    storage: ChatAttachmentStorageDep,
) -> ChatAttachmentUploadResponse:
    if kind == ChatAttachmentKind.VIDEO and not settings.chat_video_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "CHAT_VIDEO_DISABLED",
                "message": "本轮公网比赛演示不开放视频输入",
                "kind": kind.value,
            },
        )
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
        raise _attachment_http_exception(exc, kind=kind) from exc
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
    asr_provider: ASRProviderDep,
    attachment_storage: ChatAttachmentStorageDep,
):
    try:
        enforce_chat_rate_limit(str(current_user.id))
    except RateLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "CHAT_RATE_LIMITED",
                "message": "聊天请求过于频繁，请稍后再试",
            },
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
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
        events = stream_chat_response(
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
            asr_provider,
        )
        async for frame in stream_with_heartbeat(events):
            yield frame

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
        enforce_chat_rate_limit(str(current_user.id))
    except RateLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "CHAT_RATE_LIMITED",
                "message": "聊天请求过于频繁，请稍后再试",
            },
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
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
        events = continue_chat_response(
            session,
            chat_provider,
            conversation_id,
            message_id,
            current_user.id,
        )
        async for frame in stream_with_heartbeat(events):
            yield frame

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
