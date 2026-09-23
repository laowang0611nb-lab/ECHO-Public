from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from database.models.chat import ChatAttachment, ChatAttachmentKind, Conversation
from database.models.user import User
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.storage import LocalDocumentStorage
from app.services.teacher_access import (
    TeacherContentForbiddenError,
    TeacherContentNotFoundError,
    ensure_teacher,
)

IMAGE_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
AUDIO_MIME_TYPES = {
    "audio/aac": ".aac",
    "audio/m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-m4a": ".m4a",
}
VIDEO_MIME_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/3gpp": ".3gp",
}
MIME_TYPES_BY_KIND: dict[ChatAttachmentKind, dict[str, str]] = {
    ChatAttachmentKind.IMAGE: IMAGE_MIME_TYPES,
    ChatAttachmentKind.AUDIO: AUDIO_MIME_TYPES,
    ChatAttachmentKind.VIDEO: VIDEO_MIME_TYPES,
}


class ChatAttachmentError(Exception):
    pass


class ChatAttachmentNotFoundError(ChatAttachmentError):
    pass


class ChatAttachmentForbiddenError(ChatAttachmentError):
    pass


class ChatAttachmentInvalidTypeError(ChatAttachmentError):
    pass


class ChatAttachmentTooLargeError(ChatAttachmentError):
    pass


class ChatAttachmentInvalidStateError(ChatAttachmentError):
    pass


class ChatAttachmentFileMissingError(ChatAttachmentError):
    pass


async def upload_chat_attachment(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    *,
    user: User,
    kind: ChatAttachmentKind,
    upload: UploadFile,
    max_bytes: int,
    expiry_hours: int,
) -> ChatAttachment:
    mime_types = MIME_TYPES_BY_KIND[kind]
    mime_type = (upload.content_type or "").strip().lower()
    extension = mime_types.get(mime_type)
    if extension is None:
        raise ChatAttachmentInvalidTypeError
    file_name = _normalize_file_name(upload.filename, extension)
    attachment_id = uuid4()
    storage_key = f"users/{user.id}/{attachment_id}{extension}"
    try:
        size_bytes = await storage.save(storage_key, upload, max_bytes)
    except Exception as exc:
        from app.services.storage import DocumentTooLargeError

        if isinstance(exc, DocumentTooLargeError):
            raise ChatAttachmentTooLargeError from exc
        raise
    if size_bytes <= 0:
        storage.delete(storage_key)
        raise ChatAttachmentInvalidTypeError
    path = storage.path_for(storage_key)
    width, height = (
        _read_image_dimensions(path) if kind == ChatAttachmentKind.IMAGE else (None, None)
    )
    attachment = ChatAttachment(
        id=attachment_id,
        user_id=user.id,
        kind=kind,
        mime_type=mime_type,
        file_name=file_name,
        storage_key=storage_key,
        size_bytes=size_bytes,
        width=width,
        height=height,
        expires_at=datetime.now(UTC) + timedelta(hours=expiry_hours),
    )
    session.add(attachment)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        storage.delete(storage_key)
        raise
    await session.refresh(attachment)
    return attachment


async def resolve_message_attachments(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
    attachment_ids: list[UUID],
) -> list[ChatAttachment]:
    if not attachment_ids:
        return []
    attachments = list(
        await session.scalars(
            select(ChatAttachment).where(
                ChatAttachment.id.in_(attachment_ids),
                ChatAttachment.user_id == user_id,
                ChatAttachment.message_id.is_(None),
            )
        )
    )
    by_id = {attachment.id: attachment for attachment in attachments}
    if len(by_id) != len(set(attachment_ids)):
        raise ChatAttachmentNotFoundError
    now = datetime.now(UTC)
    for attachment in attachments:
        if attachment.expires_at is not None and _as_utc(attachment.expires_at) <= now:
            raise ChatAttachmentInvalidStateError
        attachment.conversation_id = conversation_id
        attachment.attached_at = now
        attachment.expires_at = None
    await session.flush()
    return [by_id[attachment_id] for attachment_id in attachment_ids]


async def get_chat_attachment(
    session: AsyncSession,
    attachment_id: UUID,
    requester_id: UUID,
) -> ChatAttachment:
    attachment = await session.get(ChatAttachment, attachment_id)
    if attachment is None:
        raise ChatAttachmentNotFoundError
    if attachment.user_id == requester_id:
        return attachment
    if attachment.conversation_id is None:
        raise ChatAttachmentForbiddenError
    conversation = await session.get(Conversation, attachment.conversation_id)
    if conversation is None:
        raise ChatAttachmentNotFoundError
    try:
        await ensure_teacher(session, conversation.course_id, requester_id)
    except (TeacherContentForbiddenError, TeacherContentNotFoundError) as exc:
        raise ChatAttachmentForbiddenError from exc
    return attachment


async def get_chat_attachment_path(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    attachment_id: UUID,
    requester_id: UUID,
) -> tuple[ChatAttachment, Path]:
    attachment = await get_chat_attachment(session, attachment_id, requester_id)
    path = storage.path_for(attachment.storage_key)
    if not path.is_file():
        raise ChatAttachmentFileMissingError
    return attachment, path


def attachment_to_model_content(attachment: ChatAttachment, path: Path) -> dict[str, object]:
    if attachment.kind == ChatAttachmentKind.IMAGE:
        return {
            "type": "image_url",
            "image_url": {
                "url": _data_url(attachment.mime_type, path),
            },
        }
    if attachment.kind == ChatAttachmentKind.AUDIO:
        return {
            "type": "input_audio",
            "input_audio": {
                "data": _base64_file(path),
                "format": _audio_format(attachment.mime_type),
            },
        }
    return {
        "type": "video_url",
        "video_url": {
            "url": _data_url(attachment.mime_type, path),
        },
    }


def attachment_context_text(attachments: list[ChatAttachment]) -> str:
    if not attachments:
        return ""
    lines = ["\n\n[学生上传的附件]"]
    for attachment in attachments:
        lines.append(
            f"- {attachment.kind.value}: {attachment.file_name or '未命名附件'} "
            f"({attachment.mime_type}, {attachment.size_bytes} bytes, "
            f"attachment_id={attachment.id})"
        )
        if attachment.transcript:
            lines.append(f"  音频转写：{attachment.transcript}")
    return "\n".join(lines)


def _read_image_dimensions(path: Path) -> tuple[int | None, int | None]:
    data = path.read_bytes()[:32]
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
        if width > 0 and height > 0:
            return width, height
        return None, None
    if data.startswith(b"\xff\xd8"):
        # JPEG dimensions are parsed from the first few markers.
        try:
            end = min(path.stat().st_size, 64 * 1024)
            raw = path.read_bytes()[:end]
            index = 2
            while index + 9 < len(raw):
                if raw[index] != 0xFF:
                    index += 1
                    continue
                marker = raw[index + 1]
                index += 2
                if marker in {0xD8, 0xD9}:
                    continue
                if index + 2 > len(raw):
                    break
                length = int.from_bytes(raw[index : index + 2], "big")
                if length < 2 or index + length > len(raw):
                    break
                if marker in {
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                }:
                    return (
                        int.from_bytes(raw[index + 3 : index + 5], "big"),
                        int.from_bytes(raw[index + 1 : index + 3], "big"),
                    )
                index += length
        except (OSError, ValueError):
            return None, None
    return None, None


def _normalize_file_name(file_name: str | None, extension: str) -> str:
    normalized = Path(file_name or "attachment").name.strip()
    if not normalized:
        normalized = f"attachment{extension}"
    if Path(normalized).suffix == "":
        normalized += extension
    return normalized[:255]


def _data_url(mime_type: str, path: Path) -> str:
    return f"data:{mime_type};base64,{_base64_file(path)}"


def _base64_file(path: Path) -> str:
    import base64

    return base64.b64encode(path.read_bytes()).decode("ascii")


def _audio_format(mime_type: str) -> str:
    if mime_type in {"audio/m4a", "audio/mp4", "audio/x-m4a"}:
        return "m4a"
    if mime_type in {"audio/wav", "audio/x-wav"}:
        return "wav"
    if mime_type in {"audio/mpeg", "audio/mp3"}:
        return "mp3"
    return "webm"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
