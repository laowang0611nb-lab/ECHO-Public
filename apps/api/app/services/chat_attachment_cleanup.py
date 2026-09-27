import asyncio
import logging
from datetime import UTC, datetime

from database.db.session import async_session_factory
from database.models.chat import ChatAttachment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.storage import LocalDocumentStorage

logger = logging.getLogger(__name__)


async def cleanup_expired_chat_attachments(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    *,
    now: datetime | None = None,
) -> int:
    cutoff = now or datetime.now(UTC)
    attachments = list(
        await session.scalars(
            select(ChatAttachment).where(
                ChatAttachment.message_id.is_(None),
                ChatAttachment.expires_at.is_not(None),
                ChatAttachment.expires_at <= cutoff,
            )
        )
    )
    for attachment in attachments:
        _delete_attachment_files(storage, attachment.storage_key)
        await session.delete(attachment)
    if attachments:
        await session.commit()
    return len(attachments)


def _delete_attachment_files(storage: LocalDocumentStorage, storage_key: str) -> None:
    path = storage.path_for(storage_key)
    path.unlink(missing_ok=True)
    path.with_name(f".{path.stem}.model.mp4").unlink(missing_ok=True)
    path.with_name(f".{path.stem}.model.part.mp4").unlink(missing_ok=True)


async def run_chat_attachment_cleanup_loop(
    storage: LocalDocumentStorage,
    *,
    interval_seconds: int,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    factory = session_factory or async_session_factory
    while True:
        try:
            async with factory() as session:
                await cleanup_expired_chat_attachments(session, storage)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Expired chat attachment cleanup failed")
        await asyncio.sleep(max(60, interval_seconds))
