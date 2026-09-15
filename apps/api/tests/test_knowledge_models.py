from app.db.base import Base


def test_knowledge_tables_are_registered() -> None:
    assert {"chapters", "knowledge_points", "knowledge_relations"}.issubset(Base.metadata.tables)


def test_chapter_and_knowledge_point_constraints() -> None:
    chapter_constraints = {
        constraint.name
        for constraint in Base.metadata.tables["chapters"].constraints
        if constraint.name
    }
    point_constraints = {
        constraint.name
        for constraint in Base.metadata.tables["knowledge_points"].constraints
        if constraint.name
    }

    assert "uq_chapters_document_order" in chapter_constraints
    assert "uq_knowledge_points_chapter_name" in point_constraints


def test_knowledge_relation_cannot_reference_itself() -> None:
    constraints = Base.metadata.tables["knowledge_relations"].constraints
    check_names = {constraint.name for constraint in constraints if constraint.name}

    assert "ck_knowledge_relations_distinct_points" in check_names
