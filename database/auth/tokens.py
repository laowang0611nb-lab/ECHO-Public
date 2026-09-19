import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from database.config import settings

JWT_ALGORITHM = settings.auth_jwt_algorithm
ACCESS_TOKEN_TYPE = "access"
PHONE_VERIFICATION_TOKEN_TYPE = "phone_verification"
PHONE_VERIFICATION_PURPOSE = "phone_verification"


def create_phone_verification_token(
    phone: str,
    *,
    purpose: str = PHONE_VERIFICATION_PURPOSE,
    secret_key: str = settings.auth_secret_key,
    algorithm: str = JWT_ALGORITHM,
    expires_delta: timedelta | None = None,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + (expires_delta or timedelta(minutes=5))
    payload = {
        "phone": phone,
        "purpose": purpose,
        "type": PHONE_VERIFICATION_TOKEN_TYPE,
        "jti": secrets.token_urlsafe(16),
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, secret_key, algorithm=algorithm)


def decode_phone_verification_token(
    token: str,
    *,
    purpose: str = PHONE_VERIFICATION_PURPOSE,
    secret_key: str = settings.auth_secret_key,
    algorithm: str = JWT_ALGORITHM,
) -> dict[str, object]:
    payload = jwt.decode(token, secret_key, algorithms=[algorithm])
    if payload.get("type") != PHONE_VERIFICATION_TOKEN_TYPE:
        raise ValueError("token is not a phone verification token")
    if payload.get("purpose") != purpose:
        raise ValueError("phone verification token purpose does not match")
    if not payload.get("phone") or not payload.get("jti"):
        raise ValueError("phone verification token is missing required claims")
    return payload


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
