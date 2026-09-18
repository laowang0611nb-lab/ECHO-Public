from uuid import UUID, uuid4

import pytest
from database.models.chat import Message
from database.models.document import Document, DocumentStatus
from database.models.knowledge import KnowledgeChunk
from database.models.review import (
    AIReviewFlag,
    ReviewGenerationStatus,
    ReviewHistoryAction,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
)
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.schemas.review import ReviewRegenerationRequest
from app.services.review import _detect_review_reasons
from app.services.review_workflow import (
    ReviewRegenerationConflictError,
    complete_review_regeneration,
    start_review_regeneration,
)


@pytest.mark.parametrize(
    "question",
    [
        "什么是黑盒测试",
        "白盒测试怎么做",
        "解释一下软件测试",
        "什么是边界值分析",
        "总结第三章",
        "列出第三章的要点",
        "描述一下黑盒测试",
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
    [
        "你好",
        "你好吗？",
        "在吗？",
        "有人吗？",
        "谢谢",
        "你是谁",
        "你是谁？",
        "你能做什么？",
        "hello",
    ],
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


async def create_review_flag(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    student: dict[str, str],
    *,
    question: str = "What is not covered by the course?",
) -> tuple[dict[str, str], dict[str, object]]:
    course = await create_course_without_sources(client, teacher)
    await add_unrelated_course_material(session_factory, teacher, course)
    await enroll_student(client, teacher, student, course)
    conversation = await create_conversation(client, course["id"], student)
    stream = await client.post(
        f"/api/v1/conversations/{conversation['id']}/messages/stream",
        headers=auth_headers(student),
        json={"content": question, "retrieval_limit": 5},
    )
    assert stream.status_code == 200
    flags = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags",
        headers=auth_headers(teacher),
    )
    assert flags.status_code == 200
    assert flags.json()
    return course, flags.json()[0]


def assert_completed_regeneration(body: dict[str, object]) -> None:
    assert body["status"] == ReviewGenerationStatus.COMPLETED
    assert body["version"] == 2
    assert body["answer"] == "Regenerated answer [1]"
    assert body["error"] is None


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


async def test_regeneration_creates_version_pending_rereview_and_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "regen-teacher@example.com", "teacher")
    student = await login(client, "regen-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    original_answer = flag["answer"]
    chat_provider.answer = "Regenerated answer [1]"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regenerate",
        headers=auth_headers(teacher),
        json={"instruction": "Make it more concise", "base_version": 1},
    )

    assert response.status_code == 200
    assert_completed_regeneration(response.json())

    dashboard = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )
    assert dashboard.status_code == 200
    assert dashboard.json()["pending_review_count"] == 1

    detail = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}",
        headers=auth_headers(teacher),
    )
    body = detail.json()
    assert detail.status_code == 200
    assert body["answer"] == original_answer
    assert body["status"] == ReviewStatus.PENDING_REREVIEW
    assert body["current_version"] == 2
    assert [version["version"] for version in body["versions"]] == [1, 2]
    assert body["versions"][0]["source"] == "original"
    assert body["versions"][1]["source"] == "regenerated"
    assert body["versions"][1]["answer"] == "Regenerated answer [1]"
    async with session_factory() as session:
        persisted_message = await session.get(Message, UUID(flag["message_id"]))
    assert persisted_message is not None
    assert persisted_message.content == original_answer
    assert [entry["action"] for entry in body["review_history"]] == [
        ReviewHistoryAction.REGENERATE,
        ReviewHistoryAction.REGENERATE,
    ]
    assert body["review_history"][0]["from_status"] == ReviewStatus.OPEN
    assert body["review_history"][1]["to_status"] == ReviewStatus.PENDING_REREVIEW

    versions = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/versions",
        headers=auth_headers(teacher),
    )
    history = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/history",
        headers=auth_headers(teacher),
    )
    assert versions.status_code == 200
    assert len(versions.json()) == 2
    assert history.status_code == 200
    assert len(history.json()) == 2
    regeneration_status = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regeneration",
        headers=auth_headers(teacher),
    )
    assert regeneration_status.status_code == 200
    assert regeneration_status.json()["status"] == "completed"
    assert regeneration_status.json()["progress"] == 100
    assert regeneration_status.json()["answer"] == "Regenerated answer [1]"


async def test_regeneration_failure_can_retry_without_version_gap(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "retry-teacher@example.com", "teacher")
    student = await login(client, "retry-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    endpoint = f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regenerate"

    chat_provider.fail = True
    failed = await client.post(
        endpoint,
        headers=auth_headers(teacher),
        json={"instruction": "Try again"},
    )
    assert failed.status_code == 200
    assert failed.json()["status"] == ReviewGenerationStatus.FAILED
    assert failed.json()["version"] == 2
    assert failed.json()["error"]

    failed_detail = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}",
        headers=auth_headers(teacher),
    )
    assert failed_detail.json()["status"] == ReviewStatus.REGENERATION_FAILED
    assert len(failed_detail.json()["versions"]) == 1
    failed_status = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regeneration",
        headers=auth_headers(teacher),
    )
    assert failed_status.json()["status"] == "failed"
    assert failed_status.json()["error"]

    chat_provider.fail = False
    chat_provider.answer = "Retried answer [1]"
    retry = await client.post(
        endpoint,
        headers=auth_headers(teacher),
        json={"instruction": "Try again"},
    )
    assert retry.status_code == 200
    assert retry.json()["status"] == ReviewGenerationStatus.COMPLETED
    retry_detail = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/versions",
        headers=auth_headers(teacher),
    )
    assert [version["version"] for version in retry_detail.json()] == [1, 2]
    assert retry_detail.json()[1]["answer"] == "Retried answer [1]"


async def test_generation_service_transitions_and_conflict(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    embedding_provider,
) -> None:
    teacher = await login(client, "state-teacher@example.com", "teacher")
    student = await login(client, "state-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    flag_id = UUID(flag["id"])
    course_id = UUID(course["id"])
    teacher_id = UUID(teacher["id"])
    async with session_factory() as session:
        flag_obj = await session.get(AIReviewFlag, flag_id)
        assert flag_obj is not None
        _, run = await start_review_regeneration(
            session,
            course_id,
            flag_id,
            teacher_id,
            ReviewRegenerationRequest(instruction="State transition"),
        )
        assert flag_obj.status == ReviewStatus.GENERATING
        assert run.status == ReviewGenerationStatus.GENERATING
        run_id = run.id
        with pytest.raises(ReviewRegenerationConflictError):
            await start_review_regeneration(
                session,
                course_id,
                flag_id,
                teacher_id,
                ReviewRegenerationRequest(instruction="Concurrent request"),
            )
        await session.rollback()
        chat_provider.answer = "Transition answer [1]"
        _, completed = await complete_review_regeneration(
            session,
            course_id,
            flag_id,
            run_id,
            embedding_provider=embedding_provider,
            chat_provider=chat_provider,
        )
        assert completed.status == ReviewGenerationStatus.COMPLETED
        await session.refresh(flag_obj)
        assert flag_obj.status == ReviewStatus.PENDING_REREVIEW


async def test_teacher_version_and_history_are_traceable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "version-teacher@example.com", "teacher")
    student = await login(client, "version-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    chat_provider.answer = "Regenerated before teacher edit [1]"
    await client.post(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regenerate",
        headers=auth_headers(teacher),
        json={"instruction": "Tighten the explanation"},
    )
    decision = await client.post(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/review",
        headers=auth_headers(teacher),
        json={"decision": "mark_incorrect", "corrected_answer": "Teacher answer"},
    )
    assert decision.status_code == 200
    detail = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}",
        headers=auth_headers(teacher),
    )
    body = detail.json()
    assert [version["source"] for version in body["versions"]] == [
        "original",
        "regenerated",
        "teacher",
    ]
    assert body["versions"][2]["answer"] == "Teacher answer"
    assert body["review_history"][-1]["action"] == ReviewHistoryAction.MARK_INCORRECT
    assert body["review_history"][-1]["corrected_answer_snapshot"] == "Teacher answer"


async def test_review_query_summary_context_and_permission(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "query-teacher@example.com", "teacher")
    student = await login(client, "query-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    query = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/query",
        headers=auth_headers(teacher),
        params={"reason": ReviewReason.MISSING_COURSE_BASIS.value, "limit": 1},
    )
    searched = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/query",
        headers=auth_headers(teacher),
        params={"q": "not covered", "limit": 1},
    )
    summary = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/summary",
        headers=auth_headers(teacher),
    )
    context = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/context",
        headers=auth_headers(teacher),
    )
    denied = await client.post(
        f"/api/v1/courses/{course['id']}/review-flags/{flag['id']}/regenerate",
        headers=auth_headers(student),
        json={"instruction": "No permission"},
    )
    assert query.status_code == 200
    assert set(query.json()) == {"items", "total", "nextCursor", "summary"}
    assert query.json()["total"] == 1
    assert searched.status_code == 200
    assert searched.json()["total"] == 1
    assert searched.json()["items"][0]["question"] == "What is not covered by the course?"
    assert summary.status_code == 200
    assert summary.json()["pending"] == 1
    assert context.status_code == 200
    assert context.json()["messageId"] == flag["message_id"]
    assert denied.status_code == 403


async def test_review_query_paginates_with_cursor(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "page-teacher@example.com", "teacher")
    student = await login(client, "page-student@example.com", "student")
    course, flag = await create_review_flag(
        client,
        session_factory,
        teacher,
        student,
    )
    async with session_factory() as session:
        session.add(
            AIReviewFlag(
                course_id=UUID(course["id"]),
                conversation_id=UUID(flag["conversation_id"]),
                message_id=UUID(flag["message_id"]),
                student_id=UUID(flag["student_id"]),
                reason=ReviewReason.OUTSIDE_MATERIAL_HEAVY,
                severity=ReviewSeverity.HIGH,
                status=ReviewStatus.OPEN,
                details={},
            )
        )
        await session.commit()

    first_page = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/query",
        headers=auth_headers(teacher),
        params={"limit": 1, "sort": "oldest"},
    )
    assert first_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert len(first_page.json()["items"]) == 1
    assert first_page.json()["nextCursor"]

    second_page = await client.get(
        f"/api/v1/courses/{course['id']}/review-flags/query",
        headers=auth_headers(teacher),
        params={
            "limit": 1,
            "sort": "oldest",
            "cursor": first_page.json()["nextCursor"],
        },
    )
    assert second_page.status_code == 200
    assert len(second_page.json()["items"]) == 1
    assert second_page.json()["nextCursor"] is None


def test_review_regeneration_openapi_paths() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    prefix = "/api/v1/courses/{course_id}/review-flags/{flag_id}"
    assert prefix + "/regenerate" in paths
    assert prefix + "/regeneration" in paths
    assert prefix + "/versions" in paths
    assert prefix + "/history" in paths
    assert prefix + "/context" in paths
