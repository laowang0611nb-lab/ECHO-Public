from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import UUID, uuid4

import pytest
from database.models.chat import Conversation, Message, MessageCitation, MessageRole
from database.models.document import Document, DocumentPage
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from httpx import AsyncClient
from pypdf import PdfWriter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def make_pdf(page_count: int = 2) -> bytes:
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


async def create_course_and_student(
    client: AsyncClient,
    teacher: dict[str, str],
    student: dict[str, str],
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Teacher Resource Course"},
    )
    assert response.status_code == 201
    course = response.json()
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
    return course


async def create_ready_document(
    client: AsyncClient,
    teacher: dict[str, str],
    course: dict[str, str],
    resource_type: str = "textbook",
) -> dict[str, object]:
    uploaded = await client.post(
        f"/api/v1/courses/{course['id']}/documents?resource_type={resource_type}",
        headers=auth_headers(teacher),
        files={"file": ("evidence.pdf", make_pdf(), "application/pdf")},
    )
    assert uploaded.status_code == 201
    document = uploaded.json()
    parsed = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )
    assert parsed.status_code == 200
    return parsed.json()


async def test_pdf_range_page_evidence_index_and_citations(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "resource-pdf@example.com", "teacher")
    student = await login(client, "resource-pdf-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    document_id = UUID(document["id"])
    assert document["resource_type"] == "textbook"
    course_id = UUID(course["id"])
    student_id = UUID(student["id"])
    chapter_id = uuid4()
    point_id = uuid4()
    chunk_id = uuid4()
    conversation_id = uuid4()
    message_id = uuid4()
    citation_id = uuid4()

    async with session_factory() as session:
        session.add_all(
            [
                Chapter(
                    id=chapter_id,
                    course_id=course_id,
                    document_id=document_id,
                    title="Evidence Chapter",
                    order_index=0,
                ),
                KnowledgePoint(
                    id=point_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Evidence Point",
                    order_index=0,
                ),
                Conversation(
                    id=conversation_id,
                    course_id=course_id,
                    user_id=student_id,
                    title="Evidence conversation",
                ),
                Message(
                    id=message_id,
                    conversation_id=conversation_id,
                    role=MessageRole.ASSISTANT,
                    content="Answer with evidence",
                ),
                MessageCitation(
                    id=citation_id,
                    message_id=message_id,
                    citation_index=1,
                    chunk_id=chunk_id,
                    document_id=document_id,
                    page_start=1,
                    page_end=1,
                    quote="Evidence quote",
                ),
                KnowledgeChunk(
                    id=chunk_id,
                    course_id=course_id,
                    document_id=document_id,
                    chapter_id=chapter_id,
                    chunk_index=0,
                    page_start=1,
                    page_end=1,
                    content="Evidence quote",
                    char_count=14,
                    metadata_json={"page_number": 1},
                ),
            ]
        )
        await session.commit()

    file_response = await client.get(
        f"/api/v1/courses/{course_id}/documents/{document_id}/file",
        headers={**auth_headers(teacher), "Range": "bytes=0-3"},
    )
    page_response = await client.get(
        f"/api/v1/courses/{course_id}/documents/{document_id}/pages/1",
        headers=auth_headers(teacher),
    )
    index_response = await client.get(
        f"/api/v1/courses/{course_id}/documents/{document_id}/index-status",
        headers=auth_headers(teacher),
    )
    citation_response = await client.get(
        f"/api/v1/courses/{course_id}/documents/{document_id}/citations",
        headers=auth_headers(teacher),
    )

    assert file_response.status_code == 206
    assert file_response.headers["content-range"].startswith("bytes 0-3/")
    assert file_response.content == make_pdf()[:4]
    assert page_response.status_code == 200
    assert page_response.json()["width"] == 612
    assert page_response.json()["height"] == 792
    assert page_response.json()["blocks"][0]["chunk_id"] == str(chunk_id)
    assert page_response.json()["blocks"][0]["bbox"] is None
    assert index_response.json()["pages_total"] == 2
    assert index_response.json()["pages_parsed"] == 2
    assert index_response.json()["chunks_total"] == 1
    assert citation_response.json()["items"][0]["message_id"] == str(message_id)


async def test_mastery_trends_and_error_pattern_clustering(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "resource-trend@example.com", "teacher")
    student = await login(client, "resource-trend-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    assert document["resource_type"] == "textbook"
    student_id = UUID(student["id"])
    chapter_id = uuid4()
    point_id = uuid4()
    now = datetime.now(UTC)

    async with session_factory() as session:
        session.add_all(
            [
                Chapter(
                    id=chapter_id,
                    course_id=course_id,
                    document_id=UUID(document["id"]),
                    title="Trend Chapter",
                    order_index=0,
                ),
                KnowledgePoint(
                    id=point_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Boundary Value",
                    order_index=0,
                ),
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=point_id,
                    score=62.5,
                ),
            ]
        )
        for index, score in enumerate((55.0, 65.0, 70.0)):
            event = LearningEvent(
                id=uuid4(),
                course_id=course_id,
                user_id=student_id,
                knowledge_point_id=point_id,
                event_type=LearningEventType.QUIZ_WRONG,
                weight=1.0,
                evidence=f"boundary evidence {index}",
                metadata_json={"error_code": "boundary_missing"},
                created_at=now - timedelta(days=index),
            )
            session.add(event)
            session.add(
                MasterySnapshot(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=point_id,
                    source_event_id=event.id,
                    score=score,
                    created_at=now - timedelta(days=index),
                )
            )
        await session.commit()

    point_trend = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-points/{point_id}/mastery-trend?days=30",
        headers=auth_headers(teacher),
    )
    student_trend = await client.get(
        f"/api/v1/courses/{course_id}/students/{student_id}/mastery-trend?days=90",
        headers=auth_headers(teacher),
    )
    point_errors = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-points/{point_id}/error-patterns?days=30",
        headers=auth_headers(teacher),
    )
    student_errors = await client.get(
        f"/api/v1/courses/{course_id}/students/{student_id}/error-patterns?days=90",
        headers=auth_headers(teacher),
    )

    assert point_trend.status_code == 200
    assert [point["date"] for point in point_trend.json()["points"]] == sorted(
        point["date"] for point in point_trend.json()["points"]
    )
    assert sum(point["evidence_count"] for point in point_trend.json()["points"]) == 3
    assert student_trend.json()["student_id"] == str(student_id)
    assert point_errors.json()["patterns"][0]["code"] == "boundary_missing"
    assert point_errors.json()["patterns"][0]["occurrence_count"] == 3
    assert student_errors.json()["patterns"][0]["affected_students"] == 1


async def test_question_external_resource_crud_graph_and_trash(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "resource-content@example.com", "teacher")
    student = await login(client, "resource-content-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add_all(
            [
                Chapter(
                    id=chapter_id,
                    course_id=course_id,
                    document_id=UUID(document["id"]),
                    title="Resource Chapter",
                    order_index=0,
                ),
                KnowledgePoint(
                    id=point_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Resource Point",
                    order_index=0,
                ),
            ]
        )
        await session.commit()

    question = await client.post(
        f"/api/v1/courses/{course_id}/question-items",
        headers=auth_headers(teacher),
        json={
            "knowledge_point_ids": [str(point_id)],
            "type": "single_choice",
            "difficulty": "easy",
            "title": "Boundary question",
            "content": "Which value is a boundary?",
            "answer": "0",
            "explanation": "Zero is included.",
            "source_document_id": document["id"],
            "source_page": 1,
        },
    )
    assert question.status_code == 201
    question_id = question.json()["id"]
    question_list = await client.get(
        f"/api/v1/courses/{course_id}/question-items?knowledgePointId={point_id}",
        headers=auth_headers(teacher),
    )
    assert question_list.status_code == 200
    assert question_list.json()["total"] == 1
    student_list = await client.get(
        f"/api/v1/courses/{course_id}/question-items",
        headers=auth_headers(student),
    )
    assert student_list.status_code == 403
    question_patch = await client.patch(
        f"/api/v1/courses/{course_id}/question-items/{question_id}",
        headers=auth_headers(teacher),
        json={"difficulty": "hard", "title": "Updated boundary question"},
    )
    null_difficulty = await client.patch(
        f"/api/v1/courses/{course_id}/question-items/{question_id}",
        headers=auth_headers(teacher),
        json={"difficulty": None},
    )

    assert question_patch.status_code == 200
    assert question_patch.json()["difficulty"] == "hard"
    assert question_patch.json()["title"] == "Updated boundary question"
    assert null_difficulty.status_code == 422

    external = await client.post(
        f"/api/v1/courses/{course_id}/external-resources",
        headers=auth_headers(teacher),
        json={
            "title": "Boundary guide",
            "url": "https://example.com/boundary",
            "provider": "Example",
            "knowledge_point_ids": [str(point_id)],
        },
    )
    assert external.status_code == 201
    external_id = external.json()["id"]
    external_list = await client.get(
        f"/api/v1/courses/{course_id}/external-resources?status=unchecked",
        headers=auth_headers(teacher),
    )
    assert external_list.json()["total"] == 1
    external_patch = await client.patch(
        f"/api/v1/courses/{course_id}/external-resources/{external_id}",
        headers=auth_headers(teacher),
        json={"check_status": "invalid"},
    )
    invalid_list = await client.get(
        f"/api/v1/courses/{course_id}/external-resources?status=invalid",
        headers=auth_headers(teacher),
    )
    null_check_status = await client.patch(
        f"/api/v1/courses/{course_id}/external-resources/{external_id}",
        headers=auth_headers(teacher),
        json={"check_status": None},
    )

    assert external_patch.status_code == 200
    assert external_patch.json()["check_status"] == "invalid"
    assert invalid_list.json()["total"] == 1
    assert null_check_status.status_code == 422

    graph = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-graph?pointId={point_id}",
        headers=auth_headers(teacher),
    )
    assert graph.status_code == 200
    graph_json = graph.json()
    assert any(node["id"] == question_id for node in graph_json["nodes"])
    assert any(node["id"] == external_id for node in graph_json["nodes"])
    assert any(edge["type"] == "assessed_by" for edge in graph_json["edges"])

    trashed = await client.post(
        f"/api/v1/courses/{course_id}/resources/{question_id}/trash",
        headers=auth_headers(teacher),
    )
    trash_list = await client.get(
        f"/api/v1/courses/{course_id}/resources?trashed=true",
        headers=auth_headers(teacher),
    )
    restored = await client.post(
        f"/api/v1/courses/{course_id}/resources/{question_id}/restore",
        headers=auth_headers(teacher),
    )
    permanent = await client.delete(
        f"/api/v1/courses/{course_id}/resources/{question_id}?permanent=true",
        headers=auth_headers(teacher),
    )

    assert trashed.status_code == 200
    assert any(item["id"] == question_id for item in trash_list.json()["items"])
    assert restored.status_code == 200
    assert permanent.status_code == 200
    assert permanent.json()["deleted"] is True


async def test_chapter_and_point_soft_delete_and_restore(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "resource-lifecycle@example.com", "teacher")
    student = await login(client, "resource-lifecycle-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=UUID(document["id"]),
                title="Lifecycle Chapter",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="Lifecycle Point",
                order_index=0,
            )
        )
        await session.commit()

    deleted = await client.delete(
        f"/api/v1/knowledge-points/{point_id}",
        headers=auth_headers(teacher),
    )
    trashed = await client.get(
        f"/api/v1/courses/{course_id}/resources?trashed=true",
        headers=auth_headers(teacher),
    )
    restored = await client.post(
        f"/api/v1/courses/{course_id}/resources/{point_id}/restore",
        headers=auth_headers(teacher),
    )
    assert deleted.status_code == 204
    assert any(item["id"] == str(point_id) for item in trashed.json()["items"])
    assert restored.status_code == 200
    assert restored.json()["item_type"] == "knowledge_point"

    document_trash = await client.post(
        f"/api/v1/courses/{course_id}/resources/{document['id']}/trash",
        headers=auth_headers(teacher),
    )
    document_restore = await client.post(
        f"/api/v1/courses/{course_id}/resources/{document['id']}/restore",
        headers=auth_headers(teacher),
    )
    document_trash_again = await client.post(
        f"/api/v1/courses/{course_id}/resources/{document['id']}/trash",
        headers=auth_headers(teacher),
    )
    document_delete = await client.delete(
        f"/api/v1/courses/{course_id}/resources/{document['id']}?permanent=true",
        headers=auth_headers(teacher),
    )
    assert document_trash.status_code == 200
    assert document_restore.status_code == 200
    assert document_trash_again.status_code == 200
    assert document_delete.status_code == 200
    assert document_delete.json()["deleted"] is True

    async with session_factory() as session:
        assert await session.get(Document, UUID(document["id"])) is None
        assert await session.get(Chapter, chapter_id) is None
        assert await session.get(KnowledgePoint, point_id) is None
        assert (
            await session.scalar(
                select(KnowledgeChunk.id).where(KnowledgeChunk.document_id == UUID(document["id"]))
            )
            is None
        )
        assert (
            await session.scalar(
                select(DocumentPage.id).where(DocumentPage.document_id == UUID(document["id"]))
            )
            is None
        )


async def test_new_teacher_resource_endpoints_map_course_errors(
    client: AsyncClient,
) -> None:
    teacher = await login(client, "resource-errors@example.com", "teacher")
    student = await login(client, "resource-errors-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    missing_course_id = uuid4()

    missing = await client.get(
        f"/api/v1/courses/{missing_course_id}/resources",
        headers=auth_headers(teacher),
    )
    forbidden = await client.get(
        f"/api/v1/courses/{course['id']}/resources",
        headers=auth_headers(student),
    )
    missing_trend = await client.get(
        f"/api/v1/courses/{missing_course_id}/knowledge-points/{uuid4()}/mastery-trend",
        headers=auth_headers(teacher),
    )

    assert missing.status_code == 404
    assert forbidden.status_code == 403
    assert missing_trend.status_code == 404


async def test_restore_knowledge_point_name_conflict_returns_409(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "resource-restore-conflict@example.com", "teacher")
    student = await login(client, "resource-restore-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    chapter_id = uuid4()
    first_id = uuid4()
    second_id = uuid4()
    shared_name = "Conflicting Point"

    async with session_factory() as session:
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=UUID(document["id"]),
                title="Restore Chapter",
                order_index=0,
            )
        )
        session.add_all(
            [
                KnowledgePoint(
                    id=first_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name=shared_name,
                    order_index=0,
                ),
                KnowledgePoint(
                    id=second_id,
                    course_id=course_id,
                    chapter_id=chapter_id,
                    name="Second Point",
                    order_index=1,
                ),
            ]
        )
        await session.commit()

    deleted = await client.delete(
        f"/api/v1/knowledge-points/{first_id}",
        headers=auth_headers(teacher),
    )
    renamed = await client.patch(
        f"/api/v1/knowledge-points/{second_id}",
        headers=auth_headers(teacher),
        json={"name": shared_name},
    )
    restored = await client.post(
        f"/api/v1/courses/{course_id}/resources/{first_id}/restore",
        headers=auth_headers(teacher),
    )

    assert deleted.status_code == 204
    assert renamed.status_code == 200
    assert restored.status_code == 409


async def test_permanent_document_delete_rolls_back_all_steps(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    teacher = await login(client, "resource-atomic-delete@example.com", "teacher")
    student = await login(client, "resource-atomic-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    document_id = UUID(document["id"])
    chapter_id = uuid4()
    point_id = uuid4()

    async with session_factory() as session:
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="Atomic Chapter",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="Atomic Point",
                order_index=0,
            )
        )
        await session.commit()

    original_execute = AsyncSession.execute

    async def fail_on_page_delete(self, statement, *args, **kwargs):
        table = getattr(statement, "table", None)
        if getattr(table, "name", None) == "document_pages":
            raise RuntimeError("forced permanent delete failure")
        return await original_execute(self, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "execute", fail_on_page_delete)
    with pytest.raises(RuntimeError, match="forced permanent delete failure"):
        await client.delete(
            f"/api/v1/courses/{course_id}/resources/{document_id}?permanent=true",
            headers=auth_headers(teacher),
        )

    async with session_factory() as session:
        assert await session.get(Document, document_id) is not None
        assert await session.get(Chapter, chapter_id) is not None
        assert await session.get(KnowledgePoint, point_id) is not None


async def test_knowledge_analytics_rejects_soft_deleted_document(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "deleted-analytics@example.com", "teacher")
    student = await login(client, "deleted-analytics-student@example.com", "student")
    course = await create_course_and_student(client, teacher, student)
    document = await create_ready_document(client, teacher, course)
    course_id = UUID(course["id"])
    document_id = UUID(str(document["id"]))
    chapter_id = uuid4()
    point_id = uuid4()
    async with session_factory() as session:
        session.add(
            Chapter(
                id=chapter_id,
                course_id=course_id,
                document_id=document_id,
                title="Deleted Analytics Chapter",
                order_index=0,
            )
        )
        session.add(
            KnowledgePoint(
                id=point_id,
                course_id=course_id,
                chapter_id=chapter_id,
                name="Deleted Analytics Point",
                order_index=0,
            )
        )
        stored_document = await session.get(Document, document_id)
        assert stored_document is not None
        stored_document.trashed_at = datetime.now(UTC)
        await session.commit()

    trend = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-points/{point_id}/mastery-trend",
        headers=auth_headers(teacher),
    )
    errors = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-points/{point_id}/error-patterns",
        headers=auth_headers(teacher),
    )
    assert trend.status_code == 404
    assert errors.status_code == 404


def test_teacher_resource_openapi_paths() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/api/v1/courses/{course_id}/question-items" in paths
    assert "/api/v1/courses/{course_id}/external-resources" in paths
    assert "/api/v1/courses/{course_id}/resources" in paths
    assert "/api/v1/courses/{course_id}/knowledge-graph" in paths
    assert "/api/v1/courses/{course_id}/documents/{document_id}/file" in paths
    assert "/api/v1/courses/{course_id}/documents/{document_id}/pages/{page_number}" in paths
