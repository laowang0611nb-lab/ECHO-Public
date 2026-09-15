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


async def test_teacher_reads_course_dashboard(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "dashboard-teacher@example.com", "teacher")
    student_one = await login(client, "dashboard-student-one@example.com", "student")
    student_two = await login(client, "dashboard-student-two@example.com", "student")
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Dashboard Course"},
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
                original_name="dashboard.pdf",
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
                name="Weak Point",
                order_index=0,
            )
        )
        session.add_all(
            [
                CourseMember(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_one["id"]),
                    role=UserRole.STUDENT,
                ),
                CourseMember(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_two["id"]),
                    role=UserRole.STUDENT,
                ),
                StudentKnowledgeState(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_one["id"]),
                    knowledge_point_id=point_id,
                    score=40.0,
                ),
                StudentKnowledgeState(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_two["id"]),
                    knowledge_point_id=point_id,
                    score=50.0,
                ),
                LearningEvent(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_one["id"]),
                    knowledge_point_id=point_id,
                    event_type=LearningEventType.QUESTION_ASKED,
                    weight=1.0,
                    metadata_json={},
                    created_at=datetime.now(UTC),
                ),
            ]
        )
        await session.commit()

    response = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    dashboard = response.json()
    assert dashboard["student_count"] == 2
    assert dashboard["active_student_count"] == 1
    assert dashboard["question_count_7d"] == 1
    assert dashboard["average_mastery"] == 45.0
    assert dashboard["high_risk_knowledge_points"][0]["name"] == "Weak Point"


async def test_student_cannot_read_teacher_dashboard(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "dashboard-owner@example.com", "teacher")
    student = await login(client, "dashboard-student@example.com", "student")
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Dashboard Forbidden"},
    )
    course = course_response.json()

    async with session_factory() as session:
        session.add(
            CourseMember(
                course_id=UUID(course["id"]),
                user_id=UUID(student["id"]),
                role=UserRole.STUDENT,
            )
        )
        await session.commit()

    response = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(student),
    )

    assert response.status_code == 403
