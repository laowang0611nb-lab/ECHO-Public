from io import BytesIO
from uuid import UUID

from database.auth.password import hash_password
from database.models.auth import AuthSession, UserCredential
from database.models.document import Document, DocumentPage
from database.models.knowledge import KnowledgeChunk
from httpx import AsyncClient
from pypdf import PdfWriter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.auth import authenticate_with_password


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
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def test_course_create_read_update_archive_and_restore(client: AsyncClient) -> None:
    teacher = await login(client, "p1-course-teacher@example.com", "teacher")
    student = await login(client, "p1-course-student@example.com", "student")

    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={
            "name": "P1 Course",
            "description": "Before update",
            "term": "2026 秋季学期",
            "course_type": "专业课",
            "target_audience": "软件工程本科生",
            "expected_student_count": 48,
        },
    )
    assert created.status_code == 201
    course = created.json()
    assert course["term"] == "2026 秋季学期"
    assert course["semester"] == "2026 秋季学期"
    assert course["course_type"] == "专业课"
    assert course["target_audience"] == "软件工程本科生"
    assert course["expected_student_count"] == 48
    assert course["status"] == "draft"
    assert course["archived_at"] is None

    listed = await client.get("/api/v1/courses", headers=auth_headers(teacher))
    assert listed.status_code == 200
    assert (
        next(item for item in listed.json() if item["id"] == course["id"])["expected_student_count"]
        == 48
    )

    patched = await client.patch(
        f"/api/v1/courses/{course['id']}",
        headers=auth_headers(teacher),
        json={
            "name": "P1 Course Updated",
            "description": None,
            "semester": "2027 春季学期",
            "course_type": "通识课",
            "target_audience": "全校学生",
            "expected_student_count": 96,
        },
    )
    assert patched.status_code == 200
    updated = patched.json()
    assert updated["name"] == "P1 Course Updated"
    assert updated["description"] is None
    assert updated["term"] == "2027 春季学期"
    assert updated["course_type"] == "通识课"
    assert updated["expected_student_count"] == 96

    forbidden_update = await client.patch(
        f"/api/v1/courses/{course['id']}",
        headers=auth_headers(student),
        json={"name": "Student Update"},
    )
    assert forbidden_update.status_code == 403

    published_before_archive = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    assert published_before_archive.status_code == 200
    assert published_before_archive.json()["status"] == "published"

    archived = await client.post(
        f"/api/v1/courses/{course['id']}/archive",
        headers=auth_headers(teacher),
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert archived.json()["archived_at"] is not None

    detail = await client.get(
        f"/api/v1/courses/{course['id']}",
        headers=auth_headers(teacher),
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "archived"

    join_archived = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": course["code"]},
    )
    assert join_archived.status_code == 409

    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    assert published.status_code == 409

    forbidden_archive = await client.post(
        f"/api/v1/courses/{course['id']}/archive",
        headers=auth_headers(student),
    )
    assert forbidden_archive.status_code == 403

    restored = await client.post(
        f"/api/v1/courses/{course['id']}/restore",
        headers=auth_headers(teacher),
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "draft"
    assert restored.json()["archived_at"] is None


async def test_teacher_profile_update_and_permissions(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "p1-profile-teacher@example.com", "teacher")
    other_teacher = await login(client, "p1-profile-other@example.com", "teacher")
    student = await login(client, "p1-profile-student@example.com", "student")

    initial = await client.get(
        "/api/v1/auth/me/profile",
        headers=auth_headers(teacher),
    )
    assert initial.status_code == 200
    assert initial.json()["display_name"] == "p1-profile-teacher"
    assert initial.json()["teaching_fields"] == []

    updated = await client.patch(
        "/api/v1/auth/me/profile",
        headers=auth_headers(teacher),
        json={
            "display_name": "Teacher Profile Updated",
            "department": "软件工程系",
            "teacher_no": "T-P1-001",
            "teaching_fields": ["软件测试", "软件工程", "软件测试"],
        },
    )
    assert updated.status_code == 200
    profile = updated.json()
    assert profile["display_name"] == "Teacher Profile Updated"
    assert profile["department"] == "软件工程系"
    assert profile["employee_no"] == "T-P1-001"
    assert profile["teaching_fields"] == ["软件测试", "软件工程"]

    persisted = await client.get(
        "/api/v1/auth/me/profile",
        headers=auth_headers(teacher),
    )
    assert persisted.json()["employee_no"] == "T-P1-001"

    conflict = await client.patch(
        "/api/v1/auth/me/profile",
        headers=auth_headers(other_teacher),
        json={"employee_no": "T-P1-001"},
    )
    assert conflict.status_code == 409

    forbidden_get = await client.get(
        "/api/v1/auth/me/profile",
        headers=auth_headers(student),
    )
    forbidden_patch = await client.patch(
        "/api/v1/auth/me/profile",
        headers=auth_headers(student),
        json={"department": "不应允许"},
    )
    assert forbidden_get.status_code == 403
    assert forbidden_patch.status_code == 403


async def test_password_change_verifies_and_revokes_sessions(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "p1-password-teacher@example.com", "teacher")
    user_id = UUID(teacher["id"])
    old_password = "OldPassword123"
    new_password = "NewPassword456"
    password_hash, algorithm = hash_password(old_password)

    async with session_factory() as session:
        session.add(
            UserCredential(
                user_id=user_id,
                password_hash=password_hash,
                password_algorithm=algorithm,
            )
        )
        auth_session = AuthSession(
            user_id=user_id,
            refresh_token_hash="p1-password-session-hash",
            expires_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
        )
        session.add(auth_session)
        await session.commit()
        auth_session_id = auth_session.id

    wrong_current = await client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers(teacher),
        json={"current_password": "WrongPassword123", "new_password": new_password},
    )
    invalid_new = await client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers(teacher),
        json={"current_password": old_password, "new_password": "short"},
    )
    assert wrong_current.status_code == 400
    assert invalid_new.status_code == 422

    changed = await client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers(teacher),
        json={"current_password": old_password, "new_password": new_password},
    )
    assert changed.status_code == 200
    assert changed.json()["sessions_revoked"] == 1

    async with session_factory() as session:
        credential = await session.get(UserCredential, user_id)
        assert credential is not None
        assert credential.password_hash != new_password
        old_login = await authenticate_with_password(
            session,
            teacher["email"],
            old_password,
        )
        new_login = await authenticate_with_password(
            session,
            teacher["email"],
            new_password,
        )
        revoked = await session.get(AuthSession, auth_session_id)
    assert old_login is None
    assert new_login is not None
    assert new_login.id == user_id
    assert revoked is not None
    assert revoked.revoked_at is not None


async def test_document_metadata_update_preserves_index_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "p1-metadata-teacher@example.com", "teacher")
    student = await login(client, "p1-metadata-student@example.com", "student")
    course = (
        await client.post(
            "/api/v1/courses",
            headers=auth_headers(teacher),
            json={"name": "Metadata Course"},
        )
    ).json()
    uploaded = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("metadata.pdf", make_pdf(), "application/pdf")},
    )
    assert uploaded.status_code == 201
    document_id = UUID(uploaded.json()["id"])
    parsed = await client.post(
        f"/api/v1/documents/{document_id}/parse",
        headers=auth_headers(teacher),
    )
    assert parsed.status_code == 200
    async with session_factory() as session:
        session.add(
            KnowledgeChunk(
                course_id=UUID(course["id"]),
                document_id=document_id,
                chunk_index=0,
                page_start=1,
                page_end=1,
                content="Metadata preservation chunk",
                char_count=26,
                metadata_json={"source": "test"},
            )
        )
        await session.commit()
    async with session_factory() as session:
        before_pages = int(
            await session.scalar(
                select(func.count())
                .select_from(DocumentPage)
                .where(DocumentPage.document_id == document_id)
            )
            or 0
        )
        before_chunks = int(
            await session.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == document_id)
            )
            or 0
        )
        before_document = await session.get(Document, document_id)
        assert before_document is not None
        original_storage_key = before_document.storage_key
        original_status = before_document.status

    patched = await client.patch(
        f"/api/v1/courses/{course['id']}/documents/{document_id}/metadata",
        headers=auth_headers(teacher),
        json={
            "title": "Metadata Title",
            "summary": "用于课堂教学的摘要。",
            "keywords": ["软件测试", "边界值", "软件测试"],
            "author": "ECHO Teacher",
            "publisher": "ECHO Press",
            "copyright": "2026",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["display_name"] == "Metadata Title"
    assert body["summary"] == "用于课堂教学的摘要。"
    assert body["keywords"] == ["软件测试", "边界值"]
    assert body["author"] == "ECHO Teacher"
    assert body["publisher"] == "ECHO Press"
    assert body["copyright"] == "2026"
    assert body["status"] == original_status.value

    forbidden = await client.patch(
        f"/api/v1/courses/{course['id']}/documents/{document_id}/metadata",
        headers=auth_headers(student),
        json={"summary": "不应允许"},
    )
    assert forbidden.status_code == 403

    async with session_factory() as session:
        after_pages = int(
            await session.scalar(
                select(func.count())
                .select_from(DocumentPage)
                .where(DocumentPage.document_id == document_id)
            )
            or 0
        )
        after_chunks = int(
            await session.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == document_id)
            )
            or 0
        )
        after_document = await session.get(Document, document_id)
        assert after_document is not None
        assert after_document.storage_key == original_storage_key
    assert after_pages == before_pages
    assert after_chunks == before_chunks


def test_p1_openapi_paths() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/api/v1/courses/{course_id}" in paths
    assert "/api/v1/courses/{course_id}/archive" in paths
    assert "/api/v1/courses/{course_id}/restore" in paths
    assert "/api/v1/auth/me/profile" in paths
    assert "/api/v1/auth/change-password" in paths
    assert "/api/v1/courses/{course_id}/documents/{document_id}/metadata" in paths
