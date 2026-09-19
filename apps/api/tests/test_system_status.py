import pytest
from httpx import AsyncClient

from app.api.routes.system import _ai_provider_status
from app.core.config import settings


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def test_system_status_reports_current_and_target_database(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "system-status-teacher@example.com", "teacher")

    response = await client.get(
        "/api/v1/system/status",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"healthy", "warning"}
    assert payload["version"] == settings.app_version
    assert payload["database"]["dialect"] == "sqlite"
    assert payload["database"]["current_label"] == "SQLite Development Database"
    assert payload["database"]["target_architecture"] == "PostgreSQL + pgvector"
    assert payload["vector"]["available"] is False
    assert payload["storage"]["mode"] == "local"


def test_ai_provider_status_uses_provider_specific_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "llm_api_key", "llm-key")
    monkeypatch.setattr(settings, "chat_api_key", None)
    monkeypatch.setattr(settings, "embedding_api_key", None)

    status = _ai_provider_status()
    assert status.status == "warning"
    assert status.configured is False
    assert status.chat_configured is False
    assert status.embedding_configured is False
