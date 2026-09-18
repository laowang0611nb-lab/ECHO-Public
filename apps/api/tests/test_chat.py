from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from database.models.chat import Message, MessageCitation, MessageRole
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

from app.services.chat import _course_has_searchable_material


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
    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Echo [1] answer"
    assert messages[1]["citations"]

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
    assistant = messages.json()[1]
    assert assistant["knowledgePointIds"] == [str(point.id)]
    assert assistant["reviewStatus"] == ReviewStatus.OPEN
    assert assistant["citations"][0]["chunk_id"] == str(chunk.id)
    assert student_access.status_code == 403
