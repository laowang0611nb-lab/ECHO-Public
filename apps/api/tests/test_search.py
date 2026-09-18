from datetime import UTC, datetime
from uuid import UUID, uuid4

from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.search import cosine_distance


async def test_search_ignores_chunks_from_non_ready_documents(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "threshold-status@example.com", "teacher")
    course = await create_chunked_document(client, session_factory, teacher)
    async with session_factory() as session:
        document = await session.scalar(
            select(Document).where(Document.course_id == UUID(course["id"]))
        )
        assert document is not None
        document_id = document.id

    embedded = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )
    assert embedded.status_code == 200

    async with session_factory() as session:
        document = await session.get(Document, document_id)
        assert document is not None
        document.status = DocumentStatus.FAILED
        await session.commit()

    response = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(teacher),
        json={"query": "alpha concept", "limit": 5},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_cosine_distance() -> None:
    assert cosine_distance([1.0, 0.0], [1.0, 0.0]) == 0.0
    assert cosine_distance([1.0, 0.0], [0.0, 1.0]) == 1.0


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_chunked_document(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Search Course"},
    )
    course = course_response.json()
    document_id = uuid4()

    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="search.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
                page_count=2,
            )
        )
        session.add_all(
            [
                DocumentPage(
                    document_id=document_id,
                    page_number=1,
                    text="Alpha " * 50,
                    char_count=300,
                ),
                DocumentPage(
                    document_id=document_id,
                    page_number=2,
                    text="Beta " * 50,
                    char_count=250,
                ),
            ]
        )
        await session.commit()

    chunk_response = await client.post(
        f"/api/v1/documents/{document_id}/chunks",
        headers=auth_headers(teacher),
    )
    assert chunk_response.status_code == 200
    return course


async def test_search_and_indexing_ignore_trashed_document_or_chapter(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "trash-search@example.com", "teacher")
    course = await create_chunked_document(client, session_factory, teacher)
    course_id = UUID(course["id"])
    async with session_factory() as session:
        document = await session.scalar(select(Document).where(Document.course_id == course_id))
        assert document is not None
        chapter = Chapter(
            course_id=course_id,
            document_id=document.id,
            title="Indexed Chapter",
            order_index=0,
        )
        session.add(chapter)
        await session.flush()
        chunks = list(
            await session.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
            )
        )
        for chunk in chunks:
            chunk.chapter_id = chapter.id
        await session.commit()
        document_id = document.id
        chapter_id = chapter.id

    embedded = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )
    assert embedded.status_code == 200

    async with session_factory() as session:
        chapter = await session.get(Chapter, chapter_id)
        assert chapter is not None
        chapter.trashed_at = datetime.now(UTC)
        await session.commit()

    chapter_hidden = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(teacher),
        json={"query": "alpha concept", "limit": 5},
    )
    assert chapter_hidden.status_code == 200
    assert chapter_hidden.json() == []

    async with session_factory() as session:
        chapter = await session.get(Chapter, chapter_id)
        document = await session.get(Document, document_id)
        assert chapter is not None and document is not None
        chapter.trashed_at = None
        document.trashed_at = datetime.now(UTC)
        await session.commit()

    document_hidden = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(teacher),
        json={"query": "alpha concept", "limit": 5},
    )
    chunk_response = await client.post(
        f"/api/v1/documents/{document_id}/chunks",
        headers=auth_headers(teacher),
    )
    embedding_response = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )

    assert document_hidden.status_code == 200
    assert document_hidden.json() == []
    assert chunk_response.status_code == 404
    assert embedding_response.status_code == 404


async def test_teacher_embeds_chunks_and_searches_course(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "embed-teacher@example.com", "teacher")
    course = await create_chunked_document(client, session_factory, teacher)

    document_id = None
    async with session_factory() as session:
        document_id = await session.scalar(select(KnowledgeChunk.document_id).limit(1))
        assert document_id is not None
        embedded_count = await session.scalar(select(func.count()).select_from(KnowledgeChunk))

    embedding_response = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )
    search_response = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(teacher),
        json={"query": "alpha concept", "limit": 1},
    )

    assert embedding_response.status_code == 200
    assert embedding_response.json()["embedded_chunks"] == embedded_count
    assert search_response.status_code == 200
    assert len(search_response.json()) == 1
    assert "alpha" in search_response.json()[0]["content"].casefold()


async def test_student_cannot_embed_chunks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "embed-owner@example.com", "teacher")
    student = await login(client, "embed-student@example.com", "student")
    await create_chunked_document(client, session_factory, teacher)
    document_id = None
    async with session_factory() as session:
        document_id = await session.scalar(select(KnowledgeChunk.document_id).limit(1))

    response = await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_search_filters_unrelated_chunks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "threshold-teacher@example.com", "teacher")
    course = await create_chunked_document(client, session_factory, teacher)
    document_id = None
    async with session_factory() as session:
        document_id = await session.scalar(select(KnowledgeChunk.document_id).limit(1))
    await client.post(
        f"/api/v1/documents/{document_id}/embeddings",
        headers=auth_headers(teacher),
    )

    response = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(teacher),
        json={"query": "gamma unrelated", "limit": 5},
    )

    assert response.status_code == 200
    assert response.json() == []


async def test_non_member_cannot_search_course(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "search-owner@example.com", "teacher")
    outsider = await login(client, "search-outsider@example.com", "student")
    course = await create_chunked_document(client, session_factory, teacher)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/search",
        headers=auth_headers(outsider),
        json={"query": "alpha", "limit": 5},
    )

    assert response.status_code == 403
