from io import BytesIO
from uuid import UUID

from database.models.course import CourseMember
from database.models.knowledge import KnowledgeRelation
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from database.models.user import UserRole
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


async def create_generated_structure(
    client: AsyncClient,
    teacher: dict[str, str],
) -> tuple[dict[str, str], dict[str, str], list[dict[str, object]]]:
    course_response = await client.post(
        "/api/v1/courses",
        headers=auth_headers(teacher),
        json={"name": "Editable Knowledge Course"},
    )
    assert course_response.status_code == 201
    course = course_response.json()

    upload_response = await client.post(
        f"/api/v1/courses/{course['id']}/documents",
        headers=auth_headers(teacher),
        files={"file": ("editable.pdf", make_pdf(), "application/pdf")},
    )
    assert upload_response.status_code == 201
    document = upload_response.json()

    parse_response = await client.post(
        f"/api/v1/documents/{document['id']}/parse",
        headers=auth_headers(teacher),
    )
    assert parse_response.status_code == 200

    generated = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )
    assert generated.status_code == 200
    return course, document, generated.json()


async def test_teacher_can_create_reorder_and_edit_structure(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-edit@example.com", "teacher")
    course, document, chapters = await create_generated_structure(client, teacher)
    first_chapter = chapters[0]
    second_chapter = chapters[1]

    created_chapter = await client.post(
        f"/api/v1/documents/{document['id']}/chapters",
        headers=auth_headers(teacher),
        json={
            "title": "Manual Chapter",
            "summary": "Added by the teacher",
            "order_index": 1,
        },
    )
    assert created_chapter.status_code == 201
    manual_chapter = created_chapter.json()
    assert manual_chapter["order_index"] == 1

    ordered = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(teacher),
    )
    assert [chapter["title"] for chapter in ordered.json()] == [
        "Chapter 1",
        "Manual Chapter",
        "Chapter 2",
    ]
    assert [chapter["order_index"] for chapter in ordered.json()] == [0, 1, 2]

    updated_chapter = await client.patch(
        f"/api/v1/chapters/{manual_chapter['id']}",
        headers=auth_headers(teacher),
        json={"title": "Teacher Chapter", "summary": None, "order_index": 0},
    )
    assert updated_chapter.status_code == 200
    assert updated_chapter.json()["title"] == "Teacher Chapter"
    assert updated_chapter.json()["summary"] is None
    assert updated_chapter.json()["order_index"] == 0

    created_point = await client.post(
        f"/api/v1/chapters/{manual_chapter['id']}/knowledge-points",
        headers=auth_headers(teacher),
        json={
            "name": "Manual Point",
            "description": "Teacher-authored point",
            "order_index": 0,
        },
    )
    assert created_point.status_code == 201
    manual_point = created_point.json()
    assert manual_point["order_index"] == 0

    moved_point = await client.patch(
        f"/api/v1/knowledge-points/{manual_point['id']}",
        headers=auth_headers(teacher),
        json={
            "chapter_id": first_chapter["id"],
            "name": "Moved Point",
            "order_index": 0,
        },
    )
    assert moved_point.status_code == 200
    assert moved_point.json()["chapter_id"] == first_chapter["id"]
    assert moved_point.json()["name"] == "Moved Point"
    assert moved_point.json()["order_index"] == 0

    after_move = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(teacher),
    )
    first_points = after_move.json()[1]["knowledge_points"]
    assert [point["name"] for point in first_points][:2] == ["Moved Point", "Point 1"]

    deleted_point = await client.delete(
        f"/api/v1/knowledge-points/{manual_point['id']}",
        headers=auth_headers(teacher),
    )
    deleted_chapter = await client.delete(
        f"/api/v1/chapters/{second_chapter['id']}",
        headers=auth_headers(teacher),
    )
    final_structure = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(teacher),
    )

    assert deleted_point.status_code == 204
    assert deleted_chapter.status_code == 204
    assert [chapter["title"] for chapter in final_structure.json()] == [
        "Teacher Chapter",
        "Chapter 1",
    ]
    assert [chapter["order_index"] for chapter in final_structure.json()] == [0, 1]


async def test_trashed_document_hides_structure_and_blocks_edits(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-trash-document@example.com", "teacher")
    course, document, chapters = await create_generated_structure(client, teacher)
    point_id = chapters[0]["knowledge_points"][0]["id"]

    trashed = await client.post(
        f"/api/v1/courses/{course['id']}/resources/{document['id']}/trash",
        headers=auth_headers(teacher),
    )
    visible_chapters = await client.get(
        f"/api/v1/courses/{course['id']}/chapters",
        headers=auth_headers(teacher),
    )
    patched = await client.patch(
        f"/api/v1/knowledge-points/{point_id}",
        headers=auth_headers(teacher),
        json={"name": "Hidden Change"},
    )
    created = await client.post(
        f"/api/v1/documents/{document['id']}/chapters",
        headers=auth_headers(teacher),
        json={"title": "Hidden Chapter"},
    )
    generated = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )

    assert trashed.status_code == 200
    assert visible_chapters.status_code == 200
    assert visible_chapters.json() == []
    assert patched.status_code == 404
    assert created.status_code == 404
    assert generated.status_code == 404


async def test_trashed_point_is_not_reused_edited_merged_or_attached(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "knowledge-trash-point@example.com", "teacher")
    course, document, chapters = await create_generated_structure(client, teacher)
    course_id = UUID(course["id"])
    old_point = chapters[0]["knowledge_points"][0]
    target = chapters[0]["knowledge_points"][1]
    old_point_id = UUID(old_point["id"])

    deleted = await client.delete(
        f"/api/v1/knowledge-points/{old_point_id}",
        headers=auth_headers(teacher),
    )
    async with session_factory() as session:
        session.add(
            KnowledgeRelation(
                course_id=course_id,
                source_knowledge_point_id=old_point_id,
                target_knowledge_point_id=UUID(target["id"]),
                relation_type="related",
            )
        )
        await session.commit()

    regenerated = await client.post(
        f"/api/v1/documents/{document['id']}/generate-structure",
        headers=auth_headers(teacher),
    )
    patched = await client.patch(
        f"/api/v1/knowledge-points/{old_point_id}",
        headers=auth_headers(teacher),
        json={"name": "Still Hidden"},
    )
    merged = await client.post(
        f"/api/v1/courses/{course_id}/knowledge-points/merge",
        headers=auth_headers(teacher),
        json={
            "target_knowledge_point_id": target["id"],
            "source_knowledge_point_ids": [str(old_point_id)],
        },
    )
    question = await client.post(
        f"/api/v1/courses/{course_id}/question-items",
        headers=auth_headers(teacher),
        json={
            "knowledge_point_ids": [str(old_point_id)],
            "type": "short_answer",
            "difficulty": "easy",
            "title": "Trashed point question",
            "content": "Should fail",
        },
    )
    external = await client.post(
        f"/api/v1/courses/{course_id}/external-resources",
        headers=auth_headers(teacher),
        json={
            "title": "Trashed point resource",
            "url": "https://example.com/trashed",
            "knowledge_point_ids": [str(old_point_id)],
        },
    )
    graph = await client.get(
        f"/api/v1/courses/{course_id}/knowledge-graph",
        headers=auth_headers(teacher),
    )

    assert deleted.status_code == 204
    assert regenerated.status_code == 200
    replacement = next(
        point
        for chapter in regenerated.json()
        for point in chapter["knowledge_points"]
        if point["name"] == old_point["name"]
    )
    assert replacement["id"] != str(old_point_id)
    assert patched.status_code == 404
    assert merged.status_code == 404
    assert question.status_code == 404
    assert external.status_code == 404
    assert graph.status_code == 200
    assert str(old_point_id) not in {node["id"] for node in graph.json()["nodes"]}
    assert all(
        str(old_point_id) not in {edge["source"], edge["target"]} for edge in graph.json()["edges"]
    )


async def test_teacher_merges_knowledge_points_with_explainable_state(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    teacher = await login(client, "knowledge-merge@example.com", "teacher")
    student = await login(client, "knowledge-merge-student@example.com", "student")
    course, _, chapters = await create_generated_structure(client, teacher)
    target = chapters[0]["knowledge_points"][0]
    source = chapters[0]["knowledge_points"][1]
    second_source = chapters[1]["knowledge_points"][0]
    course_id = UUID(course["id"])
    student_id = UUID(student["id"])
    target_id = UUID(target["id"])
    source_id = UUID(source["id"])
    second_source_id = UUID(second_source["id"])

    async with session_factory() as session:
        session.add(
            CourseMember(
                course_id=course_id,
                user_id=student_id,
                role=UserRole.STUDENT,
            )
        )
        session.add_all(
            [
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=target_id,
                    score=60.0,
                ),
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=source_id,
                    score=80.0,
                ),
                StudentKnowledgeState(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=second_source_id,
                    score=90.0,
                ),
                MasterySnapshot(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=source_id,
                    score=80.0,
                ),
                LearningEvent(
                    course_id=course_id,
                    user_id=student_id,
                    knowledge_point_id=source_id,
                    event_type=LearningEventType.QUIZ_WRONG,
                    weight=1.0,
                    metadata_json={},
                ),
                KnowledgeRelation(
                    course_id=course_id,
                    source_knowledge_point_id=source_id,
                    target_knowledge_point_id=target_id,
                    relation_type="related",
                ),
            ]
        )
        await session.commit()

    response = await client.post(
        f"/api/v1/courses/{course_id}/knowledge-points/merge",
        headers=auth_headers(teacher),
        json={
            "target_knowledge_point_id": str(target_id),
            "source_knowledge_point_ids": [str(source_id), str(second_source_id)],
            "name": "Merged Point",
            "description": "Merged description",
        },
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(target_id)
    assert response.json()["name"] == "Merged Point"

    async with session_factory() as session:
        states = list(
            await session.scalars(
                select(StudentKnowledgeState).where(
                    StudentKnowledgeState.course_id == course_id,
                    StudentKnowledgeState.user_id == student_id,
                )
            )
        )
        snapshots = list(await session.scalars(select(MasterySnapshot)))
        events = list(await session.scalars(select(LearningEvent)))
        relations = list(await session.scalars(select(KnowledgeRelation)))

    assert len(states) == 1
    assert states[0].knowledge_point_id == target_id
    assert states[0].score == 76.67
    assert snapshots[0].knowledge_point_id == target_id
    assert len(snapshots) == 2
    assert any(snapshot.score == 76.67 for snapshot in snapshots)
    assert events[0].knowledge_point_id == target_id
    assert relations == []


async def test_duplicate_knowledge_point_name_returns_conflict(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-duplicate@example.com", "teacher")
    _, _, chapters = await create_generated_structure(client, teacher)
    chapter = chapters[0]

    response = await client.post(
        f"/api/v1/chapters/{chapter['id']}/knowledge-points",
        headers=auth_headers(teacher),
        json={"name": "Point 1"},
    )

    assert response.status_code == 409


async def test_student_cannot_edit_knowledge_structure(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-edit-owner@example.com", "teacher")
    student = await login(client, "knowledge-edit-student@example.com", "student")
    _, _, chapters = await create_generated_structure(client, teacher)
    chapter = chapters[0]
    point = chapter["knowledge_points"][0]

    patch_chapter = await client.patch(
        f"/api/v1/chapters/{chapter['id']}",
        headers=auth_headers(student),
        json={"title": "Student Change"},
    )
    patch_point = await client.patch(
        f"/api/v1/knowledge-points/{point['id']}",
        headers=auth_headers(student),
        json={"name": "Student Change"},
    )
    delete_chapter = await client.delete(
        f"/api/v1/chapters/{chapter['id']}",
        headers=auth_headers(student),
    )

    assert patch_chapter.status_code == 403
    assert patch_point.status_code == 403
    assert delete_chapter.status_code == 403


async def test_unknown_knowledge_node_returns_404(client: AsyncClient) -> None:
    teacher = await login(client, "knowledge-edit-missing@example.com", "teacher")

    response = await client.patch(
        f"/api/v1/chapters/{'00000000-0000-0000-0000-000000000001'}",
        headers=auth_headers(teacher),
        json={"title": "Missing"},
    )

    assert response.status_code == 404
