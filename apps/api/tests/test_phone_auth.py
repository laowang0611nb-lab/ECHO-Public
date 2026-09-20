from uuid import UUID

from database.auth.tokens import decode_phone_verification_token
from database.models.auth import PhoneVerificationClaim, UserCredential
from database.models.user import User, UserRole
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

PHONE = "13800138000"
PASSWORD = "StrongPass123"
NEW_PASSWORD = "NewStrongPass456"


async def issue_token(
    client: AsyncClient,
    *,
    phone: str = PHONE,
    purpose: str = "register",
) -> str:
    payload = {"phone": phone, "code": "8043", "purpose": purpose}
    response = await client.post("/api/v1/auth/sms/verify", json=payload)
    assert response.status_code == 200
    return response.json()["verification_token"]


async def register_teacher(
    client: AsyncClient,
    *,
    phone: str = PHONE,
    display_name: str = "Teacher One",
    password: str = PASSWORD,
    purpose: str = "register",
) -> dict:
    token = await issue_token(client, phone=phone, purpose=purpose)
    response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": phone,
            "verification_token": token,
            "display_name": display_name,
            "password": password,
            "role": "teacher",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_sms_registration_creates_user_session_and_consumes_token(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    token = await issue_token(client, purpose="register")
    payload = decode_phone_verification_token(token, purpose="register")

    response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": PHONE,
            "verification_token": token,
            "display_name": "Teacher One",
            "password": PASSWORD,
            "role": "teacher",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["phone"] == PHONE
    assert body["user"]["role"] == "teacher"
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]

    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]

    async with session_factory() as session:
        user = await session.scalar(select(User).where(User.phone == PHONE))
        assert user is not None
        assert user.role == UserRole.TEACHER
        assert await session.get(UserCredential, UUID(body["user"]["id"])) is not None
        claim = await session.get(PhoneVerificationClaim, str(payload["jti"]))
        assert claim is not None
        assert claim.consumed_at is not None

    reused = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": PHONE,
            "verification_token": token,
            "display_name": "Duplicate",
            "password": PASSWORD,
            "role": "teacher",
        },
    )
    assert reused.status_code == 400
    assert reused.json()["detail"]["code"] == "AUTH_VERIFICATION_TOKEN_INVALID"


async def test_sms_registration_rejects_duplicate_phone(client: AsyncClient) -> None:
    await register_teacher(client)
    second_token = await issue_token(client, purpose="register")

    response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": PHONE,
            "verification_token": second_token,
            "display_name": "Another Teacher",
            "password": PASSWORD,
            "role": "teacher",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "AUTH_PHONE_ALREADY_REGISTERED"


async def test_password_login_works_with_phone_and_rejects_wrong_password(
    client: AsyncClient,
) -> None:
    registered = await register_teacher(client)

    wrong = await client.post(
        "/api/v1/auth/login/password",
        json={"phone": PHONE, "password": "WrongPass123"},
    )
    assert wrong.status_code == 401
    assert wrong.json()["detail"]["code"] == "AUTH_INVALID_PASSWORD"

    correct = await client.post(
        "/api/v1/auth/login/password",
        json={"phone": PHONE, "password": PASSWORD},
    )
    assert correct.status_code == 200
    assert correct.json()["user"]["id"] == registered["user"]["id"]


async def test_password_login_works_with_generated_email(client: AsyncClient) -> None:
    registered = await register_teacher(client)

    response = await client.post(
        "/api/v1/auth/login/password",
        json={"email": registered["user"]["email"], "password": PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == registered["user"]["id"]


async def test_password_reset_consumes_token_and_revokes_sessions(
    client: AsyncClient,
) -> None:
    registered = await register_teacher(client)
    reset_token = await issue_token(client, purpose="password_reset")

    reset = await client.post(
        "/api/v1/auth/password/reset",
        json={
            "phone": PHONE,
            "verification_token": reset_token,
            "new_password": NEW_PASSWORD,
        },
    )

    assert reset.status_code == 200
    body = reset.json()
    assert body["success"] is True
    assert body["sessions_revoked"] >= 1

    old_login = await client.post(
        "/api/v1/auth/login/password",
        json={"phone": PHONE, "password": PASSWORD},
    )
    new_login = await client.post(
        "/api/v1/auth/login/password",
        json={"phone": PHONE, "password": NEW_PASSWORD},
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200

    stale_refresh = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert stale_refresh.status_code == 401
    assert stale_refresh.json()["detail"]["code"] == "AUTH_SESSION_INVALID"


async def test_refresh_rotates_token_and_old_refresh_token_is_rejected(
    client: AsyncClient,
) -> None:
    registered = await register_teacher(client)

    refreshed = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert refreshed.status_code == 200
    rotated = refreshed.json()
    assert rotated["refresh_token"] != registered["refresh_token"]

    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {rotated['access_token']}"},
    )
    assert me.status_code == 200

    old_refresh = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert old_refresh.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    registered = await register_teacher(client)

    logout = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert logout.status_code == 204

    access_after_logout = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {registered['access_token']}"},
    )
    assert access_after_logout.status_code == 401

    refresh = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert refresh.status_code == 401


async def test_registration_rejects_password_reset_token(client: AsyncClient) -> None:
    token = await issue_token(client, purpose="password_reset")
    response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": PHONE,
            "verification_token": token,
            "display_name": "Wrong Purpose",
            "password": PASSWORD,
            "role": "teacher",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "AUTH_VERIFICATION_TOKEN_INVALID"


async def test_registration_and_reset_tokens_cannot_cross_purposes(
    client: AsyncClient,
) -> None:
    register_token = await issue_token(client, purpose="register")
    reset_response = await client.post(
        "/api/v1/auth/password/reset",
        json={
            "phone": PHONE,
            "verification_token": register_token,
            "new_password": NEW_PASSWORD,
        },
    )
    assert reset_response.status_code == 400
    assert reset_response.json()["detail"]["code"] == "AUTH_VERIFICATION_TOKEN_INVALID"


async def test_registration_rejects_token_for_another_phone(client: AsyncClient) -> None:
    token = await issue_token(client, purpose="register")
    response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": "13900139000",
            "verification_token": token,
            "display_name": "Other Phone",
            "password": PASSWORD,
            "role": "teacher",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "AUTH_VERIFICATION_TOKEN_INVALID"


async def test_login_locks_after_repeated_failed_attempts(client: AsyncClient) -> None:
    await register_teacher(client)

    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login/password",
            json={"phone": PHONE, "password": "WrongPass123"},
        )
        assert response.status_code in {401, 423}

    locked = await client.post(
        "/api/v1/auth/login/password",
        json={"phone": PHONE, "password": PASSWORD},
    )
    assert locked.status_code == 423
    assert locked.json()["detail"]["code"] == "AUTH_ACCOUNT_LOCKED"
