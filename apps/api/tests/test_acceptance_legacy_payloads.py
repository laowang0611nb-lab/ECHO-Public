from uuid import uuid4

from app.schemas.review import ReviewCitationResponse
from app.services.notifications import (
    course_students_notification_action_url,
    review_notification_action_url,
)
from app.services.plan_resources import (
    normalize_plan_action,
    resource_references_from_json,
)


def test_legacy_resource_reference_payload_is_normalized() -> None:
    document_id = uuid4()

    references = resource_references_from_json([{"id": str(document_id), "type": "textbook"}])

    assert len(references) == 1
    assert references[0].id == document_id
    assert references[0].resource_type == "textbook"
    assert references[0].title == "教材资料"


def test_legacy_plan_actions_are_normalized() -> None:
    assert normalize_plan_action("lecture").value == "classroom_lecture"
    assert normalize_plan_action("practice").value == "supplementary_practice"
    assert normalize_plan_action("quick_check").value == "quick_check"
    assert normalize_plan_action("review").value == "individual_tutoring"


def test_notification_action_urls_use_teacher_routes() -> None:
    course_id = uuid4()
    flag_id = uuid4()

    assert review_notification_action_url(course_id, flag_id) == (
        f"/ai-review/pending?reviewId={flag_id}&courseId={course_id}"
    )
    assert course_students_notification_action_url(course_id) == (
        f"/courses/{course_id}?tab=students"
    )


def test_legacy_review_citation_without_quote_is_accepted() -> None:
    document_id = uuid4()
    chunk_id = uuid4()

    citation = ReviewCitationResponse.model_validate(
        {
            "document_id": document_id,
            "chunk_id": chunk_id,
            "page_start": 3,
            "page_end": 4,
        }
    )

    assert citation.document_id == document_id
    assert citation.chunk_id == chunk_id
    assert citation.quote == ""
