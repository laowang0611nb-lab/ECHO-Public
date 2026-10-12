from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from database.models.chat import Conversation, Message, MessageRole, MessageStatus
from database.models.course import CourseMember
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from database.models.user import UserRole
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings


async def login(
    client: AsyncClient,
    email: str,
    role: str,
    *,
    display_name: str | None = None,
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "display_name": display_name or email.split("@")[0],
            "role": role,
        },
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_course(
    client: AsyncClient,
    teacher: dict[str, str],
    name: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": name},
    )
    assert response.status_code == 201
    return response.json()


def enable_assistant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teacher_assistant_enabled", True)
    monkeypatch.setattr(settings, "chat_api_key", "test-chat-key")


async def create_learning_fixture(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    course_id: UUID,
    teacher_id: UUID,
    student_ids: list[UUID],
    point_name: str = "黑盒测试",
) -> tuple[UUID, UUID]:
    document_id = uuid4()
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                uploaded_by=teacher_id,
                original_name="teacher-assistant.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
            )
        )
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="第一章",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name=point_name,
                order_index=0,
            )
        )
        session.add_all(
            CourseMember(
                course_id=course_id,
                user_id=student_id,
                role=UserRole.STUDENT,
            )
            for student_id in student_ids
        )
        await session.commit()
    return chapter_id, point_id


async def create_ranked_learning_fixture(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    course_id: UUID,
    teacher_id: UUID,
    student_id: UUID,
    point_scores: list[tuple[str, float]],
) -> dict[str, UUID]:
    document_id = uuid4()
    chapter_id = uuid4()
    point_ids = {name: uuid4() for name, _ in point_scores}
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                uploaded_by=teacher_id,
                original_name="ranked-assistant.pdf",
                storage_key=f"tests/{document_id}.pdf",
                content_type="application/pdf",
                size_bytes=100,
                status=DocumentStatus.READY,
            )
        )
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="排名章节",
                order_index=0,
            )
        )
        session.add(
            CourseMember(
                course_id=course_id,
                user_id=student_id,
                role=UserRole.STUDENT,
            )
        )
        for order_index, (name, score) in enumerate(point_scores):
            point_id = point_ids[name]
            session.add(
                KnowledgePoint(
                    id=point_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name=name,
                    order_index=order_index,
                )
            )
            session.add(
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=point_id,
                    score=score,
                )
            )
        await session.commit()
    return point_ids


async def test_capabilities_are_course_teacher_only_and_client_session(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-teacher@example.com", "teacher")
    student = await login(client, "assistant-student@example.com", "student")
    course = await create_course(client, teacher, "AI Assistant Course")

    teacher_response = await client.get(
        f"/api/v1/courses/{course['id']}/assistant/capabilities",
        headers=auth_headers(teacher),
    )
    student_response = await client.get(
        f"/api/v1/courses/{course['id']}/assistant/capabilities",
        headers=auth_headers(student),
    )

    assert teacher_response.status_code == 200
    capabilities = teacher_response.json()
    assert capabilities["enabled"] is True
    assert capabilities["read_only"] is True
    assert capabilities["streaming"] is True
    assert capabilities["memory_mode"] == "client_session"
    assert capabilities["max_message_chars"] == 4000
    assert "conversations" not in capabilities
    assert student_response.status_code == 403


async def test_disabled_assistant_returns_stable_error(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "assistant-disabled@example.com", "teacher")
    course = await create_course(client, teacher, "Disabled Assistant Course")
    monkeypatch.setattr(settings, "teacher_assistant_enabled", False)
    monkeypatch.setattr(settings, "chat_api_key", "test-chat-key")

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "这门课最近一周学习情况怎么样？",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "ASSISTANT_DISABLED"


async def test_navigation_query_returns_whitelisted_action_without_provider_call(
    client: AsyncClient,
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-navigation@example.com", "teacher")
    course = await create_course(client, teacher, "Navigation Course")
    chat_provider.structured_answer = "unused"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "怎么打开 AI 审核？",
            "page_context": {"page": "unknown"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "AI 回答审核" in payload["content"]
    assert payload["suggested_actions"][0]["target"]["type"] == "ai_review"
    assert payload["suggested_actions"][0]["target"]["course_id"] == course["id"]
    assert chat_provider.last_complete_messages == []


async def test_course_question_summary_uses_real_course_messages(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-summary@example.com", "teacher")
    student = await login(client, "assistant-summary-student@example.com", "student")
    course = await create_course(client, teacher, "Summary Course")
    await create_learning_fixture(
        session_factory,
        course_id=UUID(str(course["id"])),
        teacher_id=UUID(str(teacher["id"])),
        student_ids=[UUID(str(student["id"]))],
    )
    now = datetime.now(UTC)
    conversation_id = uuid4()
    async with session_factory() as session:
        session.add(
            Conversation(
                id=conversation_id,
                course_id=UUID(str(course["id"])),
                user_id=UUID(str(student["id"])),
                title="测试会话",
            )
        )
        session.add(
            Message(
                conversation_id=conversation_id,
                role=MessageRole.USER,
                status=MessageStatus.COMPLETE,
                content="黑盒测试和边界值分析有什么区别？",
                blocks=[],
                created_at=now,
            )
        )
        await session.commit()
    chat_provider.structured_answer = "最近学生主要在问黑盒测试与边界值分析的区别。"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "最近学生主要在问什么？",
            "page_context": {"page": "student_analytics", "time_range_days": 7},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["insufficient_evidence"] is False
    assert any(
        action["target"]["type"] == "student_conversation"
        for action in payload["suggested_actions"]
    )
    last_messages = chat_provider.last_complete_messages
    assert "黑盒测试和边界值分析有什么区别" in str(last_messages)


async def test_student_follow_up_uses_history_and_rechecks_course_data(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-student@example.com", "teacher")
    student = await login(
        client,
        "assistant-zhangsan@example.com",
        "student",
        display_name="张三",
    )
    course = await create_course(client, teacher, "Student Analysis Course")
    _, point_id = await create_learning_fixture(
        session_factory,
        course_id=UUID(str(course["id"])),
        teacher_id=UUID(str(teacher["id"])),
        student_ids=[UUID(str(student["id"]))],
    )
    now = datetime.now(UTC)
    async with session_factory() as session:
        session.add(
            StudentKnowledgeState(
                course_id=UUID(str(course["id"])),
                user_id=UUID(str(student["id"])),
                knowledge_point_id=point_id,
                score=42.0,
            )
        )
        session.add_all(
            [
                MasterySnapshot(
                    course_id=UUID(str(course["id"])),
                    user_id=UUID(str(student["id"])),
                    knowledge_point_id=point_id,
                    score=70.0,
                    created_at=now - timedelta(days=3),
                ),
                MasterySnapshot(
                    course_id=UUID(str(course["id"])),
                    user_id=UUID(str(student["id"])),
                    knowledge_point_id=point_id,
                    score=42.0,
                    created_at=now,
                ),
                LearningEvent(
                    course_id=UUID(str(course["id"])),
                    user_id=UUID(str(student["id"])),
                    knowledge_point_id=point_id,
                    event_type=LearningEventType.REPEATED_ERROR,
                    weight=1.0,
                    evidence="连续两次混淆边界值取值。",
                    metadata_json={"error_code": "boundary_missing"},
                    created_at=now - timedelta(days=1),
                ),
            ]
        )
        await session.commit()
    chat_provider.structured_answer = "张三可能需要在黑盒测试的边界值部分继续巩固。"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "他最薄弱的是哪里？",
            "history": [
                {"role": "user", "content": "张三最近为什么下降？"},
                {"role": "assistant", "content": "需要重新查看课程证据。"},
            ],
            "page_context": {"page": "student_analytics", "time_range_days": 7},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["insufficient_evidence"] is False
    assert any(
        action["target"]["type"] == "student_detail"
        and action["target"]["student_id"] == student["id"]
        for action in payload["suggested_actions"]
    )
    assert "黑盒测试" in str(chat_provider.last_complete_messages)


async def test_stream_emits_ordered_events_and_done_message(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-stream@example.com", "teacher")
    student = await login(client, "assistant-stream-student@example.com", "student")
    course = await create_course(client, teacher, "Stream Course")
    await create_learning_fixture(
        session_factory,
        course_id=UUID(str(course["id"])),
        teacher_id=UUID(str(teacher["id"])),
        student_ids=[UUID(str(student["id"]))],
    )
    chat_provider.answer = "课程最近一周有学习记录。"

    async with client.stream(
        "POST",
        f"/api/v1/courses/{course['id']}/assistant/messages/stream",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "这门课这周学习情况怎么样？",
        },
    ) as response:
        body = (await response.aread()).decode("utf-8")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert body.index("event: message_start") < body.index("event: status")
    assert "event: text_delta" in body
    assert "event: done" in body
    assert "课程最近一周有学习记录" in body


async def test_cross_course_page_context_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-context-teacher@example.com", "teacher")
    other_teacher = await login(client, "assistant-context-other@example.com", "teacher")
    student = await login(client, "assistant-context-student@example.com", "student")
    course = await create_course(client, teacher, "Context Course")
    other_course = await create_course(client, other_teacher, "Other Context Course")
    async with session_factory() as session:
        session.add(
            CourseMember(
                course_id=UUID(str(other_course["id"])),
                user_id=UUID(str(student["id"])),
                role=UserRole.STUDENT,
            )
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "他最近怎么样？",
            "page_context": {
                "page": "student_detail",
                "student_id": student["id"],
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ASSISTANT_CONTEXT_INVALID"


async def test_global_worst_knowledge_question_uses_overview_and_ignores_history_entities(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-worst@example.com", "teacher")
    student = await login(client, "assistant-worst-student@example.com", "student")
    course = await create_course(client, teacher, "Worst Knowledge Course")
    await create_ranked_learning_fixture(
        session_factory,
        course_id=UUID(str(course["id"])),
        teacher_id=UUID(str(teacher["id"])),
        student_id=UUID(str(student["id"])),
        point_scores=[
            ("技术债务", 82.0),
            ("条件覆盖", 58.0),
            ("路径覆盖", 36.0),
        ],
    )
    chat_provider.structured_answer = "当前最薄弱的是路径覆盖。"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "现在最最差的知识点是哪个？",
            "history": [
                {
                    "role": "user",
                    "content": "技术债务、条件覆盖、路径覆盖分别怎么样？",
                },
                {"role": "assistant", "content": "需要结合课程证据分析。"},
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert "匹配到多个知识点" not in response.json()["content"]
    provider_messages = str(chat_provider.last_complete_messages)
    assert "路径覆盖" in provider_messages
    assert "36.00" in provider_messages


async def test_greeting_does_not_inherit_knowledge_entities_from_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enable_assistant(monkeypatch)
    teacher = await login(client, "assistant-greeting@example.com", "teacher")
    student = await login(client, "assistant-greeting-student@example.com", "student")
    course = await create_course(client, teacher, "Greeting Course")
    await create_ranked_learning_fixture(
        session_factory,
        course_id=UUID(str(course["id"])),
        teacher_id=UUID(str(teacher["id"])),
        student_id=UUID(str(student["id"])),
        point_scores=[("技术债务", 82.0), ("条件覆盖", 58.0)],
    )
    chat_provider.structured_answer = "你好，我可以帮你查看课程学情。"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/assistant/messages",
        headers=auth_headers(teacher),
        json={
            "client_message_id": str(uuid4()),
            "content": "hi",
            "history": [
                {
                    "role": "user",
                    "content": "技术债务、条件覆盖分别怎么样？",
                },
                {"role": "assistant", "content": "需要更多证据。"},
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert "匹配到多个知识点" not in response.json()["content"]
    assert "路径覆盖" not in str(chat_provider.last_complete_messages)
