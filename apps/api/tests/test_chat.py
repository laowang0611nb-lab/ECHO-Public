from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.document import Document, DocumentPage, DocumentStatus
from app.models.knowledge import KnowledgeChunk
from app.models.learning import LearningEvent, LearningEventType


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

    assert events[0].event_type == LearningEventType.QUESTION_ASKED
    assert chunk_count > 0


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
