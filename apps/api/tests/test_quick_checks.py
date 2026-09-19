from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from database.models.chat import Conversation, Message, MessageRole
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services import quick_checks
from app.services.quick_checks import (
    QuickCheckNotFoundError,
    resolve_knowledge_point_id,
)


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_published_course(
    client: AsyncClient,
    teacher: dict[str, str],
    student: dict[str, str],
) -> dict[str, str]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Quick Check Course"},
    )
    assert course_response.status_code == 201
    course = course_response.json()
    publish = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    assert publish.status_code == 200
    join = await client.post(
        "/api/v1/courses/join",
        headers=auth_headers(student),
        json={"code": publish.json()["code"]},
    )
    assert join.status_code == 200
    return course


async def create_question(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    teacher: dict[str, str],
    course: dict[str, str],
    *,
    answer: str = "a",
) -> tuple[dict[str, object], UUID]:
    course_id = UUID(course["id"])
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                uploaded_by=UUID(teacher["id"]),
                original_name="quick-check.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
                page_count=1,
            )
        )
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="Quick Check Chapter",
                order_index=0,
            )
        )
        await session.flush()
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="Quick Check Point",
                order_index=0,
            )
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/courses/{course['id']}/question-items",
        headers=auth_headers(teacher),
        json={
            "knowledge_point_ids": [str(point_id)],
            "type": "single_choice",
            "difficulty": "medium",
            "title": "测试题",
            "content": "以下哪项是正确选项？",
            "answer": answer,
            "explanation": "选项 A 符合课程定义。",
            "metadata_json": {
                "options": [
                    {"id": "a", "label": "正确选项"},
                    {"id": "b", "label": "错误选项"},
                ],
                "correct_option_id": answer,
                "hint_levels": ["先比较两个选项的定义。", "回到课程材料确认关键词。"],
                "max_attempts": 2,
            },
        },
    )
    assert response.status_code == 201
    return response.json(), point_id


async def create_assistant_message(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    user_id: UUID,
    course_id: UUID,
    question_id: UUID,
) -> UUID:
    conversation_id = uuid4()
    message_id = uuid4()
    async with session_factory() as session:
        session.add(
            Conversation(
                id=conversation_id,
                course_id=course_id,
                user_id=user_id,
            )
        )
        await session.flush()
        session.add(
            Message(
                id=message_id,
                conversation_id=conversation_id,
                role=MessageRole.ASSISTANT,
                content="测试回答",
                status="complete",
                blocks=[
                    {
                        "type": "quick_check",
                        "question_id": str(question_id),
                        "title": "测试题",
                        "prompt": "以下哪项是正确选项？",
                        "options": [
                            {"id": "a", "label": "正确选项"},
                            {"id": "b", "label": "错误选项"},
                        ],
                        "status": "unanswered",
                        "selected_option_id": None,
                        "attempts_remaining": 2,
                        "correct": None,
                        "explanation": None,
                        "hint": None,
                    }
                ],
            )
        )
        await session.commit()
    return message_id


async def test_quick_check_attempt_is_idempotent_and_updates_mastery(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "quick-check-teacher@example.com", "teacher")
    student = await login(client, "quick-check-student@example.com", "student")
    course = await create_published_course(client, teacher, student)
    question, point_id = await create_question(client, session_factory, teacher, course)
    message_id = await create_assistant_message(
        session_factory,
        user_id=UUID(student["id"]),
        course_id=UUID(course["id"]),
        question_id=UUID(str(question["id"])),
    )

    first = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "attempt-wrong-1",
            "selected_option_id": "b",
            "message_id": str(message_id),
            "question_id": question["id"],
        },
    )
    duplicate = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "attempt-wrong-1",
            "selected_option_id": "b",
            "message_id": str(message_id),
            "question_id": question["id"],
        },
    )
    second = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "attempt-correct-2",
            "selected_option_id": "a",
            "message_id": str(message_id),
            "question_id": question["id"],
        },
    )
    third = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "attempt-locked-3",
            "selected_option_id": "a",
            "message_id": str(message_id),
            "question_id": question["id"],
        },
    )

    assert first.status_code == 200
    assert first.json()["correct"] is False
    assert first.json()["locked"] is False
    assert first.json()["hint"]
    assert duplicate.json() == first.json()
    assert second.status_code == 200
    assert second.json()["correct"] is True
    assert second.json()["mastery_update"]["after"] > second.json()["mastery_update"]["before"]
    assert third.status_code == 409

    async with session_factory() as session:
        events = list(await session.scalars(select(LearningEvent)))
        attempts = list(await session.scalars(select(QuickCheckAttempt)))
        state = await session.scalar(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.user_id == UUID(student["id"]),
                StudentKnowledgeState.knowledge_point_id == point_id,
            )
        )
        message = await session.get(Message, message_id)
    assert [event.event_type for event in events] == [
        LearningEventType.QUIZ_WRONG,
        LearningEventType.QUIZ_CORRECT,
    ]
    assert len(attempts) == 2
    assert state is not None
    assert state.score == 52.0
    assert message is not None
    stored_quick_check = next(
        block for block in message.blocks if block.get("type") == "quick_check"
    )
    assert stored_quick_check["status"] == "correct"
    assert any(block.get("type") == "mastery_update" for block in message.blocks)

    detail = await client.get(
        f"/api/v1/courses/{course['id']}/students/{student['id']}/learning",
        headers=auth_headers(teacher),
    )
    dashboard = await client.get(
        f"/api/v1/courses/{course['id']}/dashboard",
        headers=auth_headers(teacher),
    )
    assert detail.status_code == 200
    assert {"quiz_wrong", "quiz_correct"} <= {
        event["event_type"] for event in detail.json()["recent_evidence"]
    }
    assert dashboard.status_code == 200
    assert dashboard.json()["total_learning_events"] == 2


async def test_hint_request_preserves_mastery(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "hint-teacher@example.com", "teacher")
    student = await login(client, "hint-student@example.com", "student")
    course = await create_published_course(client, teacher, student)
    question, point_id = await create_question(client, session_factory, teacher, course)
    message_id = await create_assistant_message(
        session_factory,
        user_id=UUID(student["id"]),
        course_id=UUID(course["id"]),
        question_id=UUID(str(question["id"])),
    )

    first = await client.post(
        f"/api/v1/messages/{message_id}/hints",
        headers=auth_headers(student),
        json={},
    )
    second = await client.post(
        f"/api/v1/messages/{message_id}/hints",
        headers=auth_headers(student),
        json={},
    )

    assert first.status_code == 200
    assert first.json()["hint"]["level"] == 1
    assert second.status_code == 200
    assert second.json()["hint"]["level"] == 2
    async with session_factory() as session:
        events = list(await session.scalars(select(LearningEvent)))
        state = await session.scalar(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.user_id == UUID(student["id"]),
                StudentKnowledgeState.knowledge_point_id == point_id,
            )
        )
    assert [event.event_type for event in events] == [
        LearningEventType.HINT_REQUESTED,
        LearningEventType.HINT_REQUESTED,
    ]
    assert state is not None
    assert state.score == 50.0


async def test_quick_check_rejects_student_from_another_course(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "isolation-teacher@example.com", "teacher")
    student = await login(client, "isolation-student@example.com", "student")
    await create_published_course(client, teacher, student)
    other_course = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Other Course"},
    )
    question, _ = await create_question(
        client,
        session_factory,
        teacher,
        other_course.json(),
    )

    response = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "attempt-cross-course",
            "selected_option_id": "a",
            "question_id": question["id"],
        },
    )

    assert response.status_code == 403


async def test_quick_check_attempt_limit_is_scoped_to_conversation(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "attempt-scope-teacher@example.com", "teacher")
    student = await login(client, "attempt-scope-student@example.com", "student")
    course = await create_published_course(client, teacher, student)
    question, _ = await create_question(client, session_factory, teacher, course)
    first_message = await create_assistant_message(
        session_factory,
        user_id=UUID(student["id"]),
        course_id=UUID(course["id"]),
        question_id=UUID(str(question["id"])),
    )
    second_message = await create_assistant_message(
        session_factory,
        user_id=UUID(student["id"]),
        course_id=UUID(course["id"]),
        question_id=UUID(str(question["id"])),
    )

    first_attempt = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "conversation-one-attempt",
            "selected_option_id": "b",
            "message_id": str(first_message),
        },
    )
    second_attempt = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json={
            "attempt_id": "conversation-two-attempt",
            "selected_option_id": "a",
            "message_id": str(second_message),
        },
    )

    assert first_attempt.status_code == 200
    assert first_attempt.json()["correct"] is False
    assert second_attempt.status_code == 200
    assert second_attempt.json()["correct"] is True


async def test_quick_check_transaction_rolls_back_attempt_and_allows_retry(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "atomic-quick-check@example.com", "teacher")
    student = await login(client, "atomic-quick-check-student@example.com", "student")
    course = await create_published_course(client, teacher, student)
    question, _ = await create_question(client, session_factory, teacher, course)
    original_recorder = quick_checks.record_learning_event

    async def fail_recording(*_: object, **__: object) -> object:
        raise RuntimeError("simulated event failure")

    monkeypatch.setattr(quick_checks, "record_learning_event", fail_recording)
    payload = {
        "attempt_id": "atomic-attempt",
        "selected_option_id": "a",
        "question_id": question["id"],
    }
    failed = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json=payload,
    )
    assert failed.status_code == 409
    async with session_factory() as session:
        assert await session.scalar(select(QuickCheckAttempt)) is None

    monkeypatch.setattr(quick_checks, "record_learning_event", original_recorder)
    retry = await client.post(
        f"/api/v1/quick-checks/{question['id']}/attempts",
        headers=auth_headers(student),
        json=payload,
    )
    assert retry.status_code == 200
    assert retry.json()["correct"] is True


async def test_explicit_quick_check_point_rejects_soft_deleted_document(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "deleted-point@example.com", "teacher")
    student = await login(client, "deleted-point-student@example.com", "student")
    course = await create_published_course(client, teacher, student)
    _, point_id = await create_question(client, session_factory, teacher, course)
    async with session_factory() as session:
        document = await session.scalar(
            select(Document)
            .join(Chapter, Chapter.document_id == Document.id)
            .join(KnowledgePoint, KnowledgePoint.chapter_id == Chapter.id)
            .where(KnowledgePoint.id == point_id)
        )
        assert document is not None
        document.trashed_at = datetime.now(UTC)
        await session.commit()

    async with session_factory() as session:
        with pytest.raises(QuickCheckNotFoundError):
            await resolve_knowledge_point_id(
                session,
                UUID(course["id"]),
                [],
                point_id,
            )
