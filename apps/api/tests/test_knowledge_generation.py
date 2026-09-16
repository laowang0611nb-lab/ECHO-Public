from io import BytesIO
from uuid import UUID, uuid4

from httpx import AsyncClient
from pypdf import PdfWriter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.course import CourseMember
from app.models.knowledge import Chapter, KnowledgePoint
from app.models.learning import MasterySnapshot, StudentKnowledgeState
from app.models.user import UserRole


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


async def create_ready_document(
    client: AsyncClient,
    teacher: dict[str, str],
) -> tuple[dict[str, str], dict[str, str]]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Knowledge Course"},
    )
    assert course_response.status_code == 201
    course = course_response.json()

    upload_response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("knowledge.pdf", make_pdf(), "application/pdf")},
    )
    assert upload_response.status_code == 201
    document = upload_response.json()

    parse_response = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )
    assert parse_response.status_code == 200
    return course, parse_response.json()


async def test_teacher_generates_and_lists_structure(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "knowledge-teacher@example.com", "teacher")
    course, document = await create_ready_document(client, teacher)

    generated = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )
    listed = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(teacher),
    )

    assert generated.status_code == 200
    assert [chapter["title"] for chapter in generated.json()] == ["Chapter 1", "Chapter 2"]
    assert len(generated.json()[0]["knowledge_points"]) == 2
    assert listed.status_code == 200
    assert listed.json()[0]["knowledge_points"][0]["name"] == "Point 1"


async def test_regeneration_preserves_mastery_for_matching_points(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "knowledge-preserve@example.com", "teacher")
    student = await login(client, "knowledge-preserve-student@example.com", "student")
    course, document = await create_ready_document(client, teacher)
    endpoint = f"/api/v1/documents/{document['id']}/generate-structure"

    first = await client.post(endpoint, headers=auth_headers(teacher))
    assert first.status_code == 200
    point_id = UUID(first.json()[0]["knowledge_points"][0]["id"])
    async with session_factory() as session:
        session.add(
            CourseMember(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                role=UserRole.STUDENT,
            )
        )
        session.add(
            StudentKnowledgeState(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                knowledge_point_id=point_id,
                score=73.0,
            )
        )
        session.add(
            MasterySnapshot(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                knowledge_point_id=point_id,
                score=73.0,
            )
        )
        await session.commit()

    second = await client.post(endpoint, headers=auth_headers(teacher))
    assert second.status_code == 200
    assert second.json()[0]["knowledge_points"][0]["id"] == str(point_id)

    async with session_factory() as session:
        state = await session.scalar(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == UUID(course["id"]),
                StudentKnowledgeState.user_id == UUID(student["id"]),
            )
        )
        snapshots = list(await session.scalars(select(MasterySnapshot)))

    assert state is not None
    assert state.knowledge_point_id == point_id
    assert state.score == 73.0
    assert len(snapshots) == 1


async def test_regeneration_replaces_existing_structure(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "knowledge-regen@example.com", "teacher")
    _, document = await create_ready_document(client, teacher)
    endpoint = f"/api/v1/documents/{document['id']}/generate-structure"

    first = await client.post(endpoint, headers=auth_headers(teacher))
    second = await client.post(endpoint, headers=auth_headers(teacher))

    assert first.status_code == 200
    assert second.status_code == 200
    async with session_factory() as session:
        chapter_count = await session.scalar(select(func.count()).select_from(Chapter))
        point_count = await session.scalar(select(func.count()).select_from(KnowledgePoint))

    assert chapter_count == 2
    assert point_count == 3


async def test_student_cannot_generate_structure(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-owner@example.com", "teacher")
    student = await login(client, "knowledge-student@example.com", "student")
    _, document = await create_ready_document(client, teacher)

    response = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_unparsed_document_cannot_generate_structure(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-unparsed@example.com", "teacher")
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Unparsed Course"},
    )
    course = course_response.json()
    upload_response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("unparsed.pdf", make_pdf(), "application/pdf")},
    )
    document = upload_response.json()

    response = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 409


async def test_unknown_document_generation_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-missing@example.com", "teacher")

    response = await client.post(
        f"/api/v1/documents/{uuid4()}/generate-structure",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 404


async def test_course_chapters_are_member_only(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "knowledge-members@example.com", "teacher")
    outsider = await login(client, "knowledge-outsider@example.com", "student")
    course, document = await create_ready_document(client, teacher)
    await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )

    response = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(outsider),
    )

    assert response.status_code == 403
