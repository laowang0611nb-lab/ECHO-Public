from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest_asyncio
from database.models.announcement import CourseAnnouncement
from database.models.chat import Conversation, Message, MessageRole
from database.models.course import Course, CourseMember, CourseStatus
from database.models.document import Document, DocumentStatus, ResourceType
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from database.models.planning import (
    ExecutionPlan,
    ExecutionPlanStatus,
    PlanTargetScope,
    PlanTask,
    PlanTaskStatus,
    PlanTaskType,
    TeachingStrategy,
    TeachingStrategyPriority,
    TeachingStrategySource,
    TeachingStrategyStatus,
    TeachingStrategyType,
)
from database.models.resource import (
    ExternalResource,
    ExternalResourceStatus,
    QuestionDifficulty,
    QuestionItem,
    QuestionType,
)
from database.models.user import User, UserRole
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.student_resources import list_student_plan_tasks

STUDENT_PHONE = "13800138000"


@pytest_asyncio.fixture
async def gap_seed(
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, str]:
    async with session_factory() as session:
        teacher = User(
            email="gap-teacher@example.com",
            display_name="Gap Teacher",
            role=UserRole.TEACHER,
        )
        student = User(
            email="gap-student@example.com",
            phone=STUDENT_PHONE,
            display_name="Gap Student",
            role=UserRole.STUDENT,
        )
        other = User(
            email="gap-other@example.com",
            display_name="Other Student",
            role=UserRole.STUDENT,
        )
        session.add_all([teacher, student, other])
        await session.flush()
        course = Course(
            name="Gap Course",
            description="Backend gap fixture",
            status=CourseStatus.PUBLISHED,
            code="GAP00001",
            created_by=teacher.id,
        )
        session.add(course)
        await session.flush()
        session.add_all(
            [
                CourseMember(course_id=course.id, user_id=teacher.id, role=UserRole.TEACHER),
                CourseMember(course_id=course.id, user_id=student.id, role=UserRole.STUDENT),
                CourseMember(course_id=course.id, user_id=other.id, role=UserRole.STUDENT),
            ]
        )
        document = Document(
            course_id=course.id,
            uploaded_by=teacher.id,
            original_name="gap.pdf",
            display_name="Gap Textbook",
            storage_key="gap/gap.pdf",
            content_type="application/pdf",
            size_bytes=100,
            status=DocumentStatus.READY,
            page_count=3,
            resource_type=ResourceType.TEXTBOOK,
            summary="Gap resource",
        )
        session.add(document)
        await session.flush()
        chapter = Chapter(
            course_id=course.id,
            document_id=document.id,
            title="Gap Chapter",
            order_index=0,
        )
        session.add(chapter)
        await session.flush()
        point = KnowledgePoint(
            course_id=course.id,
            chapter_id=chapter.id,
            name="Gap Knowledge Point",
            description="A point used by the gap regression fixture.",
            order_index=0,
        )
        session.add(point)
        await session.flush()
        chunk = KnowledgeChunk(
            course_id=course.id,
            document_id=document.id,
            chapter_id=chapter.id,
            chunk_index=0,
            page_start=1,
            page_end=2,
            content="Gap source evidence for the knowledge point.",
            char_count=48,
        )
        question = QuestionItem(
            course_id=course.id,
            type=QuestionType.SINGLE_CHOICE,
            difficulty=QuestionDifficulty.MEDIUM,
            title="Gap Question",
            content="Which answer is correct?",
            answer="a",
            explanation="Option A matches the source.",
            metadata_json={
                "options": [
                    {"id": "a", "label": "Correct"},
                    {"id": "b", "label": "Wrong"},
                ],
                "correct_option_id": "a",
                "max_attempts": 2,
            },
            created_by=teacher.id,
        )
        question.knowledge_points = [point]
        session.add_all([chunk, question])
        await session.flush()
        conversation = Conversation(
            course_id=course.id,
            user_id=student.id,
            title="Gap conversation",
        )
        session.add(conversation)
        await session.flush()
        message = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content="Gap answer",
            blocks=[],
        )
        session.add(message)
        await session.flush()
        event = LearningEvent(
            course_id=course.id,
            user_id=student.id,
            knowledge_point_id=point.id,
            conversation_id=conversation.id,
            message_id=message.id,
            event_type=LearningEventType.QUIZ_WRONG,
            weight=1.0,
            evidence="Selected B",
            metadata_json={"question_item_id": str(question.id)},
        )
        session.add(event)
        await session.flush()
        session.add_all(
            [
                StudentKnowledgeState(
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=point.id,
                    score=44.0,
                ),
                MasterySnapshot(
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=point.id,
                    source_event_id=event.id,
                    score=44.0,
                ),
                QuickCheckAttempt(
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=point.id,
                    question_item_id=question.id,
                    conversation_id=conversation.id,
                    message_id=message.id,
                    attempt_id="gap-attempt-1",
                    selected_option_id="b",
                    correct=False,
                    response_json={},
                ),
                ExternalResource(
                    course_id=course.id,
                    title="Gap Link",
                    url="https://example.com/gap",
                    description="External reference",
                    check_status=ExternalResourceStatus.VALID,
                    created_by=teacher.id,
                ),
            ]
        )
        strategy = TeachingStrategy(
            course_id=course.id,
            title="Gap Strategy",
            description="Gap strategy",
            type=TeachingStrategyType.CONTENT_ADJUSTMENT,
            priority=TeachingStrategyPriority.HIGH,
            status=TeachingStrategyStatus.ACTIVE,
            source=TeachingStrategySource.TEACHER_CREATED,
            created_by=teacher.id,
            updated_by=teacher.id,
        )
        session.add(strategy)
        await session.flush()
        plan = ExecutionPlan(
            course_id=course.id,
            strategy_id=strategy.id,
            title="Gap Plan",
            description="Gap plan",
            status=ExecutionPlanStatus.ACTIVE,
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=7),
            target_scope=PlanTargetScope.WHOLE_CLASS,
            created_by=teacher.id,
            updated_by=teacher.id,
        )
        session.add(plan)
        await session.flush()
        task = PlanTask(
            plan_id=plan.id,
            week_number=1,
            order_index=0,
            title="Gap Task",
            description="Complete the gap task",
            type=PlanTaskType.QUICK_CHECK,
            status=PlanTaskStatus.NOT_STARTED,
            due_at=datetime.now(UTC) + timedelta(days=1),
            created_by=teacher.id,
        )
        task.knowledge_points = [point]
        session.add(task)
        await session.commit()
        return {
            "teacher_id": str(teacher.id),
            "student_id": str(student.id),
            "other_student_id": str(other.id),
            "course_id": str(course.id),
            "knowledge_point_id": str(point.id),
            "question_id": str(question.id),
            "task_id": str(task.id),
        }


async def test_student_learning_events_support_filter_and_cursor(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    response = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/learning-events",
        params={"eventType": "quiz_wrong", "limit": 1},
        headers={"X-User-Id": gap_seed["student_id"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["knowledge_point_name"] == "Gap Knowledge Point"
    assert body["items"][0]["mastery_after"] == 44.0
    assert body["items"][0]["mastery_before"] == 50.0


async def test_student_progress_uses_server_side_completion_rule(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    response = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/progress",
        headers={"X-User-Id": gap_seed["student_id"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_knowledge_point_id"] == gap_seed["knowledge_point_id"]
    assert body["chapters"][0]["status"] == "in_progress"
    assert body["chapters"][0]["progress_percent"] == 100
    assert body["chapters"][0]["mastered_knowledge_point_count"] == 0


async def test_wrong_questions_return_real_attempt_evidence(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    response = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/wrong-questions",
        headers={"X-User-Id": gap_seed["student_id"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["wrong_count"] == 1
    assert body["items"][0]["review_status"] == "unresolved"

    detail = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/wrong-questions/{gap_seed['question_id']}",
        headers={"X-User-Id": gap_seed["student_id"]},
    )
    assert detail.status_code == 200
    assert detail.json()["correct_option_id"] == "a"
    assert detail.json()["selected_option_id"] == "b"


async def test_knowledge_point_quick_checks_and_sources_are_student_readable(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    quick_checks = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/knowledge-points/{gap_seed['knowledge_point_id']}/quick-checks",
        headers={"X-User-Id": gap_seed["student_id"]},
    )
    assert quick_checks.status_code == 200
    assert quick_checks.json()["items"][0]["question_id"] == gap_seed["question_id"]

    sources = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/knowledge-points/{gap_seed['knowledge_point_id']}/sources",
        headers={"X-User-Id": gap_seed["student_id"]},
    )
    assert sources.status_code == 200
    assert sources.json()["items"][0]["quote"].startswith("Gap source")


async def test_student_resources_teachers_tasks_and_conversations(
    client: AsyncClient,
    gap_seed: dict[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        direct = await list_student_plan_tasks(
            session,
            UUID(gap_seed["course_id"]),
            UUID(gap_seed["student_id"]),
            UUID(gap_seed["student_id"]),
        )
        assert direct.items[0].title == "Gap Task"
    headers = {"X-User-Id": gap_seed["student_id"]}
    resources = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/student-resources",
        headers=headers,
    )
    assert resources.status_code == 200
    assert {item["resource_type"] for item in resources.json()["items"]} == {
        "textbook",
        "external_link",
    }

    teachers = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/teachers",
        headers=headers,
    )
    assert teachers.status_code == 200
    assert teachers.json()["teachers"][0]["display_name"] == "Gap Teacher"

    tasks = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/plan-tasks",
        headers=headers,
    )
    assert tasks.status_code == 200
    assert tasks.json()["items"][0]["title"] == "Gap Task"

    conversations = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/knowledge-points/{gap_seed['knowledge_point_id']}/conversations",
        headers=headers,
    )
    assert conversations.status_code == 200
    assert conversations.json()["items"][0]["title"] == "Gap conversation"


async def test_student_gap_reads_reject_other_students(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    response = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/learning-events",
        headers={"X-User-Id": gap_seed["other_student_id"]},
    )

    assert response.status_code == 403


async def test_course_announcements_support_publish_list_and_read(
    client: AsyncClient,
    gap_seed: dict[str, str],
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher_headers = {"X-User-Id": gap_seed["teacher_id"]}
    student_headers = {"X-User-Id": gap_seed["student_id"]}
    created = await client.post(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements",
        json={"title": "Gap Notice", "content": "Read the material.", "publish": True},
        headers=teacher_headers,
    )
    assert created.status_code == 201
    announcement_id = created.json()["id"]

    listed = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements",
        headers=student_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["is_read"] is False

    read = await client.post(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements/{announcement_id}/read",
        headers=student_headers,
    )
    assert read.status_code == 200

    listed_again = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements",
        headers=student_headers,
    )
    assert listed_again.json()["items"][0]["is_read"] is True

    draft = await client.post(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements",
        json={"title": "Draft Notice", "content": "Not published.", "publish": False},
        headers=teacher_headers,
    )
    assert draft.status_code == 201
    student_drafts = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/announcements?includeDrafts=true",
        headers=student_headers,
    )
    assert all(item["title"] != "Draft Notice" for item in student_drafts.json()["items"])

    async with session_factory() as session:
        assert await session.get(CourseAnnouncement, UUID(announcement_id)) is not None


async def test_misconception_evidence_requires_enough_events(
    client: AsyncClient,
    gap_seed: dict[str, str],
) -> None:
    response = await client.get(
        f"/api/v1/courses/{gap_seed['course_id']}/students/{gap_seed['student_id']}/knowledge-points/{gap_seed['knowledge_point_id']}/misconceptions",
        headers={"X-User-Id": gap_seed["student_id"]},
    )

    assert response.status_code == 200
    assert response.json()["insufficient_evidence"] is True
    assert response.json()["occurrence_count"] == 1
