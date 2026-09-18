from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.auth.tokens import create_refresh_token, hash_refresh_token
from database.config import settings
from database.models.auth import AuthSession


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def create_auth_session(
    session: AsyncSession,
    user_id: UUID,
    *,
    device_name: str | None = None,
    user_agent: str | None = None,
    expires_delta: timedelta | None = None,
    now: datetime | None = None,
) -> tuple[AuthSession, str]:
    issued_at = now or datetime.now(UTC)
    raw_token, token_hash = create_refresh_token()
    auth_session = AuthSession(
        user_id=user_id,
        refresh_token_hash=token_hash,
        device_name=device_name,
        user_agent=user_agent,
        created_at=issued_at,
        last_used_at=issued_at,
        expires_at=issued_at
        + (expires_delta or timedelta(days=settings.auth_refresh_token_days)),
    )
    session.add(auth_session)
    await session.flush()
    return auth_session, raw_token


async def get_auth_session_by_refresh_token(
    session: AsyncSession,
    raw_refresh_token: str,
    *,
    now: datetime | None = None,
) -> AuthSession | None:
    current_time = _as_utc(now or datetime.now(UTC))
    auth_session = await session.scalar(
        select(AuthSession).where(
            AuthSession.refresh_token_hash == hash_refresh_token(raw_refresh_token)
        )
    )
    if auth_session is None:
        return None
    if (
        auth_session.revoked_at is not None
        or _as_utc(auth_session.expires_at) <= current_time
    ):
        return None
    return auth_session


async def revoke_auth_session(
    session: AsyncSession,
    auth_session: AuthSession,
    *,
    now: datetime | None = None,
) -> None:
    if auth_session.revoked_at is None:
        auth_session.revoked_at = now or datetime.now(UTC)
        await session.flush()


async def rotate_refresh_token(
    session: AsyncSession,
    raw_refresh_token: str,
    *,
    now: datetime | None = None,
) -> tuple[AuthSession, str] | None:
    auth_session = await get_auth_session_by_refresh_token(
        session,
        raw_refresh_token,
        now=now,
    )
    if auth_session is None:
        return None
    await revoke_auth_session(session, auth_session, now=now)
    return await create_auth_session(
        session,
        auth_session.user_id,
        device_name=auth_session.device_name,
        user_agent=auth_session.user_agent,
        now=now,
    )
