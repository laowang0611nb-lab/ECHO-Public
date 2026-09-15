from app.db.base import Base
from app.models.document import DocumentStatus


def test_document_tables_are_registered() -> None:
    assert {"documents", "document_pages"}.issubset(Base.metadata.tables)


def test_document_page_number_is_unique_per_document() -> None:
    constraints = Base.metadata.tables["document_pages"].constraints
    unique_names = {constraint.name for constraint in constraints if constraint.name}

    assert "uq_document_pages_document_page_number" in unique_names


def test_document_status_values() -> None:
    assert {status.value for status in DocumentStatus} == {
        "uploaded",
        "parsing",
        "ready",
        "failed",
    }
