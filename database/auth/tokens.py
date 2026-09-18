import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from database.config import settings

JWT_ALGORITHM = settings.auth_jwt_algorithm
ACCESS_TOKEN_TYPE = "access"


def create_access_token(
    user_id: UUID,
    role: str,
    *,
    secret_key: str = settings.auth_secret_key,
    algorithm: str = JWT_ALGORITHM,
    expires_delta: timedelta | None = None,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + (
        expires_delta or timedelta(minutes=settings.auth_access_token_minutes)
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": ACCESS_TOKEN_TYPE,
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def decode_access_token(
    token: str,
    *,
    secret_key: str = settings.auth_secret_key,
    algorithm: str = JWT_ALGORITHM,
) -> dict[str, object]:
    payload = jwt.decode(token, secret_key, algorithms=[algorithm])
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise ValueError("token is not an access token")
    return payload


def create_refresh_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(48)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
