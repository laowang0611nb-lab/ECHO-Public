import json
from pathlib import Path

import httpx
from database.models.chat import ChatAttachment, ChatAttachmentKind

from app.services.asr import DashScopeAsrProvider
from app.services.chat_attachments import attachment_to_model_content


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
