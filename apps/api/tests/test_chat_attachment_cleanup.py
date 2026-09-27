from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from database.models.chat import ChatAttachment, ChatAttachmentKind
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.chat_attachment_cleanup import cleanup_expired_chat_attachments
from app.services.storage import LocalDocumentStorage


async def test_expired_unbound_attachment_is_removed_with_model_cache(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "attachment-cleanup@example.com",
            "display_name": "Cleanup User",
            "role": "student",
        },
    )
    user = response.json()
    storage = LocalDocumentStorage(tmp_path / "cleanup-attachments")
    storage_key = f"users/{user['id']}/expired.mp4"
    original = storage.path_for(storage_key)
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(b"video")
    model_cache = original.with_name(f".{original.stem}.model.mp4")
    model_cache.write_bytes(b"normalized")

    async with session_factory() as session:
        session.add(
            ChatAttachment(
                user_id=UUID(user["id"]),
                kind=ChatAttachmentKind.VIDEO,
                mime_type="video/mp4",
                file_name="expired.mp4",
                storage_key=storage_key,
                size_bytes=original.stat().st_size,
                expires_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await session.commit()

    async with session_factory() as session:
        deleted = await cleanup_expired_chat_attachments(session, storage)

    assert deleted == 1
    assert not original.exists()
    assert not model_cache.exists()
    async with session_factory() as session:
        attachment = await session.scalar(
            select(ChatAttachment.id).where(ChatAttachment.storage_key == storage_key)
        )
    assert attachment is None
