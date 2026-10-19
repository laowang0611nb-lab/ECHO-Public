from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import ChatProviderDep, CurrentUser, DBSession
from app.api.routes.sse import stream_with_heartbeat
from app.schemas.teacher_assistant import (
    TeacherAssistantCapabilities,
    TeacherAssistantMessage,
    TeacherAssistantMessageCreateRequest,
)
from app.services.teacher_assistant import (
    TeacherAssistantContextInvalidError,
    TeacherAssistantDisabledError,
    TeacherAssistantForbiddenError,
    TeacherAssistantNotFoundError,
    TeacherAssistantProviderUnavailableError,
    complete_teacher_assistant_message,
    ensure_teacher_assistant_enabled,
    get_teacher_assistant_capabilities,
    stream_teacher_assistant_message,
    validate_teacher_assistant_context,
)

router = APIRouter(tags=["teacher-assistant"])


def _assistant_error(
    code: str,
    message: str,
    status_code: int,
) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _translate_assistant_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TeacherAssistantDisabledError):
        return _assistant_error(
            "ASSISTANT_DISABLED",
            "教师 AI 助手当前未启用",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if isinstance(exc, TeacherAssistantForbiddenError):
        return _assistant_error(
            "ASSISTANT_FORBIDDEN",
            "只有当前课程教师可以使用 AI 助手",
            status.HTTP_403_FORBIDDEN,
        )
    if isinstance(exc, TeacherAssistantNotFoundError):
        return _assistant_error(
            "ASSISTANT_COURSE_NOT_FOUND",
            "课程不存在",
            status.HTTP_404_NOT_FOUND,
        )
    if isinstance(exc, TeacherAssistantContextInvalidError):
        return _assistant_error(
            "ASSISTANT_CONTEXT_INVALID",
            "页面上下文不属于当前课程或对象已失效",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if isinstance(exc, TeacherAssistantProviderUnavailableError):
        return _assistant_error(
            "ASSISTANT_PROVIDER_UNAVAILABLE",
            "模型服务暂时不可用",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return _assistant_error(
        "ASSISTANT_TOOL_UNAVAILABLE",
        "教师 AI 助手服务暂时不可用",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@router.get(
    "/courses/{course_id}/assistant/capabilities",
    response_model=TeacherAssistantCapabilities,
)
async def read_teacher_assistant_capabilities(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        await validate_teacher_assistant_context(
            session,
            course_id,
            current_user.id,
            None,
        )
        return get_teacher_assistant_capabilities()
    except (
        TeacherAssistantDisabledError,
        TeacherAssistantForbiddenError,
        TeacherAssistantNotFoundError,
        TeacherAssistantContextInvalidError,
    ) as exc:
        raise _translate_assistant_error(exc) from exc


@router.post(
    "/courses/{course_id}/assistant/messages",
    response_model=TeacherAssistantMessage,
)
async def send_teacher_assistant_message(
    course_id: UUID,
    payload: TeacherAssistantMessageCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
):
    try:
        ensure_teacher_assistant_enabled()
        context = await validate_teacher_assistant_context(
            session,
            course_id,
            current_user.id,
            payload.page_context,
        )
        return await complete_teacher_assistant_message(
            session,
            provider,
            course_id,
            current_user.id,
            payload,
            context,
        )
    except (
        TeacherAssistantDisabledError,
        TeacherAssistantForbiddenError,
        TeacherAssistantNotFoundError,
        TeacherAssistantContextInvalidError,
        TeacherAssistantProviderUnavailableError,
    ) as exc:
        raise _translate_assistant_error(exc) from exc


@router.post("/courses/{course_id}/assistant/messages/stream")
async def stream_teacher_assistant_message_endpoint(
    course_id: UUID,
    payload: TeacherAssistantMessageCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
):
    try:
        ensure_teacher_assistant_enabled()
        context = await validate_teacher_assistant_context(
            session,
            course_id,
            current_user.id,
            payload.page_context,
        )
    except (
        TeacherAssistantDisabledError,
        TeacherAssistantForbiddenError,
        TeacherAssistantNotFoundError,
        TeacherAssistantContextInvalidError,
    ) as exc:
        raise _translate_assistant_error(exc) from exc

    async def event_stream():
        events = stream_teacher_assistant_message(
            session,
            provider,
            course_id,
            current_user.id,
            payload,
            context,
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
