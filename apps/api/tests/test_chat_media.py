import json
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from database.models.chat import ChatAttachment, ChatAttachmentKind
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.services import chat_media
from app.services.asr import DashScopeAsrProvider
from app.services.chat_attachments import attachment_to_model_content
from app.services.chat_media import ensure_video_model_url


async def test_dashscope_asr_sends_data_url(tmp_path: Path) -> None:
    audio_path = tmp_path / "question.m4a"
    audio_path.write_bytes(b"audio-data")
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "请解释边界值分析。",
                        }
                    }
                ]
            },
        )

    provider = DashScopeAsrProvider(
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen3-asr-flash",
        timeout_seconds=10,
        transport=httpx.MockTransport(handler),
    )

    transcript = await provider.transcribe(
        audio_path,
        language="zh",
        mime_type="audio/mp4",
    )

    assert transcript == "请解释边界值分析。"
    assert captured["model"] == "qwen3-asr-flash"
    assert captured["asr_options"] == {"language": "zh"}
    message = captured["messages"][0]
    audio = message["content"][0]["input_audio"]["data"]
    assert audio.startswith("data:audio/mp4;base64,")


async def test_ensure_video_model_url_defers_commit(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
    monkeypatch,
) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "chat-media-commit@example.com",
            "display_name": "Media",
            "role": "student",
        },
    )
    user = response.json()
    video_path = tmp_path / "question.mp4"
    video_path.write_bytes(b"video-data")
    attachment_id = uuid4()
    monkeypatch.setattr(settings, "chat_media_upload_enabled", True)
    monkeypatch.setattr(settings, "chat_api_key", "test-chat-key")

    def fake_normalize(path: Path, fps: int, max_dimension: int) -> Path:
        return path

    async def fake_upload(path: Path, **kwargs) -> str:
        return "oss://dashscope-instant/test/question.mp4"

    monkeypatch.setattr(chat_media, "_normalize_video", fake_normalize)
    monkeypatch.setattr(chat_media, "_upload_file", fake_upload)

    async with session_factory() as session:
        attachment = ChatAttachment(
            id=attachment_id,
            user_id=UUID(user["id"]),
            kind=ChatAttachmentKind.VIDEO,
            mime_type="video/mp4",
            file_name="question.mp4",
            storage_key=f"users/{user['id']}/question.mp4",
            size_bytes=video_path.stat().st_size,
        )
        session.add(attachment)
        await session.commit()
        url = await ensure_video_model_url(session, attachment, video_path)
        assert url == "oss://dashscope-instant/test/question.mp4"
        assert attachment.model_file_url == url
        await session.rollback()

    async with session_factory() as session:
        stored = await session.get(ChatAttachment, attachment_id)
        assert stored is not None
        assert stored.model_file_url is None


def test_video_model_content_uses_temporary_dashscope_url(tmp_path: Path) -> None:

    video_path = tmp_path / "question.mp4"
    video_path.write_bytes(b"video-data")
    attachment = ChatAttachment(
        id="00000000-0000-0000-0000-000000000001",
        user_id="00000000-0000-0000-0000-000000000002",
        kind=ChatAttachmentKind.VIDEO,
        mime_type="video/mp4",
        file_name="question.mp4",
        storage_key="question.mp4",
        size_bytes=len(b"video-data"),
    )

    part = attachment_to_model_content(
        attachment,
        video_path,
        video_url="oss://dashscope-instant/example/question.mp4",
    )

    assert part == {
        "type": "video_url",
        "video_url": {"url": "oss://dashscope-instant/example/question.mp4"},
        "fps": 2,
    }
