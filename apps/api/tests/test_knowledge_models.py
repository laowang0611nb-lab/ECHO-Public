from database.db.base import Base


def test_knowledge_tables_are_registered() -> None:
    assert {
        "chapters",
        "knowledge_chunks",
        "knowledge_points",
        "knowledge_relations",
    }.issubset(Base.metadata.tables)


def test_chapter_and_knowledge_point_constraints() -> None:
    chunk_constraints = Base.metadata.tables["knowledge_chunks"].constraints
    chunk_names = {constraint.name for constraint in chunk_constraints if constraint.name}
    assert "uq_knowledge_chunks_document_index" in chunk_names
    assert "ck_knowledge_chunks_page_range" in chunk_names

    chapter_indexes = {index.name for index in Base.metadata.tables["chapters"].indexes}
    point_indexes = {index.name for index in Base.metadata.tables["knowledge_points"].indexes}
    assert "uq_chapters_active_document_order" in chapter_indexes
    assert "uq_knowledge_points_active_chapter_name" in point_indexes


def test_knowledge_relation_cannot_reference_itself() -> None:
    constraints = Base.metadata.tables["knowledge_relations"].constraints
    check_names = {constraint.name for constraint in constraints if constraint.name}

    assert "ck_knowledge_relations_distinct_points" in check_names
