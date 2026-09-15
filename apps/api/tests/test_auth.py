import pytest
from httpx import AsyncClient

from app.core.config import settings

LOGIN_PAYLOAD = {
    "email": "teacher@example.com",
    "display_name": "Teacher One",
    "role": "teacher",
}


async def test_first_login_creates_user(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "teacher@example.com"
    assert body["display_name"] == "Teacher One"
    assert body["role"] == "teacher"
    assert body["id"]


async def test_repeated_login_returns_same_user(client: AsyncClient) -> None:
    first = await client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    second = await client.post(
        "/api/v1/auth/login",
        json={**LOGIN_PAYLOAD, "email": "TEACHER@EXAMPLE.COM"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


async def test_role_conflict_returns_409(client: AsyncClient) -> None:
    first = await client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    conflict = await client.post(
        "/api/v1/auth/login",
        json={**LOGIN_PAYLOAD, "role": "student"},
    )

    assert first.status_code == 200
    assert conflict.status_code == 409
    assert "conflicts" in conflict.json()["detail"]


async def test_me_returns_current_user(client: AsyncClient) -> None:
    login = await client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    user_id = login.json()["id"]

    response = await client.get("/api/v1/auth/me", headers={"X-User-Id": user_id})

    assert response.status_code == 200
    assert response.json()["id"] == user_id


async def test_me_without_header_returns_401(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401


async def test_me_with_invalid_user_id_returns_401(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me", headers={"X-User-Id": "not-a-uuid"})

    assert response.status_code == 401


async def test_me_with_unknown_user_returns_401(client: AsyncClient) -> None:
    response = await client.get(
        "/api/v1/auth/me",
        headers={"X-User-Id": "00000000-0000-0000-0000-000000000001"},
    )

    assert response.status_code == 401


async def test_development_auth_can_be_disabled(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "development_auth_enabled", False)

    login_response = await client.post("/api/v1/auth/login", json=LOGIN_PAYLOAD)
    me_response = await client.get("/api/v1/auth/me")

    assert login_response.status_code == 403
    assert me_response.status_code == 401
