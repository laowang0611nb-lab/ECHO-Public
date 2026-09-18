import json
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from uuid import UUID, uuid4

from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import MasterySnapshot
from httpx import AsyncClient
from pypdf import PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def make_pdf(page_count: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=612, height=792)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def create_course_with_students(
    client: AsyncClient,
    teacher: dict[str, str],
    students: list[dict[str, str]],
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Planning Course"},
    )
    assert response.status_code == 201
    course = response.json()
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish",
        headers=auth_headers(teacher),
    )
    assert published.status_code == 200
    for student in students:
        joined = await client.post(
            "/api/v1/courses/join",
            headers=auth_headers(student),
            json={"code": published.json()["code"]},
        )
        assert joined.status_code == 200
    return course


async def create_structure(
    session_factory: async_sessionmaker[AsyncSession],
    course_id: UUID,
    teacher_id: UUID,
) -> tuple[UUID, list[UUID]]:
    document_id = uuid4()
    chapter_id = uuid4()
    point_ids = [uuid4(), uuid4()]
    async with session_factory() as session:
        session.add(
            Document(
                id=document_id,
                course_id=course_id,
                uploaded_by=teacher_id,
                original_name="planning.pdf",
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
                title="Planning Chapter",
                order_index=0,
            )
        )
        session.add_all(
            [
                KnowledgePoint(
                    id=point_ids[0],
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Planning Point A",
                    order_index=0,
                ),
                KnowledgePoint(
                    id=point_ids[1],
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Planning Point B",
                    order_index=1,
                ),
            ]
        )
        await session.commit()
    return chapter_id, point_ids


def strategy_payload(point_ids: list[UUID], student_ids: list[UUID]) -> dict[str, object]:
    return {
        "knowledgePointIds": [str(value) for value in point_ids],
        "studentIds": [str(value) for value in student_ids],
        "insightIds": ["demo-insight"],
        "timeRangeDays": 28,
    }


def strategy_draft() -> dict[str, object]:
    return {
        "title": "针对性补强计划",
        "description": "针对薄弱知识点安排练习与课堂检查。",
        "type": "differentiated_instruction",
        "priority": "high",
        "goals": ["提升薄弱知识点掌握度"],
        "teaching_methods": [{"name": "分层练习", "weight": 0.6}],
        "teaching_flow": [{"order": 1, "title": "课前诊断", "description": "先完成快速检查。"}],
        "personalization_rules": ["按掌握度分层"],
        "ai_rules": ["引用真实课程证据"],
        "expected_effect": {
            "summary": "预计提升目标知识点平均掌握度",
            "impact": 0.12,
            "metrics": [],
        },
    }


def weekly_draft(plan_start: date, plan_end: date, point_id: UUID) -> dict[str, object]:
    week_end = min(plan_start + timedelta(days=6), plan_end)
    return {
        "weeks": [
            {
                "week_number": 1,
                "start_date": plan_start.isoformat(),
                "end_date": week_end.isoformat(),
                "content": "先完成诊断和针对性练习。",
                "knowledge_point_ids": [str(point_id)],
                "resource_ids": [],
                "tasks": [
                    {
                        "title": "诊断小测",
                        "description": "完成一次快速检查。",
                        "type": "quick_check",
                        "due_at": None,
                        "knowledge_point_ids": [str(point_id)],
                        "resource_ids": [],
                        "target_student_ids": [],
                    }
                ],
            }
        ],
        "recommendations": [{"content": "关注低分学生的错误模式。"}],
    }


async def test_teaching_strategy_plan_task_events_and_effect(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "planning-teacher@example.com", "teacher")
    student_a = await login(client, "planning-student-a@example.com", "student")
    student_b = await login(client, "planning-student-b@example.com", "student")
    course = await create_course_with_students(
        client,
        teacher,
        [student_a, student_b],
    )
    course_id = UUID(course["id"])
    teacher_id = UUID(teacher["id"])
    student_ids = [UUID(student_a["id"]), UUID(student_b["id"])]
    _, point_ids = await create_structure(session_factory, course_id, teacher_id)

    chat_provider.answer = json.dumps(strategy_draft(), ensure_ascii=False)
    generated = await client.post(
        f"/api/v1/courses/{course_id}/teaching-strategies/generate",
        headers=auth_headers(teacher),
        json=strategy_payload(point_ids, student_ids),
    )
    assert generated.status_code == 201
    strategy = generated.json()
    assert strategy["status"] == "suggested"
    assert strategy["source"] == "ai_generated"
    assert strategy["version"] == 1

    patched_strategy = await client.patch(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(teacher),
        json={"title": "分层补强执行方案"},
    )
    assert patched_strategy.status_code == 200
    assert patched_strategy.json()["version"] == 2
    versions = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}/versions",
        headers=auth_headers(teacher),
    )
    assert [item["action"] for item in versions.json()] == ["generated", "updated"]

    accepted = await client.post(
        f"/api/v1/teaching-strategies/{strategy['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "accept"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    plan_start = date.today() - timedelta(days=10)
    plan_end = date.today() + timedelta(days=10)
    created_plan = await client.post(
        f"/api/v1/courses/{course_id}/execution-plans",
        headers=auth_headers(teacher),
        json={
            "strategy_id": strategy["id"],
            "title": "两周补强计划",
            "description": "围绕薄弱知识点执行两周计划。",
            "start_date": plan_start.isoformat(),
            "end_date": plan_end.isoformat(),
            "target_scope": "whole_class",
            "target_student_ids": [],
            "knowledge_point_ids": [str(point_ids[0])],
            "actions": ["quick_check", "supplementary_practice"],
            "resource_ids": [],
            "plan_parameters": {"weekly_sessions": 2},
            "evaluation_metrics": ["mastery_change"],
            "teacher_note": "先观察一周再调整。",
            "publish": False,
        },
    )
    assert created_plan.status_code == 201
    plan = created_plan.json()
    assert plan["status"] == "draft"
    assert plan["tasks"] == []
    early_effect = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/effect",
        headers=auth_headers(teacher),
    )
    assert early_effect.status_code == 200
    assert early_effect.json()["insufficient_evidence"] is True

    chat_provider.answer = json.dumps(
        weekly_draft(plan_start, plan_end, point_ids[0]),
        ensure_ascii=False,
    )
    weekly = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/generate-weekly-plan",
        headers=auth_headers(teacher),
        json={"teacher_note": "请保持任务可执行", "regenerate": False},
    )
    assert weekly.status_code == 200
    weekly_json = weekly.json()
    assert weekly_json["status"] == "draft"
    assert weekly_json["weeks"][0]["tasks"][0]["status"] == "not_started"
    task_id = weekly_json["weeks"][0]["tasks"][0]["id"]

    repeated = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/generate-weekly-plan",
        headers=auth_headers(teacher),
        json={"teacher_note": "", "regenerate": False},
    )
    assert repeated.status_code == 200
    assert repeated.json()["generation_id"] == weekly_json["generation_id"]

    task_patch = await client.patch(
        f"/api/v1/plan-tasks/{task_id}",
        headers=auth_headers(teacher),
        json={"status": "completed", "description": "教师确认已执行。"},
    )
    assert task_patch.status_code == 200
    assert task_patch.json()["status"] == "completed"

    task_list = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/tasks",
        headers=auth_headers(teacher),
    )
    assert task_list.status_code == 200
    assert task_list.json()["total"] == 1

    published = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "publish"},
    )
    assert published.status_code == 200
    assert published.json()["status"] == "active"

    event = await client.post(
        f"/api/v1/courses/{course_id}/learning-events",
        headers=auth_headers(teacher),
        json={
            "student_id": student_a["id"],
            "knowledge_point_id": str(point_ids[0]),
            "plan_id": plan["id"],
            "task_id": task_id,
            "event_type": "quiz_correct",
            "weight": 1.0,
            "evidence": "任务完成并答对。",
            "metadata_json": {"source": "plan_task"},
        },
    )
    assert event.status_code == 201
    event_json = event.json()
    assert event_json["plan_id"] == plan["id"]
    assert event_json["task_id"] == task_id
    assert event_json["result"] == "correct"

    events = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/learning-events",
        headers=auth_headers(teacher),
        params={"taskId": task_id},
    )
    assert events.status_code == 200
    assert events.json()["total"] == 1
    assert events.json()["items"][0]["student"]["id"] == student_a["id"]

    async with session_factory() as session:
        for student_id in student_ids:
            session.add_all(
                [
                    MasterySnapshot(
                        course_id=course_id,
                        user_id=student_id,
                        knowledge_point_id=point_ids[0],
                        score=45.0,
                        created_at=datetime.combine(
                            plan_start - timedelta(days=1),
                            datetime.min.time(),
                            tzinfo=UTC,
                        ),
                    ),
                    MasterySnapshot(
                        course_id=course_id,
                        user_id=student_id,
                        knowledge_point_id=point_ids[0],
                        score=61.0,
                        created_at=datetime.combine(
                            plan_start + timedelta(days=1),
                            datetime.min.time(),
                            tzinfo=UTC,
                        ),
                    ),
                ]
            )
        await session.commit()

    effect = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/effect",
        headers=auth_headers(teacher),
    )
    assert effect.status_code == 200
    effect_json = effect.json()
    assert effect_json["insufficient_evidence"] is False
    assert effect_json["metrics"][0]["metric"] == "mastery_change"
    assert effect_json["metrics"][0]["sample_size"] == 2
    assert effect_json["task_effectiveness"][0]["observed_change"] == 16.0
    assert effect_json["facts"]

    paused = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "pause"},
    )
    resumed = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "resume"},
    )
    completed = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/actions",
        headers=auth_headers(teacher),
        json={"action": "complete"},
    )
    assert paused.json()["status"] == "paused"
    assert resumed.json()["status"] == "active"
    assert completed.json()["status"] == "completed"

    final_events = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/learning-events",
        headers=auth_headers(teacher),
    )
    assert final_events.json()["total"] == 1
    strategy_effect = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}/effect",
        headers=auth_headers(teacher),
    )
    assert strategy_effect.status_code == 200
    assert strategy_effect.json()["strategy_id"] == strategy["id"]

    forbidden = await client.get(
        f"/api/v1/teaching-strategies/{strategy['id']}",
        headers=auth_headers(student_a),
    )
    assert forbidden.status_code == 403


async def test_weekly_generation_failure_keeps_existing_tasks(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "planning-failure@example.com", "teacher")
    student = await login(client, "planning-failure-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    teacher_id = UUID(teacher["id"])
    _, point_ids = await create_structure(session_factory, course_id, teacher_id)

    chat_provider.answer = json.dumps(strategy_draft(), ensure_ascii=False)
    generated = await client.post(
        f"/api/v1/courses/{course_id}/teaching-strategies/generate",
        headers=auth_headers(teacher),
        json=strategy_payload(point_ids, [UUID(student["id"])]),
    )
    strategy_id = generated.json()["id"]
    await client.post(
        f"/api/v1/teaching-strategies/{strategy_id}/actions",
        headers=auth_headers(teacher),
        json={"action": "accept"},
    )
    plan_start = date.today()
    plan_end = plan_start + timedelta(days=14)
    plan = (
        await client.post(
            f"/api/v1/courses/{course_id}/execution-plans",
            headers=auth_headers(teacher),
            json={
                "strategy_id": strategy_id,
                "title": "失败保留计划",
                "description": "验证生成失败不会清空已有任务。",
                "start_date": plan_start.isoformat(),
                "end_date": plan_end.isoformat(),
                "target_scope": "whole_class",
                "target_student_ids": [],
                "knowledge_point_ids": [str(point_ids[0])],
                "actions": ["quick_check"],
                "resource_ids": [],
                "plan_parameters": {},
                "evaluation_metrics": ["mastery_change"],
                "teacher_note": "",
                "publish": False,
            },
        )
    ).json()
    chat_provider.answer = json.dumps(
        weekly_draft(plan_start, plan_end, point_ids[0]),
        ensure_ascii=False,
    )
    first = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/generate-weekly-plan",
        headers=auth_headers(teacher),
        json={"teacher_note": "", "regenerate": False},
    )
    assert first.status_code == 200

    chat_provider.answer = "{invalid json"
    failed = await client.post(
        f"/api/v1/execution-plans/{plan['id']}/generate-weekly-plan",
        headers=auth_headers(teacher),
        json={"teacher_note": "重新生成", "regenerate": True},
    )
    assert failed.status_code == 502
    task_list = await client.get(
        f"/api/v1/execution-plans/{plan['id']}/tasks",
        headers=auth_headers(teacher),
    )
    assert task_list.status_code == 200
    assert task_list.json()["total"] == 1


def test_planning_openapi_paths() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/api/v1/courses/{course_id}/teaching-strategies" in paths
    assert "/api/v1/courses/{course_id}/teaching-strategies/generate" in paths
    assert "/api/v1/teaching-strategies/{strategy_id}" in paths
    assert "/api/v1/teaching-strategies/{strategy_id}/actions" in paths
    assert "/api/v1/teaching-strategies/{strategy_id}/versions" in paths
    assert "/api/v1/teaching-strategies/{strategy_id}/effect" in paths
    assert "/api/v1/courses/{course_id}/execution-plans" in paths
    assert "/api/v1/execution-plans/{plan_id}" in paths
    assert "/api/v1/execution-plans/{plan_id}/actions" in paths
    assert "/api/v1/execution-plans/{plan_id}/generate-weekly-plan" in paths
    assert "/api/v1/execution-plans/{plan_id}/tasks" in paths
    assert "/api/v1/execution-plans/{plan_id}/learning-events" in paths
    assert "/api/v1/execution-plans/{plan_id}/effect" in paths
