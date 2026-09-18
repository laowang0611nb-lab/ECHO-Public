from database.db.base import Base


def test_chat_tables_are_registered() -> None:
    assert {"conversations", "messages", "message_citations"}.issubset(Base.metadata.tables)


def test_message_citation_page_range_constraint() -> None:
    constraints = Base.metadata.tables["message_citations"].constraints
    names = {constraint.name for constraint in constraints if constraint.name}

    assert "ck_message_citations_page_range" in names
