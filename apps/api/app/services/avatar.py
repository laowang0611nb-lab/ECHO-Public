from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from database.models.user import User
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.storage import DocumentTooLargeError, LocalDocumentStorage


class AvatarTooLargeError(Exception):
    pass


class UnsupportedAvatarTypeError(Exception):
    pass


class AvatarNotFoundError(Exception):
    pass


AVATAR_SIGNATURES: tuple[tuple[str, str, bytes], ...] = (
    ("image/jpeg", ".jpg", b"\xff\xd8\xff"),
    ("image/png", ".png", b"\x89PNG\r\n\x1a\n"),
)


def _detect_avatar_type(content: bytes) -> tuple[str, str] | None:
    for content_type, suffix, signature in AVATAR_SIGNATURES:
        if content.startswith(signature):
            return content_type, suffix
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


def avatar_content_type(path: Path) -> str:
    suffix = path.suffix.casefold()
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "image/jpeg"


async def upload_avatar(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    user: User,
    upload: UploadFile,
    max_bytes: int,
) -> str:
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise AvatarTooLargeError
    detected = _detect_avatar_type(content)
    if detected is None:
        raise UnsupportedAvatarTypeError
    content_type, suffix = detected
    if upload.content_type and upload.content_type not in {
        content_type,
        "application/octet-stream",
    }:
        raise UnsupportedAvatarTypeError

    storage_key = f"users/{user.id}/avatar/{uuid4().hex}{suffix}"
    previous_key = user.avatar_storage_key
    try:
        await storage.save_bytes(storage_key, content, max_bytes)
    except DocumentTooLargeError as exc:
        raise AvatarTooLargeError from exc

    version = hashlib.sha256(content).hexdigest()[:12]
    user.avatar_storage_key = storage_key
    user.avatar_url = f"/api/v1/users/{user.id}/avatar?v={version}"
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        storage.delete(storage_key)
        raise
    await session.refresh(user)
    if previous_key and previous_key != storage_key:
        storage.delete(previous_key)
    return user.avatar_url


async def delete_avatar(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    user: User,
) -> None:
    previous_key = user.avatar_storage_key
    user.avatar_storage_key = None
    user.avatar_url = None
    await session.commit()
    await session.refresh(user)
    if previous_key:
        storage.delete(previous_key)


async def get_avatar_path(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    user_id: UUID,
) -> tuple[Path, str]:
    user = await session.get(User, user_id)
    if user is None or not user.avatar_storage_key:
        raise AvatarNotFoundError
    path = storage.path_for(user.avatar_storage_key)
    if not path.is_file():
        raise AvatarNotFoundError
    return path, avatar_content_type(path)
