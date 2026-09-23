import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from database.models.chat import Conversation, Message, MessageCitation, MessageRole
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.dependencies import get_asr_provider, get_chat_attachment_storage
from app.main import app
from app.services.chat import (
    _course_has_searchable_material,
    _stream_chat_response_contents,
)
from app.services.storage import LocalDocumentStorage

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24


class FakeASRProvider:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, str | None]] = []

    async def transcribe(self, path: Path, *, language: str | None) -> str:
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
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Chat Course"},
    )
    course = course_response.json()
    document_id = uuid4()

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
        await session.commit()

    chunks = await client.post(
        f"/api/v1/documents/{document_id}/chunks",
        headers=auth_headers(teacher),
    )
    embeddings = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )

    assert chunks.status_code == 200
    assert embeddings.status_code == 200
    return course


async def test_multimodal_chat_attachment_upload_and_send(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    tmp_path: Path,
) -> None:
    teacher = await login(client, "chat-multimodal@example.com", "teacher")
    attachments_storage = LocalDocumentStorage(tmp_path / "chat-attachments")
    app.dependency_overrides[get_chat_attachment_storage] = lambda: attachments_storage

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
            "input_audio",
            "video_url",
        ]

        invalid = await client.post(
            "/api/v1/chat/attachments",
            headers=auth_headers(teacher),
            data={"kind": "image"},
            files={"file": ("question.txt", b"plain", "text/plain")},
        )
        assert invalid.status_code == 415
    finally:
        app.dependency_overrides.pop(get_chat_attachment_storage, None)


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
            files={"file": ("question.m4a", b"audio-data", "audio/mp4")},
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
    course = await create_searchable_course(client, session_factory, teacher)

    conversation_response = await client.post(
        f"/api/v1/courses/{course['id']}/conversations",
        headers=auth_headers(teacher),
        json={"title": "Chat"},
    )
    conversation = conversation_response.json()
    stream_response = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Explain alpha", "retrieval_limit": 3},
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
    assert "event: block" in stream_response.text
    assert '"type": "hint"' in stream_response.text
    assert '"type": "quick_check"' in stream_response.text
    assert '"correct_option_id"' not in stream_response.text
    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Echo [1] answer"
    assert messages[1]["citations"]
    assert [block["type"] for block in messages[1]["blocks"]] == [
        "markdown",
        "citation",
        "hint",
        "quick_check",
    ]

    async with session_factory() as session:
        events = list(await session.scalars(select(LearningEvent)))
        chunk_count = len(list(await session.scalars(select(KnowledgeChunk.id))))

    assert events == []
    assert chunk_count > 0


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
