from httpx import AsyncClient


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def test_demo_reset_builds_isolated_dataset(client: AsyncClient) -> None:
    teacher = await login(client, "demo-manager@example.com", "teacher")
    headers = auth_headers(teacher)

    initial = await client.get("/api/v1/demo/status", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["available"] is False

    reset = await client.post("/api/v1/demo/reset", headers=headers)
    assert reset.status_code == 200
    payload = reset.json()
    assert payload["available"] is True
    assert payload["seeded"] is True
    assert payload["isolated"] is True
    assert payload["dataset_tag"] == "demo"
    assert payload["student_count"] == 10
    assert payload["knowledge_point_count"] == 12
    assert payload["learning_event_count"] >= 84
    assert payload["strategy_id"]
    assert payload["plan_id"]
    assert payload["review_id"]
    assert payload["knowledge_point_id"]
    assert payload["resource_id"]

    status = await client.get("/api/v1/demo/status", headers=headers)
    assert status.json()["plan_count"] == 1
    assert status.json()["strategy_count"] == 1


async def test_student_cannot_reset_demo_dataset(client: AsyncClient) -> None:
    student = await login(client, "demo-reset-student@example.com", "student")

    response = await client.post(
        "/api/v1/demo/reset",
        headers=auth_headers(student),
    )

    assert response.status_code == 403
