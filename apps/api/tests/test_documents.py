from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.document import Document
from app.services.storage import LocalDocumentStorage

PDF_BYTES = b"%PDF-1.7\ntrailer\n%%EOF\n"


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


async def create_course(client: AsyncClient, teacher: dict[str, str]) -> dict[str, str]:
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Document Course"},
    )
    assert response.status_code == 201
    return response.json()


async def test_teacher_uploads_pdf_and_file_is_persisted(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    document_storage: LocalDocumentStorage,
) -> None:
    teacher = await login(client, "upload-teacher@example.com", "teacher")
    course = await create_course(client, teacher)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("course-notes.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 201
    document = response.json()
    assert document["course_id"] == course["id"]
    assert document["original_name"] == "course-notes.pdf"
    assert document["content_type"] == "application/pdf"
    assert document["size_bytes"] == len(PDF_BYTES)
    assert document["status"] == "uploaded"

    async with session_factory() as session:
        stored_document = await session.scalar(
            select(Document).where(Document.id == UUID(document["id"]))
        )

    assert stored_document is not None
    assert document_storage.path_for(stored_document.storage_key).read_bytes() == PDF_BYTES


async def test_student_cannot_upload_document(client: AsyncClient) -> None:
    teacher = await login(client, "upload-owner@example.com", "teacher")
    student = await login(client, "upload-student@example.com", "student")
    course = await create_course(client, teacher)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(student),
        files={"file": ("notes.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 403


async def test_non_member_cannot_upload_document(client: AsyncClient) -> None:
    owner = await login(client, "upload-nonmember-owner@example.com", "teacher")
    outsider = await login(client, "upload-nonmember@example.com", "teacher")
    course = await create_course(client, owner)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(outsider),
        files={"file": ("notes.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 403


async def test_non_pdf_upload_returns_415(client: AsyncClient) -> None:
    teacher = await login(client, "upload-type@example.com", "teacher")
    course = await create_course(client, teacher)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 415


async def test_oversized_upload_returns_413(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "upload-size@example.com", "teacher")
    course = await create_course(client, teacher)
    monkeypatch.setattr(settings, "max_upload_bytes", 4)

    response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("large.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 413


async def test_unknown_course_upload_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "upload-missing@example.com", "teacher")

    response = await client.post(
        f"/api/v1/courses/{uuid4()}/documents",
        headers=auth_headers(teacher),
        files={"file": ("notes.pdf", PDF_BYTES, "application/pdf")},
    )

    assert response.status_code == 404
