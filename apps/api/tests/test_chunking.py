from uuid import UUID, uuid4

from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.chunking import chunk_pages


def test_chunk_pages_preserves_page_metadata_and_overlap() -> None:
    chunks = chunk_pages(["a" * 25], chunk_size=10, overlap=2)

    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]
    assert [chunk.page_start for chunk in chunks] == [1, 1, 1]
    assert [chunk.page_end for chunk in chunks] == [1, 1, 1]
    assert [chunk.char_count for chunk in chunks] == [10, 10, 9]
    assert chunks[0].content[-2:] == chunks[1].content[:2]


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_ready_document(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Chunk Course"},
    )
    course = course_response.json()
    document_id = uuid4()

    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="chunk-source.pdf",
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
                    text="Alpha " * 300,
                    char_count=1800,
                ),
                DocumentPage(
                    document_id=document_id,
                    page_number=2,
                    text="Beta " * 300,
                    char_count=1500,
                ),
            ]
        )
        await session.commit()

    return {"id": str(document_id)}


async def test_teacher_creates_chunks_and_rechunk_replaces(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chunk-teacher@example.com", "teacher")
    document = await create_ready_document(client, session_factory, teacher)
    endpoint = f"/api/v1/documents/{document['id']}/chunks"

    first = await client.post(endpoint, headers=auth_headers(teacher))
    second = await client.post(endpoint, headers=auth_headers(teacher))

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(first.json()) >= 2
    assert first.json()[0]["page_start"] == 1

    async with session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(KnowledgeChunk))

    assert count == len(second.json())


async def test_chunking_assigns_chunks_to_matching_chapters(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chunk-mapping@example.com", "teacher")
    document = await create_ready_document(client, session_factory, teacher)
    async with session_factory() as session:
        stored = await session.get(Document, UUID(document["id"]))
        assert stored is not None
        alpha = Chapter(
            course_id=stored.course_id,
            document_id=stored.id,
            title="Alpha Topic",
            order_index=0,
        )
        beta = Chapter(
            course_id=stored.course_id,
            document_id=stored.id,
            title="Beta Topic",
            order_index=1,
        )
        session.add_all([alpha, beta])
        await session.flush()
        session.add_all(
            [
                KnowledgePoint(
                    course_id=stored.course_id,
                    chapter_id=alpha.id,
                    name="Alpha",
                    order_index=0,
                ),
                KnowledgePoint(
                    course_id=stored.course_id,
                    chapter_id=beta.id,
                    name="Beta",
                    order_index=0,
                ),
            ]
        )
        await session.commit()
        alpha_id = alpha.id
        beta_id = beta.id

    response = await client.post(
        f"/api/v1/documents/{document['id']}/chunks",
        headers=auth_headers(teacher),
    )
    assert response.status_code == 200

    async with session_factory() as session:
        chunks = list(
            await session.scalars(select(KnowledgeChunk).order_by(KnowledgeChunk.chunk_index))
        )
    assert chunks
    assert all(chunk.chapter_id is not None for chunk in chunks)
    alpha_chunks = [chunk for chunk in chunks if chunk.chapter_id == alpha_id]
    beta_chunks = [chunk for chunk in chunks if chunk.chapter_id == beta_id]
    assert alpha_chunks
    assert beta_chunks
    assert all(chunk.page_start == 1 for chunk in alpha_chunks)
    assert all(chunk.page_start == 2 for chunk in beta_chunks)


async def test_student_cannot_create_chunks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "chunk-owner@example.com", "teacher")
    student = await login(client, "chunk-student@example.com", "student")
    document = await create_ready_document(client, session_factory, teacher)

    response = await client.post(
        f"/api/v1/documents/{document['id']}/chunks",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_unparsed_document_cannot_create_chunks(client: AsyncClient) -> None:
    teacher = await login(client, "chunk-unparsed@example.com", "teacher")
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Unparsed Chunk Course"},
    )
    course = course_response.json()
    upload_response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("unparsed.pdf", b"%PDF-1.7\n%%EOF", "application/pdf")},
    )
    document = upload_response.json()

    response = await client.post(
        f"/api/v1/documents/{document['id']}/chunks",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 409
