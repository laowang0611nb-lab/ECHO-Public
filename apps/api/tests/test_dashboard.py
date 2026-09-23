from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from database.models.course import CourseMember
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType, StudentKnowledgeState
from database.models.user import UserRole
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.dashboard import dashboard_day_bounds


def test_dashboard_day_bounds_use_business_timezone() -> None:
    bounds = dashboard_day_bounds(
        datetime(2026, 9, 16, 17, 30, tzinfo=UTC),
        "Asia/Shanghai",
    )
    assert bounds[-1][0].isoformat() == "2026-09-17"
    assert bounds[-1][1] == datetime(2026, 9, 16, 16, 0, tzinfo=UTC)
    assert bounds[-1][2] == datetime(2026, 9, 17, 16, 0, tzinfo=UTC)


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
    student_three = await login(client, "dashboard-student-three@example.com", "student")
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Dashboard Course"},
    )
    course = course_response.json()
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()
    trend_event_at = dashboard_day_bounds(
        datetime.now(UTC),
        "Asia/Shanghai",
    )[-1][1] + timedelta(hours=1)

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
                CourseMember(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_three["id"]),
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
                StudentKnowledgeState(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_three["id"]),
                    knowledge_point_id=point_id,
                    score=80.0,
                ),
                LearningEvent(
                    course_id=UUID(course["id"]),
                    user_id=UUID(student_one["id"]),
                    knowledge_point_id=point_id,
                    event_type=LearningEventType.QUESTION_ASKED,
                    weight=1.0,
                    metadata_json={},
                    created_at=trend_event_at,
                ),
            ]
        )
        await session.commit()

    response = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )
    overview_response = await client.get(
        "/api/v1/dashboard/overview",
        params={"courseId": course["id"]},
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    dashboard = response.json()
    assert dashboard["student_count"] == 3
    assert dashboard["active_student_count"] == 1
    assert dashboard["question_count_7d"] == 1
    assert dashboard["average_mastery"] == 56.67
    assert dashboard["high_risk_knowledge_points"][0]["name"] == "Weak Point"
    assert dashboard["high_risk_knowledge_points"][0]["affected_students"] == 2

    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["stats"]["student_count"] == 3
    assert overview["stats"]["active_student_count"] == 1
    assert overview["stats"]["weekly_interaction_count"] == 1
    assert overview["stats"]["attention_knowledge_point_count"] == 1
    assert len(overview["trend"]) == 7
    assert sum(point["interaction_count"] for point in overview["trend"]) == 1
    assert overview["insight"]["risk_level"] == "medium"
    assert overview["chapter_mastery"][0]["title"] == "Chapter"
    assert overview["learning_difficulties"][0]["name"] == "Weak Point"
    assert {action["action_type"] for action in overview["teacher_actions"]} == {
        "support_knowledge_point",
        "encourage_inactive_students",
    }


async def test_dashboard_excludes_soft_deleted_document_content(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "dashboard-delete-teacher@example.com", "teacher")
    student = await login(client, "dashboard-delete-student@example.com", "student")
    course = (
        await client.post(
            "/api/v1/courses",
            headers=auth_headers(teacher),
            json={"name": "Deleted Dashboard Course"},
        )
    ).json()
    course_id = UUID(course["id"])
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add_all(
            [
                Document(
                    id=document_id,
                    course_id=course_id,
                    uploaded_by=UUID(teacher["id"]),
                    original_name="deleted.pdf",
                    storage_key=f"tests/{document_id}.pdf",
                    content_type="application/pdf",
                    size_bytes=100,
                    status=DocumentStatus.READY,
                    trashed_at=datetime.now(UTC),
                ),
                Chapter(
                    id=chapter_id,
                    course_id=course_id,
                    document_id=document_id,
                    title="Deleted Chapter",
                    order_index=0,
                ),
                KnowledgePoint(
                    id=point_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Deleted Point",
                    order_index=0,
                ),
                CourseMember(
                    course_id=course_id,
                    user_id=UUID(student["id"]),
                    role=UserRole.STUDENT,
                ),
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=UUID(student["id"]),
                    knowledge_point_id=point_id,
                    score=20.0,
                ),
            ]
        )
        await session.commit()

    dashboard = await client.get(
        f"/api/v1/courses/{course_id}/dashboard",
        headers=auth_headers(teacher),
    )
    overview = await client.get(
        "/api/v1/dashboard/overview",
        params={"courseId": str(course_id)},
        headers=auth_headers(teacher),
    )

    assert dashboard.status_code == 200
    assert dashboard.json()["average_mastery"] is None
    assert dashboard.json()["high_risk_knowledge_points"] == []
    assert overview.status_code == 200
    assert overview.json()["stats"]["attention_knowledge_point_count"] == 0
    assert overview.json()["chapter_mastery"] == []
    assert overview.json()["learning_difficulties"] == []


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
    overview_response = await client.get(
        "/api/v1/dashboard/overview",
        params={"courseId": course["id"]},
        headers=auth_headers(student),
    )

    assert response.status_code == 403
    assert overview_response.status_code == 403
