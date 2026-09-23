from typing import Any

from sqlalchemy.sql import Executable

from database.scripts.reset_business_data import _qualified_table, _row_counts


class FakeResult:
    def __iter__(self):
        return iter([("users", 2), ("courses", 1)])


class FakeConnection:
    def __init__(self) -> None:
        self.statement: str | None = None

    async def execute(
        self,
        statement: Executable,
        parameters: dict[str, Any] | None = None,
    ) -> FakeResult:
        assert parameters is None
        self.statement = str(statement)
        return FakeResult()


def test_qualified_table_quotes_schema_and_table() -> None:
    assert _qualified_table("public", "users") == '"public"."users"'
    assert _qualified_table('odd"schema', "course tables") == (
        '"odd""schema"."course tables"'
    )


async def test_row_counts_uses_schema_qualified_tables() -> None:
    connection = FakeConnection()

    counts = await _row_counts(connection, "demo", ["users", "courses"])  # type: ignore[arg-type]

    assert counts == {"users": 2, "courses": 1}
    assert '"demo"."users"' in str(connection.statement)
    assert '"demo"."courses"' in str(connection.statement)
