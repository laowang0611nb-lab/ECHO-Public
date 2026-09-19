from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from database.auth.password import hash_password, verify_password
from database.auth.tokens import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_refresh_token,
)
from database.config import DEFAULT_AUTH_SECRET, DatabaseSettings
from pydantic import ValidationError


def test_access_token_contains_minimal_identity_claims() -> None:
    user_id = uuid4()
    session_id = uuid4()
    token = create_access_token(user_id, "teacher", session_id=session_id)

    payload = decode_access_token(token)

    assert payload["sub"] == str(user_id)
    assert payload["sid"] == str(session_id)
    assert payload["role"] == "teacher"
    assert payload["type"] == "access"
    assert "password" not in payload
    assert "profile" not in payload


def test_expired_access_token_is_rejected() -> None:
    now = datetime.now(UTC)
    token = create_access_token(
        uuid4(),
        "student",
        now=now,
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_refresh_token_is_random_and_only_hash_is_stored() -> None:
    first_token, first_hash = create_refresh_token()
    second_token, second_hash = create_refresh_token()

    assert first_token != second_token
    assert first_hash == hash_refresh_token(first_token)
    assert second_hash == hash_refresh_token(second_token)
    assert first_hash != first_token


def test_password_hash_preserves_password_content() -> None:
    password_hash, _ = hash_password("  spaced password  ")

    assert verify_password("  spaced password  ", password_hash)
    assert not verify_password("spaced password", password_hash)

    with pytest.raises(ValueError):
        hash_password("   ")


def test_production_rejects_default_auth_secret() -> None:
    with pytest.raises(ValidationError):
        DatabaseSettings(
            environment="production",
            auth_secret_key=DEFAULT_AUTH_SECRET,
        )

    settings = DatabaseSettings(
        environment="production",
        auth_secret_key="production-secret-with-sufficient-entropy",
    )
    assert settings.environment == "production"
