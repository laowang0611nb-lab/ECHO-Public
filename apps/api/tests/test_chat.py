import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from database.models.chat import (
    ChatAttachment,
    Conversation,
    ConversationTeachingState,
    Message,
    MessageCitation,
    MessageRole,
    TeachingDialogEvent,
    TeachingStage,
)
from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType
from database.models.review import (
    AIReviewFlag,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
)
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies import get_asr_provider, get_chat_attachment_storage
from app.api.routes import chat as chat_routes
from app.core.config import settings
from app.main import app
from app.schemas.chat import ChatContinueRequest, ChatStreamRequest
from app.services import chat as chat_service
from app.services.chat import (
    ChatMediaError,
    _course_has_searchable_material,
    _stream_chat_response_contents,
)
from app.services.storage import LocalDocumentStorage

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24


class FakeASRProvider:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, str | None]] = []

    async def transcribe(
        self,
        path: Path,
        *,
        language: str | None,
        mime_type: str | None = None,
    ) -> str:
        self.calls.append((path, language))
        return "这是语音转写后的课程问题"


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_searchable_course(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    *,
    include_knowledge_point: bool = False,
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Chat Course"},
    )
    course = course_response.json()
    document_id = uuid4()
    chapter_id = uuid4()
    knowledge_point_id = uuid4()

    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="chat.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
                page_count=1,
            )
        )
        session.add(
            DocumentPage(
                document_id=document_id,
                page_number=1,
                text="Alpha learning material " * 80,
                char_count=1920,
            )
        )
        if include_knowledge_point:
            session.add(
                Chapter(
                    id=chapter_id,
                    course_id=UUID(course["id"]),
                    document_id=document_id,
                    title="Chat Chapter",
                    order_index=0,
                )
            )
            session.add(
                KnowledgePoint(
                    id=knowledge_point_id,
                    course_id=UUID(course["id"]),
                    chapter_id=chapter_id,
                    name="Alpha",
                    description="Alpha learning material",
                    order_index=0,
                )
            )
        await session.commit()

    chunks = await client.post(
        f"/api/v1/documents/{document_id}/chunks",
        headers=auth_headers(teacher),
    )
    if include_knowledge_point:
        async with session_factory() as session:
            stored_chunks = list(
                await session.scalars(
                    select(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id)
                )
            )
            for stored_chunk in stored_chunks:
                stored_chunk.chapter_id = chapter_id
            await session.commit()
    embeddings = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )

    assert chunks.status_code == 200
    assert embeddings.status_code == 200
    if include_knowledge_point:
        course["knowledge_point_id"] = str(knowledge_point_id)
    return course


async def create_question_item(
    client: AsyncClient,
    teacher: dict[str, str],
    course: dict[str, str],
    *,
    knowledge_point_id: UUID | None = None,
    title: str = "Course question",
    content: str = "Which option matches the course material?",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "knowledge_point_ids": (
            [str(knowledge_point_id)] if knowledge_point_id is not None else []
        ),
        "type": "single_choice",
        "difficulty": "medium",
        "title": title,
        "content": content,
        "answer": "a",
        "explanation": "Option A matches the course source.",
        "metadata_json": {
            "options": [
                {"id": "a", "label": "Correct"},
                {"id": "b", "label": "Incorrect"},
            ],
            "correct_option_id": "a",
            "hint_levels": ["Check the course definition.", "Compare both options."],
        },
    }
    response = await client.post(
        f"/api/v1/courses/{course['id']}/question-items",
        headers=auth_headers(teacher),
        json=payload,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_multimodal_chat_attachment_upload_and_send(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "chat-multimodal@example.com", "teacher")
    monkeypatch.setattr(settings, "chat_api_key", "test-chat-key")
    monkeypatch.setattr(settings, "chat_media_upload_enabled", True)
    monkeypatch.setattr(chat_routes, "video_media_available", lambda: True)
    attachments_storage = LocalDocumentStorage(tmp_path / "chat-attachments")
    asr_provider = FakeASRProvider()
    app.dependency_overrides[get_chat_attachment_storage] = lambda: attachments_storage
    app.dependency_overrides[get_asr_provider] = lambda: asr_provider

    try:
        modalities = await client.get(
            "/api/v1/chat/modalities",
            headers=auth_headers(teacher),
        )
        assert modalities.status_code == 200
        assert modalities.json()["attachments_enabled"] is True
        assert set(modalities.json()["input_modalities"]) == {
            "text",
            "image",
            "audio",
            "video",
        }
        monkeypatch.setattr(settings, "chat_media_upload_enabled", False)

        upload = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "image"},
            files={"file": ("question.png", PNG_BYTES, "image/png")},
        )
        assert upload.status_code == 200, upload.text
        uploaded = upload.json()["attachment"]
        assert uploaded["kind"] == "image"
        assert uploaded["url"].endswith("/file")

        course = await create_searchable_course(client, session_factory, teacher)
        conversation_response = await client.post(
            f"/api/v1/courses/{course['id']}/conversations",
            headers=auth_headers(teacher),
            json={"title": "图片提问"},
        )
        assert conversation_response.status_code == 201
        conversation_id = conversation_response.json()["id"]

        stream = await client.post(
            f"/api/v1/conversations/{conversation_id}/messages/stream",
            headers=auth_headers(teacher),
            json={
                "content": "请分析这张图片",
                "client_request_id": "multimodal-request",
                "attachments": [uploaded],
            },
        )
        assert stream.status_code == 200
        assert "event: done" in stream.text

        prompt_content = chat_provider.last_stream_messages[-1]["content"]
        assert isinstance(prompt_content, list)
        assert prompt_content[0] == {"type": "text", "text": "请分析这张图片"}
        assert prompt_content[1]["type"] == "image_url"

        messages = await client.get(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=auth_headers(teacher),
        )
        assert messages.status_code == 200
        user_message = next(message for message in messages.json() if message["role"] == "user")
        assert user_message["attachments"][0]["id"] == uploaded["id"]

        stored_file = await client.get(
            f"/api/v1/chat/attachments/{uploaded['id']}/file",
            headers=auth_headers(teacher),
        )
        assert stored_file.status_code == 200
        assert stored_file.headers["content-type"] == "image/png"

        other_user = await login(
            client,
            "chat-multimodal-other@example.com",
            "teacher",
        )
        forbidden_file = await client.get(
            f"/api/v1/chat/attachments/{uploaded['id']}/file",
            headers=auth_headers(other_user),
        )
        assert forbidden_file.status_code == 403

        media_attachments = []
        for kind, file_name, mime_type, content in (
            (
                "audio",
                "question.m4a",
                "audio/mp4",
                b"\x00\x00\x00\x18ftypM4A ",
            ),
            (
                "video",
                "question.mp4",
                "video/mp4",
                b"\x00\x00\x00\x18ftypisom",
            ),
        ):
            media_upload = await client.post(
                "/api/v1/chat/attachments",
                headers=auth_headers(teacher),
                data={"kind": kind},
                files={"file": (file_name, content, mime_type)},
            )
            assert media_upload.status_code == 200, media_upload.text
            assert media_upload.json()["attachment"]["kind"] == kind
            media_attachments.append(media_upload.json()["attachment"])

        media_stream = await client.post(
            f"/api/v1/conversations/{conversation_id}/messages/stream",
            headers=auth_headers(teacher),
            json={
                "content": "请分析上传的语音和视频",
                "client_request_id": "multimodal-media-request",
                "attachments": media_attachments,
            },
        )
        assert media_stream.status_code == 200
        assert "event: done" in media_stream.text
        media_prompt = chat_provider.last_stream_messages[-1]["content"]
        assert [part["type"] for part in media_prompt[1:]] == [
            "text",
            "video_url",
        ]
        assert "这是语音转写后的课程问题" in media_prompt[1]["text"]

        invalid = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "image"},
            files={"file": ("question.txt", b"plain", "text/plain")},
        )
        assert invalid.status_code == 415
    finally:
        app.dependency_overrides.pop(get_chat_attachment_storage, None)
        app.dependency_overrides.pop(get_asr_provider, None)


async def test_chat_modalities_reflect_disabled_configuration(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "chat-modalities-disabled@example.com", "teacher")
    monkeypatch.setattr(settings, "chat_api_key", None)
    monkeypatch.setattr(settings, "chat_media_upload_enabled", False)
    app.dependency_overrides[get_asr_provider] = lambda: None
    try:
        response = await client.get(
            "/api/v1/chat/modalities",
            headers=auth_headers(teacher),
        )
    finally:
        app.dependency_overrides.pop(get_asr_provider, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["input_modalities"] == []
    assert payload["attachments_enabled"] is False
    assert "Chat Provider 未配置" in payload["message"]
    assert "ASR 未启用或未配置" in payload["message"]
    assert "视频临时文件服务未启用" in payload["message"]


async def test_attachment_upload_returns_structured_errors(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "chat-attachment-errors@example.com", "teacher")
    attachments_storage = LocalDocumentStorage(tmp_path / "chat-attachment-errors")
    app.dependency_overrides[get_chat_attachment_storage] = lambda: attachments_storage
    try:
        mismatch = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "image"},
            files={"file": ("question.jpg", PNG_BYTES, "image/jpeg")},
        )
        monkeypatch.setattr(settings, "chat_image_max_upload_bytes", 8)
        too_large = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "image"},
            files={"file": ("question.png", PNG_BYTES, "image/png")},
        )
    finally:
        app.dependency_overrides.pop(get_chat_attachment_storage, None)

    assert mismatch.status_code == 415
    assert mismatch.json()["detail"]["code"] == "CHAT_ATTACHMENT_INVALID_TYPE"
    assert mismatch.json()["detail"]["kind"] == "image"
    assert too_large.status_code == 413
    assert too_large.json()["detail"] == {
        "code": "CHAT_ATTACHMENT_TOO_LARGE",
        "message": "Attachment exceeds the 8 byte limit",
        "limit_bytes": 8,
        "limit_mb": 0.0,
        "kind": "image",
    }


async def test_media_processing_error_rolls_back_attachment_binding(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "chat-media-error@example.com", "teacher")
    attachments_storage = LocalDocumentStorage(tmp_path / "chat-media-error")
    app.dependency_overrides[get_chat_attachment_storage] = lambda: attachments_storage
    monkeypatch.setattr(settings, "chat_media_upload_enabled", True)
    monkeypatch.setattr(settings, "chat_api_key", "test-chat-key")
    monkeypatch.setattr(chat_routes, "video_media_available", lambda: True)

    async def fail_media_processing(*args, **kwargs):
        raise ChatMediaError("video processing failed")

    monkeypatch.setattr(chat_service, "ensure_video_model_url", fail_media_processing)

    try:
        upload = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "video"},
            files={"file": ("question.mp4", b"\x00\x00\x00\x18ftypisom", "video/mp4")},
        )
        assert upload.status_code == 200, upload.text
        attachment = upload.json()["attachment"]
        course = await create_searchable_course(client, session_factory, teacher)
        conversation = await client.post(
            f"/api/v1/courses/{course['id']}/conversations",
            headers=auth_headers(teacher),
            json={"title": "媒体处理失败"},
        )
        stream = await client.post(
            f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
            headers=auth_headers(teacher),
            json={
                "content": "分析视频",
                "client_request_id": "media-failure",
                "attachments": [attachment],
            },
        )
    finally:
        app.dependency_overrides.pop(get_chat_attachment_storage, None)

    assert stream.status_code == 200
    assert "event: error" in stream.text
    assert '"code": "CHAT_MEDIA_PROCESSING_FAILED"' in stream.text
    assert '"kind": "video"' in stream.text
    async with session_factory() as session:
        stored = await session.get(ChatAttachment, UUID(attachment["id"]))
    assert stored is not None
    assert stored.message_id is None
    assert stored.conversation_id is None
    assert stored.expires_at is not None


async def test_long_student_message_is_atomic_and_retryable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "long-message-teacher@example.com", "teacher")
    student = await login(client, "long-message-student@example.com", "student")
    course = await create_searchable_course(client, session_factory, teacher)
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    joined = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": published.json()["code"]},
    )
    assert joined.status_code == 200
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(student),
        json={"title": "长消息"},
    )
    conversation_id = conversation.json()["id"]
    content = "测" * 3000
    payload = {
        "content": content,
        "client_request_id": "long-message-once",
    }

    first = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        headers=auth_headers(student),
        json=payload,
    )
    assert first.status_code == 200
    assert "event: done" in first.text
    assert "event: error" not in first.text

    async with session_factory() as session:
        event = await session.scalar(
            select(LearningEvent).where(
                LearningEvent.conversation_id == UUID(conversation_id),
                LearningEvent.event_type == LearningEventType.QUESTION_ASKED,
            )
        )
        assert event is not None
        assert event.evidence is not None
        assert len(event.evidence) <= 2000

    retry = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        headers=auth_headers(student),
        json=payload,
    )
    assert retry.status_code == 200
    assert "event: done" in retry.text
    assert "event: error" not in retry.text

    messages = await client.get(
        f"/api/v1/conversations/{conversation_id}/messages",
        headers=auth_headers(student),
    )
    user_messages = [message for message in messages.json() if message["role"] == "user"]
    assert len(user_messages) == 1
    assert user_messages[0]["content"] == content


def test_blank_client_request_id_is_normalized_to_none() -> None:
    assert (
        ChatStreamRequest(
            content="question",
            client_request_id="   ",
        ).client_request_id
        is None
    )
    assert ChatContinueRequest(client_request_id="").client_request_id is None


async def test_audio_attachment_uses_local_asr_transcript(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    tmp_path: Path,
) -> None:
    teacher = await login(client, "chat-asr@example.com", "teacher")
    asr_provider = FakeASRProvider()
    attachments_storage = LocalDocumentStorage(tmp_path / "chat-asr-attachments")
    app.dependency_overrides[get_chat_attachment_storage] = lambda: attachments_storage
    app.dependency_overrides[get_asr_provider] = lambda: asr_provider

    try:
        upload = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "audio"},
            files={"file": ("question.m4a", b"\x00\x00\x00\x18ftypM4A ", "audio/mp4")},
        )
        assert upload.status_code == 200, upload.text
        attachment = upload.json()["attachment"]

        course = await create_searchable_course(client, session_factory, teacher)
        conversation = await client.post(
            f"/api/v1/courses/{course['id']}/conversations",
            headers=auth_headers(teacher),
            json={"title": "语音提问"},
        )
        assert conversation.status_code == 201
        conversation_id = conversation.json()["id"]

        stream = await client.post(
            f"/api/v1/conversations/{conversation_id}/messages/stream",
            headers=auth_headers(teacher),
            json={
                "content": "请分析这段录音",
                "client_request_id": "audio-asr-request",
                "attachments": [attachment],
            },
        )
        assert stream.status_code == 200
        assert "event: done" in stream.text
        assert asr_provider.calls

        prompt = chat_provider.last_stream_messages[-1]["content"]
        assert prompt[1]["type"] == "text"
        assert "这是语音转写后的课程问题" in prompt[1]["text"]
        assert all(part["type"] != "input_audio" for part in prompt[1:])

        messages = await client.get(
            f"/api/v1/conversations/{conversation_id}/messages",
            headers=auth_headers(teacher),
        )
        user_message = next(message for message in messages.json() if message["role"] == "user")
        assert user_message["attachments"][0]["transcript"] == "这是语音转写后的课程问题"
    finally:
        app.dependency_overrides.pop(get_chat_attachment_storage, None)
        app.dependency_overrides.pop(get_asr_provider, None)


async def test_searchable_material_ignores_trashed_document_and_chapter(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chat-searchable-trash@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    course_id = UUID(course["id"])
    async with session_factory() as session:
        document = await session.scalar(select(Document).where(Document.course_id == course_id))
        assert document is not None
        chapter = Chapter(
            course_id=course_id,
            document_id=document.id,
            title="Chat Chapter",
            order_index=0,
        )
        session.add(chapter)
        await session.flush()
        chunks = list(
            await session.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
            )
        )
        assert chunks
        for chunk in chunks:
            chunk.chapter_id = chapter.id
        await session.commit()

        assert await _course_has_searchable_material(session, course_id) is True
        chapter.trashed_at = datetime.now(UTC)
        await session.commit()
        assert await _course_has_searchable_material(session, course_id) is False

        chapter.trashed_at = None
        document.trashed_at = datetime.now(UTC)
        await session.commit()
        assert await _course_has_searchable_material(session, course_id) is False


async def test_conversation_and_sse_message_flow(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chat-teacher@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )

    conversation_response = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Chat"},
    )
    conversation = conversation_response.json()
    stream_response = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "Explain alpha",
            "knowledge_point_id": course["knowledge_point_id"],
            "retrieval_limit": 3,
        },
    )
    messages_response = await client.get(
        f"/api/v1/conversations/{conversation['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert conversation_response.status_code == 201
    assert stream_response.status_code == 200
    assert "event: text_delta" in stream_response.text
    assert "event: citation" in stream_response.text
    assert "event: done" in stream_response.text
    assert "event: block" not in stream_response.text
    assert '"type": "hint"' not in stream_response.text
    assert '"type": "quick_check"' not in stream_response.text
    assert '"correct_option_id"' not in stream_response.text
    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Echo [1] answer"
    assert messages[1]["citations"]
    assert [block["type"] for block in messages[1]["blocks"]] == [
        "markdown",
        "citation",
    ]

    async with session_factory() as session:
        events = list(await session.scalars(select(LearningEvent)))
        chunk_count = len(list(await session.scalars(select(KnowledgeChunk.id))))

    assert events == []
    assert chunk_count > 0


@pytest.mark.parametrize("content", ["hi", "你好", "谢谢", "在吗", "test"])
async def test_conversational_chat_does_not_emit_quick_check_blocks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    content: str,
) -> None:
    teacher = await login(client, "chat-small-talk@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    point_id = UUID(course["knowledge_point_id"])
    await create_question_item(
        client,
        teacher,
        course,
        knowledge_point_id=point_id,
        title="Linked quick check",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": content},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": content, "knowledge_point_id": str(point_id)},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert "event: done" in stream.text
    assert '"type": "hint"' not in stream.text
    assert '"type": "quick_check"' not in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert {"hint", "quick_check"}.isdisjoint(block["type"] for block in assistant["blocks"])
    assert chat_provider.last_complete_messages == []


async def test_chat_without_resolved_point_does_not_reuse_course_latest_question(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-no-point@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    await create_question_item(
        client,
        teacher,
        course,
        title="Unrelated latest question",
        content="Which unrelated option is newest?",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "No point"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "今天天气怎么样？"},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"type": "hint"' not in stream.text
    assert '"type": "quick_check"' not in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert [block["type"] for block in assistant["blocks"]] == ["markdown"]
    assert chat_provider.last_complete_messages == []


async def test_general_chat_does_not_auto_offer_quick_check_without_explicit_point(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-general@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    await create_question_item(
        client,
        teacher,
        course,
        knowledge_point_id=UUID(course["knowledge_point_id"]),
        title="Should not auto-open",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "General chat"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha"},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"type": "hint"' not in stream.text
    assert '"type": "quick_check"' not in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert [block["type"] for block in assistant["blocks"]] == ["markdown", "citation"]
    assert chat_provider.last_complete_messages == []


async def test_relevant_course_question_uses_linked_quick_check(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-linked-check@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    question = await create_question_item(
        client,
        teacher,
        course,
        knowledge_point_id=UUID(course["knowledge_point_id"]),
        title="Alpha linked check",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Relevant question"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "Explain alpha",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    assert stream.status_code == 200
    assert '"type": "hint"' not in stream.text
    assert '"type": "quick_check"' not in stream.text

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "我懂了", "knowledge_point_id": course["knowledge_point_id"]},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"type": "hint"' in stream.text
    assert '"type": "quick_check"' in stream.text
    assert str(question["id"]) in stream.text
    assistant = [message for message in messages.json() if message["role"] == "assistant"][-1]
    assert [block["type"] for block in assistant["blocks"]] == [
        "markdown",
        "citation",
        "hint",
        "quick_check",
    ]
    assert chat_provider.last_complete_messages == []


async def test_explicit_point_uses_chapter_material_when_search_misses(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-chapter-fallback@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Chapter fallback"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "直接给我答案：解释量子纠缠",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"type": "hint"' in stream.text
    assert '"type": "quick_check"' in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert [block["type"] for block in assistant["blocks"]] == [
        "markdown",
        "citation",
        "hint",
        "quick_check",
    ]
    assert chat_provider.last_complete_messages


async def test_relevant_question_without_material_does_not_generate_quick_check(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-no-material@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    async with session_factory() as session:
        await session.execute(
            delete(KnowledgeChunk).where(KnowledgeChunk.course_id == UUID(course["id"]))
        )
        await session.commit()
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "No material"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "解释量子纠缠",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"type": "hint"' not in stream.text
    assert '"type": "quick_check"' not in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert [block["type"] for block in assistant["blocks"]] == ["markdown"]
    assert chat_provider.last_complete_messages == []


async def test_student_chat_updates_learning_metrics(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chat-student-metrics@example.com", "teacher")
    student = await login(client, "chat-metrics-student@example.com", "student")
    course = await create_searchable_course(client, session_factory, teacher)
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": published.json()["code"]},
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(student),
        json={"title": "Student chat"},
    )
    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": "Explain alpha", "retrieval_limit": 3},
    )
    dashboard = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert dashboard.json()["active_student_count"] == 1
    assert dashboard.json()["question_count_7d"] == 1
    assert dashboard.json()["total_learning_events"] == 1

    async with session_factory() as session:
        event = await session.scalar(select(LearningEvent))

    assert event is not None
    assert event.user_id == UUID(student["id"])
    assert event.event_type == LearningEventType.QUESTION_ASKED


async def test_citation_index_preserves_original_source_number(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "chat-citation-index@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    chat_provider.answer = "Echo [2] answer"
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Citation index"},
    )
    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha", "retrieval_limit": 5},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation.json()['id']}/messages",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert '"index": 2' in stream.text
    assistant = next(message for message in messages.json() if message["role"] == "assistant")
    assert len(assistant["citations"]) == 1
    assert assistant["citations"][0]["citation_index"] == 2


async def test_stream_retrieval_failure_returns_sse_error(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    embedding_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "chat-stream-error@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Stream error"},
    )

    async def failing_embed(_: list[str]) -> list[list[float]]:
        raise RuntimeError("embedding unavailable")

    monkeypatch.setattr(embedding_provider, "embed", failing_embed)
    response = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha", "retrieval_limit": 3},
    )

    assert response.status_code == 200
    assert "event: error" in response.text
    assert "embedding unavailable" in response.text


async def test_conversation_list_is_user_scoped(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chat-list@example.com", "teacher")
    other = await login(client, "chat-list-other@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    created = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Private"},
    )

    teacher_list = await client.get(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
    )
    other_access = await client.get(
        f"/api/v1/conversations/{created.json()['id']}/messages",
        headers=auth_headers(other),
    )

    assert teacher_list.status_code == 200
    assert len(teacher_list.json()) == 1
    assert other_access.status_code == 403


async def test_teacher_can_read_student_conversation_evidence(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chat-evidence-teacher@example.com", "teacher")
    student = await login(client, "chat-evidence-student@example.com", "student")
    course = await create_searchable_course(client, session_factory, teacher)
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": published.json()["code"]},
    )
    conversation_response = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(student),
        json={"title": "学生对话证据"},
    )
    conversation_id = UUID(conversation_response.json()["id"])

    async with session_factory() as session:
        document = await session.scalar(
            select(Document).where(Document.course_id == UUID(course["id"]))
        )
        chunk = await session.scalar(
            select(KnowledgeChunk).where(KnowledgeChunk.course_id == UUID(course["id"]))
        )
        assert document is not None
        assert chunk is not None
        chapter = Chapter(
            course_id=UUID(course["id"]),
            document_id=document.id,
            title="测试章节",
            order_index=0,
        )
        session.add(chapter)
        await session.flush()
        point = KnowledgePoint(
            course_id=UUID(course["id"]),
            chapter_id=chapter.id,
            name="等价类划分",
            order_index=0,
        )
        user_message = Message(
            conversation_id=conversation_id,
            role=MessageRole.USER,
            content="等价类划分应该怎么做？",
            created_at=datetime.now(UTC) - timedelta(minutes=2),
        )
        assistant_message = Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content="先按有效和无效输入划分等价类。",
            created_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        session.add_all([point, user_message, assistant_message])
        await session.flush()
        session.add_all(
            [
                LearningEvent(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student["id"]),
                    knowledge_point_id=point.id,
                    conversation_id=conversation_id,
                    message_id=user_message.id,
                    event_type=LearningEventType.QUESTION_ASKED,
                    evidence=user_message.content,
                ),
                MessageCitation(
                    message_id=assistant_message.id,
                    citation_index=1,
                    chunk_id=chunk.id,
                    document_id=document.id,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    quote=chunk.content[:80],
                ),
                AIReviewFlag(
                    course_id=UUID(course["id"]),
                    conversation_id=conversation_id,
                    message_id=assistant_message.id,
                    student_id=UUID(student["id"]),
                    reason=ReviewReason.MISSING_COURSE_BASIS,
                    severity=ReviewSeverity.HIGH,
                    status=ReviewStatus.OPEN,
                ),
            ]
        )
        await session.commit()

    conversations = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/conversations",
        headers=auth_headers(teacher),
    )
    messages = await client.get(
        f"/api/v1/courses/{course['id']}/conversations/{conversation_id}/messages",
        headers=auth_headers(teacher),
    )
    student_access = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/conversations",
        headers=auth_headers(student),
    )

    assert conversations.status_code == 200
    assert conversations.json()[0]["id"] == str(conversation_id)
    assert messages.status_code == 200
    assistant = next(item for item in messages.json() if item["role"] == "assistant")
    assert assistant["knowledgePointIds"] == [str(point.id)]
    assert assistant["reviewStatus"] == ReviewStatus.OPEN
    assert assistant["citations"][0]["chunk_id"] == str(chunk.id)
    assert student_access.status_code == 403


async def test_chat_uses_latest_course_teaching_policy(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "policy-chat@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Policy chat"},
    )
    first_policy = "先给引导，不要直接给答案，并至少检查一次理解。"
    second_policy = "使用三步推理框架，并用一个课程例子解释。"

    updated = await client.put(
        f"/api/v1/courses/{course['id']}/teaching-policy",
        headers=auth_headers(teacher),
        json={"content": first_policy},
    )
    assert updated.status_code == 200
    first_stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha"},
    )
    assert first_stream.status_code == 200
    assert first_policy in chat_provider.last_stream_messages[0]["content"]
    assert (
        "Default to concise teaching responses" in chat_provider.last_stream_messages[0]["content"]
    )
    assert "800 Chinese characters" in chat_provider.last_stream_messages[0]["content"]

    updated = await client.put(
        f"/api/v1/courses/{course['id']}/teaching-policy",
        headers=auth_headers(teacher),
        json={"content": second_policy},
    )
    assert updated.status_code == 200
    second_stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha again"},
    )
    assert second_stream.status_code == 200
    assert second_policy in chat_provider.last_stream_messages[0]["content"]
    assert first_policy not in chat_provider.last_stream_messages[0]["content"]


async def test_interrupted_assistant_message_can_continue(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "continue-chat@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    conversation_id = uuid4()
    user_message_id = uuid4()
    assistant_message_id = uuid4()
    async with session_factory() as session:
        session.add(
            Conversation(
                id=conversation_id,
                course_id=UUID(course["id"]),
                user_id=UUID(teacher["id"]),
            )
        )
        await session.flush()
        session.add_all(
            [
                Message(
                    id=user_message_id,
                    conversation_id=conversation_id,
                    role=MessageRole.USER,
                    content="Explain alpha",
                ),
                Message(
                    id=assistant_message_id,
                    conversation_id=conversation_id,
                    role=MessageRole.ASSISTANT,
                    content="Partial ",
                    status="interrupted",
                ),
            ]
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/{assistant_message_id}/continue",
        headers=auth_headers(teacher),
        json={},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation_id}/messages",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    assert "event: text_delta" in response.text
    assistant = next(item for item in messages.json() if item["role"] == "assistant")
    assert assistant["content"] == "Partial Echo [1] answer"
    assert assistant["status"] == "complete"


async def test_cancelled_stream_persists_interrupted_partial_answer(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    embedding_provider,
) -> None:
    teacher = await login(client, "cancel-chat@example.com", "teacher")
    course = await create_searchable_course(client, session_factory, teacher)
    conversation_id = uuid4()

    class CancellingProvider:
        async def stream(self, _: list[dict[str, str]]):
            yield "Partial answer"
            raise asyncio.CancelledError

    async with session_factory() as session:
        session.add(
            Conversation(
                id=conversation_id,
                course_id=UUID(course["id"]),
                user_id=UUID(teacher["id"]),
            )
        )
        await session.commit()
        events = []
        with pytest.raises(asyncio.CancelledError):
            async for event in _stream_chat_response_contents(
                session,
                embedding_provider,
                CancellingProvider(),
                conversation_id,
                UUID(teacher["id"]),
                "Explain alpha",
                "cancel-request",
                None,
                3,
            ):
                events.append(event)
        assistant = await session.scalar(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.role == MessageRole.ASSISTANT,
            )
        )

    assert [event.event for event in events] == [
        "message_start",
        "text_delta",
    ]
    assert assistant is not None
    assert assistant.content == "Partial answer"
    assert assistant.status.value == "interrupted"


async def test_teaching_flow_exercise_waits_and_progresses_by_hints(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "teaching-flow-hints@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    await create_question_item(
        client,
        teacher,
        course,
        knowledge_point_id=UUID(course["knowledge_point_id"]),
        title="Hint progression question",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Hints"},
    )
    conversation_id = conversation.json()["id"]

    first = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "这道选择题应该选哪个？",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    assert first.status_code == 200
    assert '"type": "hint"' not in first.text
    assert '"type": "quick_check"' not in first.text

    async with session_factory() as session:
        state = await session.scalar(
            select(ConversationTeachingState).where(
                ConversationTeachingState.conversation_id == UUID(conversation_id)
            )
        )
        assert state is not None
        assert state.stage == TeachingStage.AWAITING_ATTEMPT
        assert state.hint_level == 1
        assert state.attempt_count == 0

    second = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "我选 A"},
    )
    assert second.status_code == 200
    assert '"type": "quick_check"' not in second.text

    async with session_factory() as session:
        state = await session.scalar(
            select(ConversationTeachingState).where(
                ConversationTeachingState.conversation_id == UUID(conversation_id)
            )
        )
        assert state is not None
        assert state.hint_level == 2
        assert state.attempt_count == 1

    third = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "我懂了"},
    )
    assert third.status_code == 200
    assert '"type": "hint"' in third.text
    assert '"type": "quick_check"' in third.text

    async with session_factory() as session:
        state = await session.scalar(
            select(ConversationTeachingState).where(
                ConversationTeachingState.conversation_id == UUID(conversation_id)
            )
        )
        assert state is not None
        assert state.stage == TeachingStage.READY_FOR_QUICK_CHECK
        assert state.quick_check_id is not None
        events = list(
            await session.scalars(
                select(TeachingDialogEvent).where(TeachingDialogEvent.state_id == state.id)
            )
        )
        assert [event.action for event in events] == ["hint", "hint", "explain"]


async def test_explicit_answer_request_explains_then_offers_quick_check(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "teaching-flow-answer@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    await create_question_item(
        client,
        teacher,
        course,
        knowledge_point_id=UUID(course["knowledge_point_id"]),
        title="Explicit answer question",
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Explicit answer"},
    )

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "别提示了，直接给我答案",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    assert stream.status_code == 200
    assert '"type": "hint"' in stream.text
    assert '"type": "quick_check"' in stream.text

    async with session_factory() as session:
        state = await session.scalar(
            select(ConversationTeachingState).where(
                ConversationTeachingState.conversation_id == UUID(conversation.json()["id"])
            )
        )
        assert state is not None
        assert state.stage == TeachingStage.READY_FOR_QUICK_CHECK
        assert state.answer_requested is True


async def test_answer_leak_guard_replaces_direct_mcq_answer(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "teaching-flow-guard@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Leak guard"},
    )
    chat_provider.answer = "答案：A"

    stream = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={
            "content": "这道选择题应该选哪个？",
            "knowledge_point_id": course["knowledge_point_id"],
        },
    )
    assert stream.status_code == 200
    assert "答案：A" not in stream.text
    assert '"type": "quick_check"' not in stream.text
    assert "先不直接给答案" in stream.text


async def test_replayed_client_request_does_not_advance_teaching_state(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "teaching-flow-replay@example.com", "teacher")
    course = await create_searchable_course(
        client,
        session_factory,
        teacher,
        include_knowledge_point=True,
    )
    conversation = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Replay"},
    )
    payload = {
        "content": "这道选择题应该选哪个？",
        "knowledge_point_id": course["knowledge_point_id"],
        "client_request_id": "same-teaching-request",
    }

    first = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json=payload,
    )
    replay = await client.post(
        f"/api/v1/conversations/{conversation.json()['id']}/messages/stream",
        headers=auth_headers(teacher),
        json=payload,
    )
    assert first.status_code == 200
    assert replay.status_code == 200

    async with session_factory() as session:
        state = await session.scalar(
            select(ConversationTeachingState).where(
                ConversationTeachingState.conversation_id == UUID(conversation.json()["id"])
            )
        )
        assert state is not None
        assert state.attempt_count == 0
        assert state.hint_level == 1
        events = list(
            await session.scalars(
                select(TeachingDialogEvent).where(TeachingDialogEvent.state_id == state.id)
            )
        )
        assert len(events) == 1
