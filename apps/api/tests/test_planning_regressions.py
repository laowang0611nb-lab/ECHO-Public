import json
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.planning import plan_task_target_students
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from test_planning import (
    auth_headers,
    create_course_with_students,
    create_structure,
    login,
    strategy_draft,
    strategy_payload,
    weekly_draft,
)

from app.services.teaching_strategy import _load_generation_points


async def _accepted_strategy(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
    teacher: dict[str, str],
    student_ids: list[str],
) -> tuple[dict[str, object], UUID, list[UUID], dict[str, object]]:
    course = await create_course_with_students(
        client,
        teacher,
        [{"id": student_id} for student_id in student_ids],
    )
    course_id = UUID(str(course["id"]))
    _, point_ids = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    chat_provider.answer = json.dumps(strategy_draft(), ensure_ascii=False)
    generated = await client.post(
        f"/api/v1/courses/{course_id}/teaching-strategies/generate",
        headers=auth_headers(teacher),
        json=strategy_payload(point_ids, [UUID(value) for value in student_ids]),
    )
    assert generated.status_code == 201
    strategy = generated.json()
    accepted = await client.post(
        f"/api/v1/teaching-strategies/{strategy['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "accept"},
    )
    assert accepted.status_code == 200
    return course, course_id, point_ids, strategy


async def _create_plan(
    client: AsyncClient,
    teacher: dict[str, str],
    course_id: UUID,
    strategy_id: str,
    point_id: UUID,
    *,
    target_scope: str = "whole_class",
    target_student_ids: list[str] | None = None,
    publish: bool = False,
) -> dict[str, object]:
    start = date.today()
    end = start + timedelta(days=14)
    response = await client.post(
        f"/api/v1/courses/{course_id}/execution-plans",
        headers=auth_headers(teacher),
        json={
            "strategy_id": strategy_id,
            "title": "回归计划",
            "description": "回归验证",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "target_scope": target_scope,
            "target_student_ids": target_student_ids or [],
            "knowledge_point_ids": [str(point_id)],
            "actions": ["quick_check"],
            "resource_ids": [],
            "plan_parameters": {},
            "evaluation_metrics": ["mastery_change"],
            "teacher_note": "",
            "publish": publish,
        },
    )
    assert response.status_code == 201
    return response.json()


async def _generate_tasks(
    client: AsyncClient,
    chat_provider,
    teacher: dict[str, str],
    plan: dict[str, object],
    point_id: UUID,
) -> str:
    start = date.fromisoformat(str(plan["start_date"]))
    end = date.fromisoformat(str(plan["end_date"]))
    chat_provider.answer = json.dumps(
        weekly_draft(start, end, point_id),
        ensure_ascii=False,
    )
    response = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/generate-weekly-plan",
        headers=auth_headers(teacher),
        json={"teacher_note": "", "regenerate": False},
    )
    assert response.status_code == 200
    return response.json()["weeks"][0]["tasks"][0]["id"]


async def test_strategy_auto_points_exclude_soft_deleted_document(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "strategy-soft-delete@example.com", "teacher")
    student = await login(client, "strategy-soft-delete-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    _, point_ids = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    async with session_factory() as session:
        document = await session.scalar(
            select(Document)
            .join(Chapter, Chapter.document_id == Document.id)
            .join(KnowledgePoint, KnowledgePoint.chapter_id == Chapter.id)
            .where(KnowledgePoint.id == point_ids[0])
        )
        assert document is not None
        document.trashed_at = datetime.now(UTC)
        await session.commit()
        points = await _load_generation_points(session, course_id, [])
    assert points == []


async def test_published_plan_without_tasks_can_initialize_and_completed_task_is_readonly(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "published-empty-plan@example.com", "teacher")
    student = await login(client, "published-empty-plan-student@example.com", "student")
    _, course_id, point_ids, strategy = await _accepted_strategy(
        client,
        session_factory,
        chat_provider,
        teacher,
        [student["id"]],
    )
    plan = await _create_plan(
        client,
        teacher,
        course_id,
        strategy["id"],
        point_ids[0],
        publish=True,
    )
    assert plan["status"] == "active"
    assert plan["tasks"] == []

    task_id = await _generate_tasks(client, chat_provider, teacher, plan, point_ids[0])
    task_list = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/tasks",
        headers=auth_headers(teacher),
    )
    assert task_list.status_code == 200
    assert task_list.json()["total"] == 1

    completed = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "complete"},
    )
    assert completed.status_code == 200
    immutable = await client.patch(
        f"/api/v1/plan-tasks/{task_id}",
        headers=auth_headers(teacher),
        json={"status": "not_started"},
    )
    assert immutable.status_code == 409


async def test_grouped_task_rejects_empty_targets_and_cross_student_events(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "group-target@example.com", "teacher")
    student_a = await login(client, "group-target-a@example.com", "student")
    student_b = await login(client, "group-target-b@example.com", "student")
    _, course_id, point_ids, strategy = await _accepted_strategy(
        client,
        session_factory,
        chat_provider,
        teacher,
        [student_a["id"], student_b["id"]],
    )
    plan = await _create_plan(
        client,
        teacher,
        course_id,
        strategy["id"],
        point_ids[0],
        target_scope="custom_students",
        target_student_ids=[student_a["id"]],
    )
    task_id = await _generate_tasks(client, chat_provider, teacher, plan, point_ids[0])

    invalid = await client.patch(
        f"/api/v1/plan-tasks/{task_id}",
        headers=auth_headers(teacher),
        json={"target_student_ids": []},
    )
    assert invalid.status_code == 409

    async with session_factory() as session:
        await session.execute(
            delete(plan_task_target_students).where(
                plan_task_target_students.c.task_id == UUID(task_id)
            )
        )
        await session.commit()
    event = await client.post(
        f"/api/v1/courses/{course_id}/learning-events",
        headers=auth_headers(teacher),
        json={
            "student_id": student_b["id"],
            "knowledge_point_id": str(point_ids[0]),
            "plan_id": plan["id"],
            "task_id": task_id,
            "event_type": "quiz_correct",
        },
    )
    assert event.status_code == 409


async def test_strategy_status_is_derived_from_all_linked_plans(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "multi-plan-strategy@example.com", "teacher")
    student = await login(client, "multi-plan-strategy-student@example.com", "student")
    _, course_id, point_ids, strategy = await _accepted_strategy(
        client,
        session_factory,
        chat_provider,
        teacher,
        [student["id"]],
    )
    plans = [
        await _create_plan(
            client,
            teacher,
            course_id,
            strategy["id"],
            point_ids[0],
        )
        for _ in range(2)
    ]
    for plan in plans:
        await _generate_tasks(client, chat_provider, teacher, plan, point_ids[0])
        published = await client.post(
            f"/api/v1/execution-plans/{plan['id']}/actions",
            headers=auth_headers(teacher),
            json={"action": "publish"},
        )
        assert published.status_code == 200

    first_pause = await client.post(
        f"/api/v1/execution-plans/{plans[0]['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "pause"},
    )
    assert first_pause.status_code == 200
    strategy_after_pause = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(teacher),
    )
    assert strategy_after_pause.json()["status"] == "active"

    first_complete = await client.post(
        f"/api/v1/execution-plans/{plans[0]['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "complete"},
    )
    assert first_complete.status_code == 200
    strategy_after_complete = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(teacher),
    )
    assert strategy_after_complete.json()["status"] == "active"

    second_pause = await client.post(
        f"/api/v1/execution-plans/{plans[1]['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "pause"},
    )
    assert second_pause.status_code == 200
    paused_strategy = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(teacher),
    )
    assert paused_strategy.json()["status"] == "paused"

    second_complete = await client.post(
        f"/api/v1/execution-plans/{plans[1]['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "complete"},
    )
    assert second_complete.status_code == 200
    completed_strategy = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(teacher),
    )
    assert completed_strategy.json()["status"] == "completed"
