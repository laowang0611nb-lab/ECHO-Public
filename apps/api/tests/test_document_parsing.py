from io import BytesIO
from uuid import UUID, uuid4

from database.models.document import Document, DocumentPage
from database.models.knowledge import KnowledgeChunk
from httpx import AsyncClient
from pypdf import PdfWriter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

PDF_BYTES = b"%PDF-1.7\ntrailer\n%%EOF\n"


def make_pdf(page_count: int = 2) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=612, height=792)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "display_name": email.split("@")[0],
            "role": role,
        },
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_course_and_upload(
    client: AsyncClient,
    teacher: dict[str, str],
    pdf_bytes: bytes,
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Parsing Course"},
    )
    assert course_response.status_code == 201
    course = course_response.json()

    upload_response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("course.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_response.status_code == 201
    return upload_response.json()


async def test_teacher_parses_pdf_into_pages(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "parse-teacher@example.com", "teacher")
    document = await create_course_and_upload(client, teacher, make_pdf(page_count=2))

    response = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    parsed = response.json()
    assert parsed["status"] == "ready"
    assert parsed["page_count"] == 2

    async with session_factory() as session:
        pages = list(
            await session.scalars(
                select(DocumentPage)
                .where(DocumentPage.document_id == UUID(document["id"]))
                .order_by(DocumentPage.page_number)
            )
        )

    assert [page.page_number for page in pages] == [1, 2]
    assert all(page.char_count == 0 for page in pages)


async def test_reparse_replaces_existing_pages(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "reparse-teacher@example.com", "teacher")
    document = await create_course_and_upload(client, teacher, make_pdf(page_count=2))
    endpoint = f"/api/v1/documents/{document['id']}/parse"

    first = await client.post(endpoint, headers=auth_headers(teacher))
    second = await client.post(endpoint, headers=auth_headers(teacher))

    assert first.status_code == 200
    assert second.status_code == 200
    async with session_factory() as session:
        page_count = len(
            list(
                await session.scalars(
                    select(DocumentPage.id).where(DocumentPage.document_id == UUID(document["id"]))
                )
            )
        )

    assert page_count == 2


async def test_reparse_removes_stale_chunks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "reparse-chunks@example.com", "teacher")
    document = await create_course_and_upload(client, teacher, make_pdf(page_count=2))
    document_id = UUID(document["id"])
    endpoint = f"/api/v1/documents/{document_id}/parse"

    first = await client.post(endpoint, headers=auth_headers(teacher))
    assert first.status_code == 200
    async with session_factory() as session:
        session.add(
            KnowledgeChunk(
                course_id=UUID(first.json()["course_id"]),
                document_id=document_id,
                chunk_index=0,
                page_start=1,
                page_end=1,
                content="stale chunk",
                char_count=11,
                metadata_json={},
            )
        )
        await session.commit()

    second = await client.post(endpoint, headers=auth_headers(teacher))
    assert second.status_code == 200
    async with session_factory() as session:
        chunks = list(
            await session.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id)
            )
        )

    assert chunks == []


async def test_teacher_lists_documents_after_upload_and_parse(client: AsyncClient) -> None:
    teacher = await login(client, "list-documents@example.com", "teacher")
    document = await create_course_and_upload(client, teacher, make_pdf(page_count=2))
    course_id = document["course_id"]

    parsed = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )
    second = await client.post(
        f"/api/v1/courses/{course_id}/documents",
        headers=auth_headers(teacher),
        files={"file": ("second.pdf", make_pdf(page_count=1), "application/pdf")},
    )
    listed = await client.get(
        f"/api/v1/courses/{course_id}/documents",
        headers=auth_headers(teacher),
    )

    assert parsed.status_code == 200
    assert second.status_code == 201
    assert listed.status_code == 200
    documents = {item["id"]: item for item in listed.json()}
    assert set(documents) == {document["id"], second.json()["id"]}
    assert documents[document["id"]]["status"] == "ready"
    assert documents[document["id"]]["page_count"] == 2
    assert documents[second.json()["id"]]["status"] == "uploaded"


async def test_student_cannot_list_documents(client: AsyncClient) -> None:
    teacher = await login(client, "list-documents-owner@example.com", "teacher")
    student = await login(client, "list-documents-student@example.com", "student")
    document = await create_course_and_upload(client, teacher, make_pdf())

    response = await client.get(
        f"/api/v1/courses/{document['course_id']}/documents",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_unknown_course_document_list_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "list-documents-missing@example.com", "teacher")

    response = await client.get(
        f"/api/v1/courses/{uuid4()}/documents",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 404


async def test_student_cannot_parse_document(client: AsyncClient) -> None:
    teacher = await login(client, "parse-owner@example.com", "teacher")
    student = await login(client, "parse-student@example.com", "student")
    document = await create_course_and_upload(client, teacher, make_pdf())

    response = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_invalid_pdf_is_marked_failed(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "parse-invalid@example.com", "teacher")
    document = await create_course_and_upload(client, teacher, PDF_BYTES)

    response = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 422
    async with session_factory() as session:
        stored = await session.get(Document, UUID(document["id"]))

    assert stored is not None
    assert stored.status.value == "failed"


async def test_unknown_document_parse_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "parse-missing@example.com", "teacher")

    response = await client.post(
        f"/api/v1/documents/{uuid4()}/parse",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 404
