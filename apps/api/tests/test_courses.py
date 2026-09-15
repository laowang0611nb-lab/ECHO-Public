from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.course import CourseMember
from app.models.user import UserRole


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


async def test_student_cannot_create_course(client: AsyncClient) -> None:
    student = await login(client, "student@example.com", "student")

    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(student),
        json={"name": "Software Engineering", "description": "Course", "term": "2026 Fall"},
    )

    assert response.status_code == 403


async def test_teacher_creates_course_and_becomes_member(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "teacher@example.com", "teacher")

    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Software Engineering", "description": "Course", "term": "2026 Fall"},
    )

    assert response.status_code == 201
    course = response.json()
    assert course["name"] == "Software Engineering"
    assert course["created_by"] == teacher["id"]

    async with session_factory() as session:
        membership = await session.scalar(
            select(CourseMember).where(
                CourseMember.course_id == UUID(course["id"]),
                CourseMember.user_id == UUID(teacher["id"]),
            )
        )

    assert membership is not None
    assert membership.role == UserRole.TEACHER


async def test_course_codes_are_non_empty_and_unique(client: AsyncClient) -> None:
    teacher = await login(client, "codes@example.com", "teacher")

    first = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Course One"},
    )
    second = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Course Two"},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert len(first.json()["code"]) == 8
    assert len(second.json()["code"]) == 8
    assert first.json()["code"] != second.json()["code"]


async def test_course_list_is_isolated_by_membership(client: AsyncClient) -> None:
    teacher_a = await login(client, "teacher-a@example.com", "teacher")
    teacher_b = await login(client, "teacher-b@example.com", "teacher")

    course_a = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher_a),
        json={"name": "Teacher A Course"},
    )
    await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher_b),
        json={"name": "Teacher B Course"},
    )

    response = await client.get("/api/v1/courses", headers=auth_headers(teacher_a))

    assert response.status_code == 200
    assert [course["id"] for course in response.json()] == [course_a.json()["id"]]


async def test_course_member_can_view_course(client: AsyncClient) -> None:
    teacher = await login(client, "viewer@example.com", "teacher")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Visible Course"},
    )

    response = await client.get(
        f"/api/v1/courses/{created.json()['id']}",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    assert response.json()["id"] == created.json()["id"]


async def test_non_member_cannot_view_course(client: AsyncClient) -> None:
    owner = await login(client, "owner@example.com", "teacher")
    outsider = await login(client, "outsider@example.com", "teacher")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(owner),
        json={"name": "Private Course"},
    )

    response = await client.get(
        f"/api/v1/courses/{created.json()['id']}",
        headers=auth_headers(outsider),
    )

    assert response.status_code == 403


async def test_unknown_course_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "missing@example.com", "teacher")

    response = await client.get(
        f"/api/v1/courses/{uuid4()}",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 404


async def test_student_joins_course_by_code_and_duplicate_is_idempotent(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "join-teacher@example.com", "teacher")
    student = await login(client, "join-student@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Join Course"},
    )
    await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(teacher),
    )
    code = created.json()["code"]

    first = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": code.lower()},
    )
    second = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": code},
    )
    courses = await client.get("/api/v1/courses", headers=auth_headers(student))

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == created.json()["id"]
    assert [course["id"] for course in courses.json()] == [created.json()["id"]]


async def test_teacher_cannot_join_course_by_code(client: AsyncClient) -> None:
    owner = await login(client, "join-owner@example.com", "teacher")
    other_teacher = await login(client, "join-other@example.com", "teacher")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(owner),
        json={"name": "Teacher Join Course"},
    )

    response = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(other_teacher),
        json={"code": created.json()["code"]},
    )

    assert response.status_code == 403


async def test_join_with_unknown_code_returns_404(client: AsyncClient) -> None:
    student = await login(client, "missing-code@example.com", "student")

    response = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": "ZZZZZZZZ"},
    )

    assert response.status_code == 404


async def test_course_members_can_list_members_and_outsiders_cannot(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "members-teacher@example.com", "teacher")
    student = await login(client, "members-student@example.com", "student")
    outsider = await login(client, "members-outsider@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Members Course"},
    )
    await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(teacher),
    )
    await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": created.json()["code"]},
    )

    member_response = await client.get(
        f"/api/v1/courses/{created.json()['id']}/members",
        headers=auth_headers(teacher),
    )
    outsider_response = await client.get(
        f"/api/v1/courses/{created.json()['id']}/members",
        headers=auth_headers(outsider),
    )

    assert member_response.status_code == 200
    assert {member["email"] for member in member_response.json()} == {
        "members-teacher@example.com",
        "members-student@example.com",
    }
    assert outsider_response.status_code == 403


async def test_teacher_can_publish_course_idempotently(client: AsyncClient) -> None:
    teacher = await login(client, "publish-teacher@example.com", "teacher")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Publish Course"},
    )

    first = await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(teacher),
    )
    second = await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(teacher),
    )

    assert first.status_code == 200
    assert first.json()["status"] == "published"
    assert second.status_code == 200
    assert second.json()["status"] == "published"


async def test_student_cannot_publish_course(client: AsyncClient) -> None:
    teacher = await login(client, "publish-owner@example.com", "teacher")
    student = await login(client, "publish-student@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Student Publish Course"},
    )

    response = await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(student),
    )

    assert response.status_code == 403


async def test_student_cannot_join_unpublished_course(client: AsyncClient) -> None:
    teacher = await login(client, "draft-owner@example.com", "teacher")
    student = await login(client, "draft-student@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Draft Course"},
    )

    response = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": created.json()["code"]},
    )

    assert response.status_code == 409


async def test_student_member_cannot_list_emails(client: AsyncClient) -> None:
    teacher = await login(client, "privacy-teacher@example.com", "teacher")
    student = await login(client, "privacy-student@example.com", "student")
    created = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Privacy Course"},
    )
    await client.post(
        f"/api/v1/courses/{created.json()['id']}/publish",
        headers=auth_headers(teacher),
    )
    await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": created.json()["code"]},
    )

    response = await client.get(
        f"/api/v1/courses/{created.json()['id']}/members",
        headers=auth_headers(student),
    )

    assert response.status_code == 403
