from io import BytesIO

from httpx import AsyncClient
from pypdf import PdfWriter


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
