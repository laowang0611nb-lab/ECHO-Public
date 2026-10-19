from httpx import AsyncClient

from app.core.config import settings
from app.services.resource_limits import sms_rate_limiter

PHONE = "13800138000"


async def test_public_registration_gate_blocks_sms_and_registration(
    client: AsyncClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "public_registration_enabled", False)

    send_response = await client.post(
        "/api/v1/auth/sms/send",
        json={"phone": PHONE, "purpose": "register"},
    )
    verify_response = await client.post(
        "/api/v1/auth/sms/verify",
        json={"phone": PHONE, "code": "8043", "purpose": "register"},
    )
    register_response = await client.post(
        "/api/v1/auth/register/sms",
        json={
            "phone": PHONE,
            "verification_token": "x" * 40,
            "display_name": "Blocked Teacher",
            "password": "StrongPass123",
            "role": "teacher",
        },
    )

    for response in (send_response, verify_response, register_response):
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "AUTH_REGISTRATION_DISABLED"


async def test_sms_send_rate_limit_is_enforced(
    client: AsyncClient,
    pnvs_provider,
    monkeypatch,
) -> None:
    sms_rate_limiter._entries.clear()
    monkeypatch.setattr(settings, "sms_send_phone_limit_per_hour", 1)
    monkeypatch.setattr(settings, "sms_send_ip_limit_per_hour", 1000)

    first = await client.post(
        "/api/v1/auth/sms/send",
        json={"phone": PHONE, "purpose": "login"},
    )
    second = await client.post(
        "/api/v1/auth/sms/send",
        json={"phone": PHONE, "purpose": "login"},
    )

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "SMS_TOO_FREQUENT"
    assert len(pnvs_provider.sent_phones) == 1


async def test_video_input_is_disabled_in_public_demo(
    client: AsyncClient,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "chat_video_enabled", False)
    login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "public-demo-student@example.com",
            "display_name": "Public Demo Student",
            "role": "student",
        },
    )
    assert login.status_code == 200
    user_id = login.json()["id"]

    modalities = await client.get(
        "/api/v1/chat/modalities",
        headers={"X-User-Id": user_id},
    )
    upload = await client.post(
        "/api/v1/chat/attachments",
        headers={"X-User-Id": user_id},
        data={"kind": "video"},
        files={
            "file": (
                "question.mp4",
                b"\x00\x00\x00\x18ftypisom",
                "video/mp4",
            )
        },
    )

    assert modalities.status_code == 200
    assert "video" not in modalities.json()["input_modalities"]
    assert upload.status_code == 403
    assert upload.json()["detail"]["code"] == "CHAT_VIDEO_DISABLED"
