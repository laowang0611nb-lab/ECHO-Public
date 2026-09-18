from database.db.base import Base


def test_core_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {
        "auth_sessions",
        "ai_review_flags",
        "chapters",
        "conversations",
        "document_pages",
        "documents",
        "external_resource_knowledge_points",
        "external_resources",
        "course_invites",
        "course_members",
        "courses",
        "knowledge_points",
        "learning_events",
        "mastery_snapshots",
        "knowledge_chunks",
        "knowledge_relations",
        "question_item_knowledge_points",
        "question_items",
        "student_knowledge_states",
        "student_profiles",
        "teacher_profiles",
        "message_citations",
        "messages",
        "review_answer_versions",
        "review_history",
        "review_regeneration_runs",
        "teaching_policies",
        "user_credentials",
        "users",
    }


def test_course_member_pair_is_unique() -> None:
    constraints = Base.metadata.tables["course_members"].constraints
    unique_names = {constraint.name for constraint in constraints if constraint.name}

    assert "uq_course_members_course_user" in unique_names
