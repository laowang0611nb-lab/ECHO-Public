from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from database.models.notification import Notification, NotificationSeverity, NotificationType
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies import get_avatar_storage
from app.core.config import settings
from app.main import app
from app.services.notifications import create_notification
from app.services.storage import LocalDocumentStorage

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"avatar-data" * 4


async def _login(client: AsyncClient, email: str, role: str) -> dict[str, object]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def _headers(user: dict[str, object]) -> dict[str, str]:
    return {"X-User-Id": str(user["id"])}


@pytest.mark.asyncio
async def test_avatar_upload_read_profile_member_and_delete(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = LocalDocumentStorage(tmp_path / "avatars")
    app.dependency_overrides[get_avatar_storage] = lambda: storage
    try:
        teacher = await _login(client, "avatar-teacher@example.com", "teacher")
        headers = _headers(teacher)

        upload = await client.post(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("avatar.png", PNG_BYTES, "image/png")},
        )
        assert upload.status_code == 200
        avatar_url = upload.json()["avatar_url"]
        assert avatar_url.startswith(f"/api/v1/users/{teacher['id']}/avatar?v=")

        profile = await client.get("/api/v1/auth/me/profile", headers=headers)
        me = await client.get("/api/v1/auth/me", headers=headers)
        assert profile.status_code == 200
        assert profile.json()["avatar_url"] == avatar_url
        assert me.status_code == 200
        assert me.json()["avatar_url"] == avatar_url

        public_avatar = await client.get(avatar_url)
        assert public_avatar.status_code == 200
        assert public_avatar.headers["content-type"] == "image/png"
        assert public_avatar.content == PNG_BYTES

        course_response = await client.post(
            "/api/v1/courses",
            headers=headers,
            json={"name": "Avatar Course"},
        )
        assert course_response.status_code == 201
        members = await client.get(
            f"/api/v1/courses/{course_response.json()['id']}/members",
            headers=headers,
        )
        assert members.status_code == 200
        teacher_member = next(
            member for member in members.json() if member["user_id"] == teacher["id"]
        )
        assert teacher_member["avatar_url"] == avatar_url

        second_upload = await client.post(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("next.png", PNG_BYTES + b"next", "image/png")},
        )
        assert second_upload.status_code == 200
        avatar_files = list(
            (tmp_path / "avatars" / "users" / str(teacher["id"]) / "avatar").glob("*")
        )
        assert len(avatar_files) == 1

        invalid = await client.post(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("avatar.gif", b"GIF89a-not-supported", "image/gif")},
        )
        assert invalid.status_code == 415

        monkeypatch.setattr(settings, "avatar_max_upload_bytes", 8)
        too_large = await client.post(
            "/api/v1/auth/me/avatar",
            headers=headers,
            files={"file": ("large.png", PNG_BYTES, "image/png")},
        )
        assert too_large.status_code == 413

        deleted = await client.delete("/api/v1/auth/me/avatar", headers=headers)
        assert deleted.status_code == 204
        assert (await client.get(avatar_url)).status_code == 404
        assert (
            list((tmp_path / "avatars" / "users" / str(teacher["id"]) / "avatar").glob("*")) == []
        )
    finally:
        app.dependency_overrides.pop(get_avatar_storage, None)


@pytest.mark.asyncio
async def test_notification_list_cursor_read_and_read_all(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await _login(client, "notification-teacher@example.com", "teacher")
    student = await _login(client, "notification-student@example.com", "student")
    teacher_id = UUID(str(teacher["id"]))
    notifications: list[Notification] = []

    async with session_factory() as session:
        for index in range(3):
            notifications.append(
                await create_notification(
                    session,
                    user_id=teacher_id,
                    type=NotificationType.AI_HIGH_RISK,
                    severity=NotificationSeverity.WARNING,
                    title=f"验收通知 {index}",
                    body="通知正文",
                    action_url=f"/review/{index}",
                    payload_json={"index": index},
                    dedupe_key=f"avatar-notification-{index}",
                    created_at=datetime.now(UTC) - timedelta(minutes=index),
                )
            )
        await session.commit()

    unread = await client.get(
        "/api/v1/notifications/unread-count",
        headers=_headers(teacher),
    )
    assert unread.status_code == 200
    assert unread.json()["unreadCount"] == 3

    first_page = await client.get(
        "/api/v1/notifications?unread=true&limit=1",
        headers=_headers(teacher),
    )
    assert first_page.status_code == 200
    first_payload = first_page.json()
    assert first_payload["total"] == 3
    assert first_payload["unreadCount"] == 3
    assert first_payload["nextCursor"]
    assert len(first_payload["items"]) == 1

    second_page = await client.get(
        f"/api/v1/notifications?unread=true&limit=1&cursor={first_payload['nextCursor']}",
        headers=_headers(teacher),
    )
    assert second_page.status_code == 200
    assert second_page.json()["items"][0]["id"] != first_payload["items"][0]["id"]

    target_id = notifications[0].id
    marked = await client.post(
        f"/api/v1/notifications/{target_id}/read",
        headers=_headers(teacher),
    )
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    after_mark = await client.get(
        "/api/v1/notifications/unread-count",
        headers=_headers(teacher),
    )
    assert after_mark.json()["unreadCount"] == 2

    forbidden = await client.post(
        f"/api/v1/notifications/{notifications[1].id}/read",
        headers=_headers(student),
    )
    assert forbidden.status_code == 404

    read_all = await client.post(
        "/api/v1/notifications/read-all",
        headers=_headers(teacher),
    )
    assert read_all.status_code == 200
    assert read_all.json() == {"updated": 2, "unreadCount": 0}

    empty = await client.get(
        "/api/v1/notifications?unread=true",
        headers=_headers(teacher),
    )
    assert empty.status_code == 200
    assert empty.json()["items"] == []
    assert empty.json()["unreadCount"] == 0


@pytest.mark.asyncio
async def test_student_join_creates_teacher_notification(client: AsyncClient) -> None:
    teacher = await _login(client, "join-notification-teacher@example.com", "teacher")
    student = await _login(client, "join-notification-student@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=_headers(teacher),
        json={"name": "Notification Course"},
    )
    assert created.status_code == 201
    course = created.json()
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=_headers(teacher),
    )
    assert published.status_code == 200

    joined = await client.post(
        "/api/v1/courses/join",
        headers=_headers(student),
        json={"code": course["code"]},
    )
    assert joined.status_code == 200

    notifications = await client.get(
        "/api/v1/notifications?unread=true",
        headers=_headers(teacher),
    )
    assert notifications.status_code == 200
    payload = notifications.json()
    assert payload["unreadCount"] == 1
    assert payload["items"][0]["type"] == "course_member_change"
