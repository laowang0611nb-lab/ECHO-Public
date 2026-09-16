from datetime import UTC, datetime
from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.course import CourseMember
from app.models.document import Document, DocumentStatus
from app.models.knowledge import Chapter, KnowledgePoint
from app.models.learning import LearningEvent, LearningEventType, StudentKnowledgeState
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


async def create_analytics_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    student: dict[str, str],
) -> tuple[dict[str, str], UUID, UUID]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Drilldown Course"},
    )
    course = course_response.json()
    high_student = await login(client, "drill-high-student@example.com", "student")
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()

    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="drilldown.pdf",
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
                title="Testing",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=UUID(course["id"]),
                chapter_id=chapter_id,
                name="Black Box Testing",
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
        session.add(
            StudentKnowledgeState(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                knowledge_point_id=point_id,
                score=42.0,
            )
        )
        session.add(
            CourseMember(
                course_id=UUID(course["id"]),
                user_id=UUID(high_student["id"]),
                role=UserRole.STUDENT,
            )
        )
        session.add(
            StudentKnowledgeState(
                course_id=UUID(course["id"]),
                user_id=UUID(high_student["id"]),
                knowledge_point_id=point_id,
                score=90.0,
            )
        )
        session.add(
            LearningEvent(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                knowledge_point_id=point_id,
                event_type=LearningEventType.QUIZ_WRONG,
                weight=1.0,
                evidence="Confused black box and white box",
                metadata_json={},
                created_at=datetime.now(UTC),
            )
        )
        await session.commit()

    return course, chapter_id, point_id


async def test_teacher_drilldown_endpoints(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "drill-teacher@example.com", "teacher")
    student = await login(client, "drill-student@example.com", "student")
    course, chapter_id, point_id = await create_analytics_data(
        client,
        session_factory,
        teacher,
        student,
    )

    chapters = await client.get(
        f"/api/v1/courses/{course['id']}/chapters/analytics",
        headers=auth_headers(teacher),
    )
    point = await client.get(
        f"/api/v1/courses/{course['id']}/knowledge-points/{point_id}/analytics",
        headers=auth_headers(teacher),
    )
    learning = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/learning",
        headers=auth_headers(teacher),
    )

    assert chapters.status_code == 200
    assert chapters.json()[0]["chapter_id"] == str(chapter_id)
    assert chapters.json()[0]["average_mastery"] == 66.0
    assert point.status_code == 200
    assert point.json()["students"][0]["score"] == 42.0
    assert point.json()["affected_students"] == 1
    assert learning.status_code == 200
    assert learning.json()["recent_evidence"][0]["event_type"] == "quiz_wrong"


async def test_student_cannot_use_drilldown(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "drill-owner@example.com", "teacher")
    student = await login(client, "drill-outsider@example.com", "student")
    course, _, _ = await create_analytics_data(
        client,
        session_factory,
        teacher,
        student,
    )

    response = await client.get(
        f"/api/v1/courses/{course['id']}/chapters/analytics",
        headers=auth_headers(student),
    )

    assert response.status_code == 403
