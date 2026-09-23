import asyncio
import json
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from database.models.analysis import (
    AIAnalysis,
    AIAnalysisScope,
    AIAnalysisStage,
    AIAnalysisStageEvent,
    AIAnalysisStatus,
    AIAnalysisType,
)
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType, MasterySnapshot
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.main import app
from app.services.analysis_tasks import _ACTIVE_TASKS


async def login(client: AsyncClient, email: str, role: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "display_name": email.split("@")[0], "role": role},
    )
    assert response.status_code == 200
    return response.json()


def auth_headers(user: dict[str, str]) -> dict[str, str]:
    return {"X-User-Id": user["id"]}


async def wait_for_analysis_progress(
    client: AsyncClient,
    teacher: dict[str, str],
    course_id: str,
    analysis_id: str,
    *,
    target_stage: AIAnalysisStage | None = None,
    timeout_seconds: float = 10.0,
) -> dict[str, object]:
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    latest: dict[str, object] = {}
    while asyncio.get_running_loop().time() < deadline:
        response = await client.get(
            f"/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/progress",
            headers=auth_headers(teacher),
        )
        assert response.status_code == 200, response.text
        latest = response.json()
        if target_stage is not None and latest.get("stage") == target_stage.value:
            return latest
        if target_stage is None and latest.get("status") in {"completed", "failed"}:
            task = _ACTIVE_TASKS.get(UUID(analysis_id))
            if task is not None:
                await task
            return latest
        await asyncio.sleep(0.01)
    raise AssertionError(f"analysis did not reach expected state: {latest}")


async def create_course_with_students(
    client: AsyncClient,
    teacher: dict[str, str],
    students: list[dict[str, str]],
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "AI Analysis Course"},
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
                original_name="analysis.pdf",
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
                title="Analysis Chapter",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="边界值分析",
                order_index=0,
            )
        )
        await session.commit()
    return chapter_id, point_id


async def add_learning_evidence(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    course_id: UUID,
    chapter_id: UUID,
    point_id: UUID,
    students: list[UUID],
) -> None:
    async with session_factory() as session:
        for index, student_id in enumerate(students):
            event = LearningEvent(
                course_id=course_id,
                user_id=student_id,
                knowledge_point_id=point_id,
                event_type=LearningEventType.QUIZ_WRONG
                if index == 0
                else LearningEventType.REPEATED_ERROR,
                weight=1.0,
                evidence="边界条件被遗漏",
                metadata_json={"source": "test"},
                created_at=datetime.now(UTC) - timedelta(days=index + 1),
            )
            session.add(event)
            session.add(
                MasterySnapshot(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=point_id,
                    score=42.0 + index * 10,
                    created_at=datetime.now(UTC) - timedelta(days=index + 1),
                )
            )
        session.add(
            KnowledgeChunk(
                course_id=course_id,
                document_id=(await session.get(Chapter, chapter_id)).document_id,
                chapter_id=chapter_id,
                chunk_index=0,
                page_start=1,
                page_end=1,
                content="边界值分析需要覆盖有效、无效和边界输入。",
                char_count=22,
                metadata_json={"source": "test"},
            )
        )
        await session.commit()


def evidence_aware_answer(messages: list[dict[str, str]], student_id: UUID) -> str:
    context = "\n".join(message["content"] for message in messages)
    evidence_ids = re.findall(r'"evidence_id"\s*:\s*"([^"]+)"', context)
    assert len(evidence_ids) >= 2
    return json.dumps(
        {
            "conclusion": "学生在边界值分析上存在连续错误，当前证据支持优先检查边界条件理解。",
            "root_cause": "错误事件与低掌握度快照共同指向边界条件理解不足。",
            "recommendation": "安排边界值辨析练习，并在下一次 Quick Check 中验证迁移。",
            "affected_student_ids": [str(student_id)],
            "facts": [
                {
                    "fact": "存在连续答题错误和较低掌握度证据。",
                    "evidence_ids": evidence_ids[:2],
                }
            ],
            "insufficient_evidence": False,
        },
        ensure_ascii=False,
    )


async def test_initial_analysis_collects_evidence_and_creates_traceable_strategy(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "analysis-teacher@example.com", "teacher")
    student_one = await login(client, "analysis-student-one@example.com", "student")
    student_two = await login(client, "analysis-student-two@example.com", "student")
    course = await create_course_with_students(client, teacher, [student_one, student_two])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student_one["id"]), UUID(student_two["id"])],
    )
    chat_provider.answer_builder = lambda messages: evidence_aware_answer(
        messages,
        UUID(student_one["id"]),
    )

    response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={
            "knowledge_point_id": str(point_id),
            "scope": "whole_class",
            "time_range_days": 28,
            "async": False,
        },
    )

    assert response.status_code == 200, response.text
    analysis = response.json()
    assert analysis["status"] == "completed"
    assert analysis["analysis_type"] == "initial"
    assert analysis["result"]["insufficient_evidence"] is False
    assert analysis["result"]["facts"]
    assert analysis["result"]["facts"][0]["evidence_ids"]
    assert len(analysis["evidence"]) >= 3
    assert {item["source_type"] for item in analysis["evidence"]} >= {
        "learning_event",
        "mastery_snapshot",
        "knowledge_chunk",
    }

    strategy_response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis['id']}/strategy",
        headers=auth_headers(teacher),
        json={"priority": "high"},
    )
    assert strategy_response.status_code == 201, strategy_response.text
    strategy = strategy_response.json()
    assert strategy["status"] == "suggested"
    assert strategy["target_knowledge_points"][0]["id"] == str(point_id)

    refreshed = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis['id']}",
        headers=auth_headers(teacher),
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["result"]["strategy_id"] == strategy["id"]

    repeated = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis['id']}/strategy",
        headers=auth_headers(teacher),
        json={"priority": "high"},
    )
    assert repeated.status_code in {200, 201}
    assert repeated.json()["id"] == strategy["id"]

    listed = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["evidence_count"] >= 3


async def test_reanalysis_links_previous_result_and_keeps_evidence_chain(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "reanalysis-teacher@example.com", "teacher")
    student = await login(client, "reanalysis-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student["id"])],
    )
    chat_provider.answer_builder = lambda messages: evidence_aware_answer(
        messages,
        UUID(student["id"]),
    )

    initial = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class", "async": False},
    )
    assert initial.status_code == 200
    initial_id = initial.json()["id"]

    reanalysis = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis/{initial_id}/reanalyze",
        headers=auth_headers(teacher),
        json={"focus": "进一步确认错误类型", "async": False},
    )

    assert reanalysis.status_code == 200, reanalysis.text
    body = reanalysis.json()
    assert body["analysis_type"] == "secondary"
    assert body["previous_analysis_id"] == initial_id
    assert any(item["source_type"] == "initial_analysis" for item in body["evidence"])


async def test_insufficient_evidence_does_not_call_model(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "insufficient-teacher@example.com", "teacher")
    student = await login(client, "insufficient-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    _, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    chat_provider.last_stream_messages = []

    response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class", "async": False},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "completed"
    assert body["result"]["insufficient_evidence"] is True
    assert body["result"]["facts"] == []
    assert chat_provider.last_stream_messages == []


async def test_analysis_is_teacher_only_and_failed_provider_is_persisted(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "provider-failure-teacher@example.com", "teacher")
    student = await login(client, "provider-failure-student@example.com", "student")
    other_teacher = await login(client, "provider-failure-other@example.com", "teacher")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student["id"])],
    )
    chat_provider.answer = "{invalid json"

    forbidden = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(other_teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class", "async": False},
    )
    assert forbidden.status_code == 403

    failure = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class", "async": False},
    )
    assert failure.status_code == 502

    listed = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["status"] == "failed"


async def test_async_analysis_reports_monotonic_stage_progress(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch,
    chat_provider,
) -> None:
    teacher = await login(client, "progress-teacher@example.com", "teacher")
    student = await login(client, "progress-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student["id"])],
    )
    chat_provider.answer_builder = lambda messages: evidence_aware_answer(
        messages,
        UUID(student["id"]),
    )
    monkeypatch.setattr(settings, "analysis_progress_heartbeat_seconds", 1)
    chat_provider.stream_gate = asyncio.Event()

    response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class"},
    )
    assert response.status_code == 202, response.text
    analysis = response.json()
    assert analysis["status"] == "analyzing"
    assert analysis["progress"]["stage"] == "collecting_previous_analysis"
    assert analysis["progress"]["percent"] == 10

    await asyncio.wait_for(chat_provider.stream_started.wait(), timeout=3.0)
    progress_response = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis['id']}/progress",
        headers=auth_headers(teacher),
    )
    assert progress_response.status_code == 200, progress_response.text
    generating = progress_response.json()
    assert generating["status"] == "analyzing"
    assert generating["percent"] == 90
    assert generating["stage_label"] == "生成教学建议"
    first_heartbeat = datetime.fromisoformat(str(generating["heartbeat_at"]))
    await asyncio.sleep(1.1)
    heartbeat_response = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis['id']}/progress",
        headers=auth_headers(teacher),
    )
    assert heartbeat_response.status_code == 200, heartbeat_response.text
    second_heartbeat = datetime.fromisoformat(str(heartbeat_response.json()["heartbeat_at"]))
    assert second_heartbeat > first_heartbeat

    chat_provider.stream_gate.set()
    await asyncio.wait_for(chat_provider.stream_finished.wait(), timeout=3.0)
    completed = await wait_for_analysis_progress(
        client,
        teacher,
        course["id"],
        analysis["id"],
    )
    assert completed["status"] == "completed", completed
    assert completed["percent"] == 100
    assert completed["completed_at"] is not None

    async with session_factory() as session:
        events = list(
            await session.scalars(
                select(AIAnalysisStageEvent)
                .where(AIAnalysisStageEvent.analysis_id == UUID(analysis["id"]))
                .order_by(AIAnalysisStageEvent.sequence)
            )
        )
    assert [event.stage for event in events] == [
        AIAnalysisStage.COLLECTING_PREVIOUS_ANALYSIS,
        AIAnalysisStage.QUERYING_EVIDENCE,
        AIAnalysisStage.EXPANDING_KNOWLEDGE_GRAPH,
        AIAnalysisStage.ANALYZING_STUDENT_IMPACT,
        AIAnalysisStage.GENERATING_RECOMMENDATION,
        AIAnalysisStage.GENERATING_RECOMMENDATION,
    ]
    assert [event.percent for event in events] == [10, 30, 50, 70, 90, 100]


async def test_async_analysis_client_request_id_is_idempotent(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "idempotent-teacher@example.com", "teacher")
    student = await login(client, "idempotent-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student["id"])],
    )
    chat_provider.answer_builder = lambda messages: evidence_aware_answer(
        messages,
        UUID(student["id"]),
    )
    chat_provider.stream_gate = asyncio.Event()
    payload = {
        "knowledge_point_id": str(point_id),
        "scope": "whole_class",
        "client_request_id": "analysis-idempotency-key",
    }

    responses = await asyncio.gather(
        client.post(
            f"/api/v1/courses/{course['id']}/ai-analysis",
            headers=auth_headers(teacher),
            json=payload,
        ),
        client.post(
            f"/api/v1/courses/{course['id']}/ai-analysis",
            headers=auth_headers(teacher),
            json=payload,
        ),
    )
    assert [response.status_code for response in responses] == [202, 202]
    analysis_ids = {response.json()["id"] for response in responses}
    assert len(analysis_ids) == 1

    chat_provider.stream_gate.set()
    await wait_for_analysis_progress(
        client,
        teacher,
        course["id"],
        analysis_ids.pop(),
    )
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(AIAnalysis)
            .where(
                AIAnalysis.course_id == course_id,
                AIAnalysis.client_request_id == "analysis-idempotency-key",
            )
        )
    assert count == 1


async def test_async_analysis_failure_keeps_last_stage(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "async-failure-teacher@example.com", "teacher")
    student = await login(client, "async-failure-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    course_id = UUID(course["id"])
    chapter_id, point_id = await create_structure(
        session_factory,
        course_id,
        UUID(teacher["id"]),
    )
    await add_learning_evidence(
        session_factory,
        course_id=course_id,
        chapter_id=chapter_id,
        point_id=point_id,
        students=[UUID(student["id"])],
    )
    chat_provider.answer = "{invalid json"

    response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class"},
    )
    assert response.status_code == 202, response.text
    analysis_id = response.json()["id"]
    failed = await wait_for_analysis_progress(
        client,
        teacher,
        course["id"],
        analysis_id,
    )
    assert failed["status"] == "failed"
    async with session_factory() as session:
        failed_record = await session.get(AIAnalysis, UUID(analysis_id))
        failed_events = list(
            await session.scalars(
                select(AIAnalysisStageEvent)
                .where(AIAnalysisStageEvent.analysis_id == UUID(analysis_id))
                .order_by(AIAnalysisStageEvent.sequence)
            )
        )
    assert failed["stage"] == "generating_recommendation", (
        failed,
        failed_record.stage if failed_record is not None else None,
        [(event.stage.value, event.percent) for event in failed_events],
    )
    assert failed["percent"] == 90
    assert failed["error_message"]

    detail = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis_id}",
        headers=auth_headers(teacher),
    )
    assert detail.status_code == 200
    assert detail.json()["progress"]["percent"] == 90


async def test_async_analysis_insufficient_evidence_completes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    chat_provider,
) -> None:
    teacher = await login(client, "async-insufficient-teacher@example.com", "teacher")
    student = await login(client, "async-insufficient-student@example.com", "student")
    course = await create_course_with_students(client, teacher, [student])
    _, point_id = await create_structure(
        session_factory,
        UUID(course["id"]),
        UUID(teacher["id"]),
    )
    chat_provider.last_stream_messages = []

    response = await client.post(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
        json={"knowledge_point_id": str(point_id), "scope": "whole_class"},
    )
    assert response.status_code == 202, response.text
    completed = await wait_for_analysis_progress(
        client,
        teacher,
        course["id"],
        response.json()["id"],
    )
    assert completed["status"] == "completed", completed
    async with session_factory() as session:
        completed_record = await session.get(AIAnalysis, UUID(response.json()["id"]))
        completed_events = list(
            await session.scalars(
                select(AIAnalysisStageEvent)
                .where(AIAnalysisStageEvent.analysis_id == UUID(response.json()["id"]))
                .order_by(AIAnalysisStageEvent.sequence)
            )
        )
    assert completed["stage"] == "generating_recommendation", (
        completed,
        completed_record.stage if completed_record is not None else None,
        [(event.stage.value, event.percent) for event in completed_events],
    )
    assert completed["percent"] == 100
    assert chat_provider.last_stream_messages == []

    detail = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{response.json()['id']}",
        headers=auth_headers(teacher),
    )
    assert detail.status_code == 200
    assert detail.json()["result"]["insufficient_evidence"] is True


async def test_legacy_completed_analysis_without_progress_remains_readable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "legacy-progress-teacher@example.com", "teacher")
    course = await create_course_with_students(client, teacher, [])
    analysis_id = uuid4()
    now = datetime.now(UTC)
    async with session_factory() as session:
        session.add(
            AIAnalysis(
                id=analysis_id,
                course_id=UUID(course["id"]),
                analysis_type=AIAnalysisType.INITIAL,
                scope=AIAnalysisScope.WHOLE_CLASS,
                student_ids=[],
                time_range_days=28,
                status=AIAnalysisStatus.COMPLETED,
                progress_percent=0,
                created_by=UUID(teacher["id"]),
                started_at=now,
                completed_at=now,
            )
        )
        await session.commit()

    detail = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis/{analysis_id}",
        headers=auth_headers(teacher),
    )
    assert detail.status_code == 200, detail.text
    progress = detail.json()["progress"]
    assert progress["stage"] is None
    assert progress["percent"] == 100
    assert progress["message"] == "分析完成"

    listed = await client.get(
        f"/api/v1/courses/{course['id']}/ai-analysis",
        headers=auth_headers(teacher),
    )
    assert listed.status_code == 200
    item = next(item for item in listed.json()["items"] if item["id"] == str(analysis_id))
    assert item["progress"]["percent"] == 100


def test_ai_analysis_progress_openapi_path() -> None:
    path = "/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/progress"
    assert "get" in app.openapi()["paths"][path]
