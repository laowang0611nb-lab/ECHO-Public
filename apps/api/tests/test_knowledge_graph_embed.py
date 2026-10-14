from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from database.auth.tokens import (
    create_access_token,
    decode_knowledge_graph_embed_token,
    hash_knowledge_graph_embed_ticket,
)
from database.models.auth import KnowledgeGraphEmbedSession
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.knowledge_graph_embed import KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS


async def _login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def _bearer(user: dict[str, str]) -> dict[str, str]:
    token = create_access_token(UUID(user["id"]), user["role"])
    return {"Authorization": f"Bearer {token}"}


def _dev_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def _create_course(
    client: AsyncClient,
    teacher: dict[str, str],
    *,
    name: str,
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/courses",
        headers=_dev_headers(teacher),
        json={"name": name},
    )
    assert response.status_code == 201
    course = response.json()
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=_dev_headers(teacher),
    )
    assert published.status_code == 200
    return published.json()


async def _join_course(
    client: AsyncClient,
    student: dict[str, str],
    course: dict[str, str],
) -> None:
    response = await client.post(
        "/api/v1/courses/join",
        headers=_dev_headers(student),
        json={"code": course["code"]},
    )
    assert response.status_code == 200


async def _add_structure(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    course_id: UUID,
    teacher_id: UUID,
) -> tuple[UUID, UUID]:
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                uploaded_by=teacher_id,
                original_name="embed.pdf",
                storage_key=f"embed/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=128,
                status=DocumentStatus.READY,
            )
        )
        await session.flush()
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="Embed Chapter",
                order_index=0,
            )
        )
        await session.flush()
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="Embed Point",
                order_index=0,
            )
        )
        await session.commit()
    return chapter_id, point_id


async def _create_embed_ticket(
    client: AsyncClient,
    course_id: UUID,
    student: dict[str, str],
) -> str:
    response = await client.post(
        f"/api/v1/courses/{course_id}/knowledge-graph/embed-session",
        headers=_bearer(student),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["expires_in_seconds"] == KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS
    return body["ticket"]


async def _exchange_ticket(
    client: AsyncClient,
    course_id: UUID,
    ticket: str,
    expected_status: int = 200,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/knowledge-graph/embed-sessions/exchange",
        json={"ticket": ticket, "courseId": str(course_id)},
    )
    assert response.status_code == expected_status, response.text
    return response.json()


async def test_course_student_can_create_ticket_and_non_member_cannot(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await _login(client, "embed-teacher@example.com", "teacher")
    student = await _login(client, "embed-student@example.com", "student")
    outsider = await _login(client, "embed-outsider@example.com", "student")
    course = await _create_course(client, teacher, name="Embed Course")
    await _join_course(client, student, course)

    ticket = await _create_embed_ticket(client, UUID(course["id"]), student)

    async with session_factory() as session:
        stored = await session.scalar(
            select(KnowledgeGraphEmbedSession).where(
                KnowledgeGraphEmbedSession.ticket_hash == hash_knowledge_graph_embed_ticket(ticket)
            )
        )
        assert stored is not None
        assert stored.ticket_hash != ticket
        assert stored.consumed_at is None

    forbidden = await client.post(
        f"/api/v1/courses/{course['id']}/knowledge-graph/embed-session",
        headers=_bearer(outsider),
    )
    assert forbidden.status_code == 403

    teacher_forbidden = await client.post(
        f"/api/v1/courses/{course['id']}/knowledge-graph/embed-session",
        headers=_bearer(teacher),
    )
    assert teacher_forbidden.status_code == 403


async def test_ticket_exchange_is_single_use_and_token_is_scoped(
    client: AsyncClient,
) -> None:
    teacher = await _login(client, "embed-single-teacher@example.com", "teacher")
    student = await _login(client, "embed-single-student@example.com", "student")
    course = await _create_course(client, teacher, name="Single Use Course")
    await _join_course(client, student, course)

    ticket = await _create_embed_ticket(client, UUID(course["id"]), student)
    body = await _exchange_ticket(client, UUID(course["id"]), ticket)
    assert body["token_type"] == "Bearer"
    assert body["expires_in_seconds"] == KNOWLEDGE_GRAPH_EMBED_TTL_SECONDS
    assert body["course_id"] == course["id"]

    claims = decode_knowledge_graph_embed_token(str(body["access_token"]))
    assert claims["sub"] == student["id"]
    assert claims["course_id"] == course["id"]
    assert claims["scope"] == "knowledge_graph:read"
    assert claims["session_id"]
    assert claims["exp"]

    reused = await client.post(
        "/api/v1/knowledge-graph/embed-sessions/exchange",
        json={"ticket": ticket, "courseId": course["id"]},
    )
    assert reused.status_code == 410


async def test_ticket_cannot_be_cross_course_or_reused_after_expiry(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await _login(client, "embed-expiry-teacher@example.com", "teacher")
    student = await _login(client, "embed-expiry-student@example.com", "student")
    first_course = await _create_course(client, teacher, name="First Embed Course")
    second_course = await _create_course(client, teacher, name="Second Embed Course")
    await _join_course(client, student, first_course)
    await _join_course(client, student, second_course)

    first_ticket = await _create_embed_ticket(client, UUID(first_course["id"]), student)
    cross_course = await client.post(
        "/api/v1/knowledge-graph/embed-sessions/exchange",
        json={"ticket": first_ticket, "courseId": second_course["id"]},
    )
    assert cross_course.status_code == 410

    expiring_ticket = await _create_embed_ticket(client, UUID(first_course["id"]), student)
    async with session_factory() as session:
        stored = await session.scalar(
            select(KnowledgeGraphEmbedSession).where(
                KnowledgeGraphEmbedSession.ticket_hash
                == hash_knowledge_graph_embed_ticket(expiring_ticket)
            )
        )
        assert stored is not None
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()

    expired = await client.post(
        "/api/v1/knowledge-graph/embed-sessions/exchange",
        json={"ticket": expiring_ticket, "courseId": first_course["id"]},
    )
    assert expired.status_code == 410


async def test_embedded_token_can_read_graph_and_chapters_but_cannot_write(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await _login(client, "embed-read-teacher@example.com", "teacher")
    student = await _login(client, "embed-read-student@example.com", "student")
    course = await _create_course(client, teacher, name="Embed Read Course")
    await _join_course(client, student, course)
    chapter_id, point_id = await _add_structure(
        session_factory,
        course_id=UUID(course["id"]),
        teacher_id=UUID(teacher["id"]),
    )

    ticket = await _create_embed_ticket(client, UUID(course["id"]), student)
    exchanged = await _exchange_ticket(client, UUID(course["id"]), ticket)
    embed_headers = {"Authorization": f"Bearer {exchanged['access_token']}"}

    graph = await client.get(
        f"/api/v1/courses/{course['id']}/knowledge-graph",
        headers=embed_headers,
    )
    assert graph.status_code == 200, graph.text
    assert str(point_id) in {node["id"] for node in graph.json()["nodes"]}

    chapters = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=embed_headers,
    )
    assert chapters.status_code == 200, chapters.text
    assert str(chapter_id) in {chapter["id"] for chapter in chapters.json()}

    write = await client.patch(
        f"/api/v1/knowledge-points/{point_id}",
        headers=embed_headers,
        json={"name": "Should Not Change"},
    )
    assert write.status_code == 401

    async with session_factory() as session:
        point = await session.get(KnowledgePoint, point_id)
        assert point is not None
        assert point.name == "Embed Point"


async def test_teacher_permissions_remain_unchanged(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await _login(client, "embed-teacher-regression@example.com", "teacher")
    student = await _login(client, "embed-student-regression@example.com", "student")
    outsider = await _login(client, "embed-outsider-regression@example.com", "student")
    course = await _create_course(client, teacher, name="Embed Permission Course")
    await _join_course(client, student, course)
    await _add_structure(
        session_factory,
        course_id=UUID(course["id"]),
        teacher_id=UUID(teacher["id"]),
    )

    teacher_graph = await client.get(
        f"/api/v1/courses/{course['id']}/knowledge-graph",
        headers=_bearer(teacher),
    )
    assert teacher_graph.status_code == 200

    student_graph = await client.get(
        f"/api/v1/courses/{course['id']}/knowledge-graph",
        headers=_bearer(student),
    )
    assert student_graph.status_code == 403

    outsider_chapters = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=_bearer(outsider),
    )
    assert outsider_chapters.status_code == 403
