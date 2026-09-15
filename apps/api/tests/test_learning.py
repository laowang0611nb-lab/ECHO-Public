from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.course import CourseMember
from app.models.document import Document, DocumentStatus
from app.models.knowledge import Chapter, KnowledgePoint
from app.models.learning import MasterySnapshot, StudentKnowledgeState
from app.models.user import UserRole


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_course_and_point(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    student: dict[str, str],
) -> tuple[dict[str, str], UUID]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Learning Course"},
    )
    course = course_response.json()
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()

    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="learning.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
            )
        )
        session.add(
            Chapter(
                id=chapter_id,
                course_id=UUID(course["id"]),
                document_id=document_id,
                title="Chapter",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=UUID(course["id"]),
                chapter_id=chapter_id,
                name="Point",
                order_index=0,
            )
        )
        session.add(
            CourseMember(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                role=UserRole.STUDENT,
            )
        )
        await session.commit()

    return course, point_id


async def test_learning_event_updates_mastery_and_snapshot(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "learning-teacher@example.com", "teacher")
    student = await login(client, "learning-student@example.com", "student")
    course, point_id = await create_course_and_point(
        client,
        session_factory,
        teacher,
        student,
    )

    response = await client.post(
        f"/api/v1/courses/{course['id']}/learning-events",
        headers=auth_headers(teacher),
        json={
            "student_id": student["id"],
            "knowledge_point_id": str(point_id),
            "event_type": "quiz_correct",
            "evidence": "Correct answer",
        },
    )

    assert response.status_code == 201
    async with session_factory() as session:
        state = await session.scalar(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.user_id == UUID(student["id"]),
                StudentKnowledgeState.knowledge_point_id == point_id,
            )
        )
        snapshots = list(await session.scalars(select(MasterySnapshot)))

    assert state is not None
    assert state.score == 58.0
    assert len(snapshots) == 1


async def test_student_can_read_own_mastery(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "learning-read-teacher@example.com", "teacher")
    student = await login(client, "learning-read-student@example.com", "student")
    course, point_id = await create_course_and_point(
        client,
        session_factory,
        teacher,
        student,
    )
    await client.post(
        f"/api/v1/courses/{course['id']}/learning-events",
        headers=auth_headers(teacher),
        json={
            "student_id": student["id"],
            "knowledge_point_id": str(point_id),
            "event_type": "quiz_correct",
        },
    )

    response = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/mastery",
        headers=auth_headers(student),
    )

    assert response.status_code == 200
    assert response.json()[0]["score"] == 58.0


async def test_student_cannot_record_learning_event(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "learning-write-teacher@example.com", "teacher")
    student = await login(client, "learning-write-student@example.com", "student")
    course, point_id = await create_course_and_point(
        client,
        session_factory,
        teacher,
        student,
    )

    response = await client.post(
        f"/api/v1/courses/{course['id']}/learning-events",
        headers=auth_headers(student),
        json={
            "student_id": student["id"],
            "knowledge_point_id": str(point_id),
            "event_type": "quiz_correct",
        },
    )

    assert response.status_code == 403
