import asyncio
import logging
from datetime import UTC, datetime, timedelta

from database.db.session import async_session_factory
from database.models.chat import ChatAttachment
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.services.storage import LocalDocumentStorage

logger = logging.getLogger(__name__)


async def cleanup_expired_chat_attachments(
    session: AsyncSession,
    storage: LocalDocumentStorage,
    *,
    now: datetime | None = None,
    orphan_grace_hours: int | None = None,
) -> int:
    cutoff = now or datetime.now(UTC)
    grace_hours = (
        settings.chat_attachment_expiry_hours if orphan_grace_hours is None else orphan_grace_hours
    )
    stale_orphan_cutoff = cutoff - timedelta(hours=grace_hours)
    attachments = list(
        await session.scalars(
            select(ChatAttachment).where(
                ChatAttachment.message_id.is_(None),
                or_(
                    and_(
                        ChatAttachment.expires_at.is_not(None),
                        ChatAttachment.expires_at <= cutoff,
                    ),
                    and_(
                        ChatAttachment.conversation_id.is_not(None),
                        ChatAttachment.expires_at.is_(None),
                        ChatAttachment.created_at <= stale_orphan_cutoff,
                    ),
                ),
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
