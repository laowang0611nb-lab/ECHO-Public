from datetime import UTC, datetime
from uuid import UUID, uuid4

from database.models.course import CourseMember
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType, StudentKnowledgeState
from database.models.user import UserRole
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


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

    async with session_factory() as session:
        document = await session.scalar(
            select(Document)
            .join(Chapter, Chapter.document_id == Document.id)
            .where(Chapter.id == chapter_id)
        )
        assert document is not None
        document.trashed_at = datetime.now(UTC)
        await session.commit()

    hidden_chapters = await client.get(
        f"/api/v1/courses/{course['id']}/chapters/analytics",
        headers=auth_headers(teacher),
    )
    hidden_point = await client.get(
        f"/api/v1/courses/{course['id']}/knowledge-points/{point_id}/analytics",
        headers=auth_headers(teacher),
    )
    assert hidden_chapters.status_code == 200
    assert hidden_chapters.json() == []
    assert hidden_point.status_code == 404


async def test_course_student_analytics_uses_one_aggregate_response(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "analytics-teacher@example.com", "teacher")
    student = await login(client, "analytics-student@example.com", "student")
    course, _, _ = await create_analytics_data(
        client,
        session_factory,
        teacher,
        student,
    )

    response = await client.get(
        f"/api/v1/courses/{course['id']}/students/analytics",
        headers=auth_headers(teacher),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["student_count"] == 2
    assert payload["summary"]["active_student_count"] == 1
    assert payload["summary"]["students_with_evidence"] == 1
    assert len(payload["items"]) == 2
    low_student = next(
        item for item in payload["items"] if item["member"]["display_name"] == "analytics-student"
    )
    assert low_student["average_mastery"] == 42.0
    assert low_student["active_days_7"] == 1
    assert low_student["learning_event_count"] == 1
    assert low_student["weak_knowledge_points"][0]["score"] == 42.0
    assert low_student["mastery_states"][0]["score"] == 42.0
    assert low_student["recent_evidence"][0]["event_type"] == "quiz_wrong"
    assert payload["chapter_analytics"][0]["average_mastery"] == 66.0

    compact = await client.get(
        f"/api/v1/courses/{course['id']}/students/analytics?includeDetails=false",
        headers=auth_headers(teacher),
    )
    assert compact.status_code == 200
    compact_low = next(
        item
        for item in compact.json()["items"]
        if item["member"]["display_name"] == "analytics-student"
    )
    assert compact_low["mastery_states"] == []
    assert compact_low["recent_evidence"] == []
    assert compact_low["weak_knowledge_points"][0]["score"] == 42.0


async def test_soft_deleted_knowledge_point_is_removed_from_learning_evidence(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "drill-delete-teacher@example.com", "teacher")
    student = await login(client, "drill-delete-student@example.com", "student")
    course, _, point_id = await create_analytics_data(
        client,
        session_factory,
        teacher,
        student,
    )
    async with session_factory() as session:
        point = await session.get(KnowledgePoint, point_id)
        assert point is not None
        point.trashed_at = datetime.now(UTC)
        await session.commit()

    learning = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/learning",
        headers=auth_headers(teacher),
    )
    assert learning.status_code == 200
    assert learning.json()["recent_evidence"] == []


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
