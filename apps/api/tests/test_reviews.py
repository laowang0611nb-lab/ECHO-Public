from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.document import Document, DocumentStatus
from app.models.knowledge import KnowledgeChunk
from app.models.review import ReviewReason, ReviewStatus
from app.services.review import _detect_review_reasons


@pytest.mark.parametrize(
    "question",
    [
        "什么是黑盒测试",
        "白盒测试怎么做",
        "解释一下软件测试",
        "什么是边界值分析",
        "总结第三章",
        "Give an example of black-box testing",
        "你好，请解释一下黑盒测试",
    ],
)
def test_short_chinese_questions_require_course_basis(question: str) -> None:
    reasons = _detect_review_reasons(
        question,
        [],
        "答案",
        used_source_count=0,
        has_course_material=True,
    )
    assert ReviewReason.MISSING_COURSE_BASIS in {reason for reason, _, _ in reasons}


@pytest.mark.parametrize(
    "question",
    ["你好", "谢谢", "你是谁", "你是谁？", "你能做什么？", "hello"],
)
def test_trivial_messages_do_not_require_course_basis(question: str) -> None:
    reasons = _detect_review_reasons(
        question,
        [],
        "答案",
        used_source_count=0,
        has_course_material=True,
    )
    assert reasons == []


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_course_without_sources(
    client: AsyncClient,
    teacher: dict[str, str],
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Review Course"},
    )
    assert course_response.status_code == 201
    return course_response.json()


async def create_conversation(
    client: AsyncClient,
    course_id: str,
    user: dict[str, str],
) -> dict[str, str]:
    response = await client.post(
        f"/api/v1/courses/{course_id}/conversations",
        headers=auth_headers(user),
        json={"title": "Review conversation"},
    )
    assert response.status_code == 201
    return response.json()


async def enroll_student(
    client: AsyncClient,
    teacher: dict[str, str],
    student: dict[str, str],
    course: dict[str, str],
) -> None:
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    assert published.status_code == 200
    joined = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": published.json()["code"]},
    )
    assert joined.status_code == 200


async def add_unrelated_course_material(
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    course: dict[str, str],
) -> None:
    document_id = uuid4()
    embedding = [0.0] * 1024
    embedding[0] = 1.0
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=UUID(course["id"]),
                uploaded_by=UUID(teacher["id"]),
                original_name="review-material.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
                page_count=1,
            )
        )
        session.add(
            KnowledgeChunk(
                course_id=UUID(course["id"]),
                document_id=document_id,
                chunk_index=0,
                page_start=1,
                page_end=1,
                content="Alpha-only course material.",
                char_count=29,
                embedding=embedding,
            )
        )
        await session.commit()


async def test_chat_creates_missing_basis_flag_and_teacher_reviews_it(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "review-teacher@example.com", "teacher")
    student = await login(client, "review-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)
    await add_unrelated_course_material(session_factory, teacher, course)
    await enroll_student(client, teacher, student, course)
    conversation = await create_conversation(client, course["id"], student)

    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": "What is not covered by the course?", "retrieval_limit": 5},
    )
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )
    dashboard = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert flags.status_code == 200
    assert len(flags.json()) == 1
    flag = flags.json()[0]
    assert flag["reason"] == ReviewReason.MISSING_COURSE_BASIS
    assert flag["status"] == ReviewStatus.OPEN
    assert flag["question"] == "What is not covered by the course?"
    assert dashboard.json()["pending_review_count"] == 1

    reviewed = await client.post(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/review",
        headers=auth_headers(teacher),
        json={
            "decision": "mark_incorrect",
            "note": "No course material was available.",
            "corrected_answer": "Ask the teacher to upload the material first.",
        },
    )
    reviewed_dashboard = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )

    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == ReviewStatus.MARKED_INCORRECT
    assert reviewed.json()["reviewed_by"] == teacher["id"]
    assert reviewed.json()["corrected_answer"].startswith("Ask the teacher")
    assert reviewed_dashboard.json()["pending_review_count"] == 0


async def test_chat_without_course_material_does_not_create_missing_basis_flag(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "review-empty@example.com", "teacher")
    student = await login(client, "review-empty-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)
    await enroll_student(client, teacher, student, course)
    conversation = await create_conversation(client, course["id"], student)

    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": "Explain the central concept in detail.", "retrieval_limit": 5},
    )
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert flags.json() == []


async def test_repeated_follow_up_creates_review_flag(client: AsyncClient) -> None:
    teacher = await login(client, "review-repeat@example.com", "teacher")
    student = await login(client, "review-repeat-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)
    await enroll_student(client, teacher, student, course)
    conversation = await create_conversation(client, course["id"], student)
    endpoint = f"/api/v1/conversations/{conversation['id']}/messages/stream"

    first = await client.post(
        endpoint,
        headers=auth_headers(student),
        json={"content": "Explain the main concept.", "retrieval_limit": 5},
    )
    second = await client.post(
        endpoint,
        headers=auth_headers(student),
        json={"content": "Explain the main concept.", "retrieval_limit": 5},
    )
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    reasons = {flag["reason"] for flag in flags.json()}
    assert reasons == {ReviewReason.REPEATED_FOLLOW_UP}


async def test_student_can_report_not_resolved_and_reopen_flag(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "review-owner@example.com", "teacher")
    student = await login(client, "review-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": published.json()["code"]},
    )
    conversation = await create_conversation(client, course["id"], student)
    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": "Please explain this topic.", "retrieval_limit": 5},
    )
    messages = await client.get(
        f"/api/v1/conversations/{conversation['id']}/messages",
        headers=auth_headers(student),
    )
    assert stream.status_code == 200
    assistant_message_id = UUID(
        next(
            message["id"] for message in reversed(messages.json()) if message["role"] == "assistant"
        )
    )

    reported = await client.post(
        f"/api/v1/courses/{course['id']}/messages/{assistant_message_id}/not-resolved",
        headers=auth_headers(student),
        json={"note": "The explanation did not solve my question."},
    )
    teacher_flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )

    assert reported.status_code == 200
    assert reported.json()["reason"] == ReviewReason.STUDENT_NOT_RESOLVED
    assert reported.json()["severity"] == "high"
    assert reported.json()["status"] == ReviewStatus.OPEN
    assert any(flag["reason"] == ReviewReason.STUDENT_NOT_RESOLVED for flag in teacher_flags.json())


async def test_teacher_chat_does_not_create_review_flags(client: AsyncClient) -> None:
    teacher = await login(client, "review-teacher-chat@example.com", "teacher")
    course = await create_course_without_sources(client, teacher)
    conversation = await create_conversation(client, course["id"], teacher)

    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(teacher),
        json={"content": "Teacher test question", "retrieval_limit": 5},
    )
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert flags.json() == []


async def test_trivial_student_message_does_not_create_review_flag(client: AsyncClient) -> None:
    teacher = await login(client, "review-trivial@example.com", "teacher")
    student = await login(client, "review-trivial-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)
    await enroll_student(client, teacher, student, course)
    conversation = await create_conversation(client, course["id"], student)

    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": "你好", "retrieval_limit": 5},
    )
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )

    assert stream.status_code == 200
    assert flags.json() == []


async def test_review_endpoints_are_teacher_only(client: AsyncClient) -> None:
    teacher = await login(client, "review-permission@example.com", "teacher")
    student = await login(client, "review-permission-student@example.com", "student")
    course = await create_course_without_sources(client, teacher)

    response = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(student),
    )

    assert response.status_code == 403
