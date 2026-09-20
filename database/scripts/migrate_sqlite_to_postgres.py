from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
from collections.abc import Iterable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg
from pgvector.asyncpg import register_vector
from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, Date, DateTime, Uuid
from sqlalchemy.engine import make_url
from sqlalchemy.sql.sqltypes import TypeEngine

from database.db.base import Base

IGNORED_SQLITE_TABLES = {"alembic_version", "sqlite_sequence"}


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _parse_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value).strip())


def _parse_json(value: Any) -> str:
    if isinstance(value, str):
        parsed = json.loads(value)
    else:
        parsed = value
    return json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))


def _parse_vector(value: Any) -> list[float]:
    if isinstance(value, str):
        return [float(item) for item in json.loads(value)]
    if isinstance(value, bytes):
        return [float(item) for item in json.loads(value.decode("utf-8"))]
    if isinstance(value, (list, tuple)):
        return [float(item) for item in value]
    raise TypeError(f"unsupported vector value: {type(value).__name__}")


def _convert_value(value: Any, column_type: TypeEngine[Any]) -> Any:
    if value is None:
        return None
    if isinstance(column_type, Uuid):
        return value if isinstance(value, UUID) else UUID(str(value))
    if isinstance(column_type, DateTime):
        return _parse_datetime(value)
    if isinstance(column_type, Date):
        return _parse_date(value)
    if isinstance(column_type, JSON):
        return _parse_json(value)
    if isinstance(column_type, Vector):
        return _parse_vector(value)
    if isinstance(column_type, Boolean):
        if isinstance(value, str):
            return value.strip().casefold() in {"1", "true", "t", "yes", "y"}
        return bool(value)
    return value


def _chunks(values: list[tuple[Any, ...]], size: int = 1000) -> Iterable[list[tuple[Any, ...]]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _source_row_count(connection: sqlite3.Connection, table_name: str) -> int:
    return int(connection.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0])


def _source_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }


def _table_columns(table_name: str) -> list[str]:
    return [column.name for column in Base.metadata.tables[table_name].columns]


def _read_rows(
    connection: sqlite3.Connection,
    table_name: str,
) -> list[tuple[Any, ...]]:
    columns = _table_columns(table_name)
    quoted = ", ".join(f'"{column}"' for column in columns)
    source = connection.execute(f'SELECT {quoted} FROM "{table_name}"')
    types = [Base.metadata.tables[table_name].columns[column].type for column in columns]
    return [
        tuple(
            _convert_value(value, column_type)
            for value, column_type in zip(row, types, strict=True)
        )
        for row in source.fetchall()
    ]


async def _migrate(
    source_path: Path,
    target_url: str,
    *,
    truncate: bool,
) -> dict[str, int]:
    source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
    source.execute("PRAGMA query_only = ON")
    target_dsn = (
        make_url(target_url).set(drivername="postgresql").render_as_string(hide_password=False)
    )
    target = await asyncpg.connect(target_dsn)
    await register_vector(target)
    source_counts: dict[str, int] = {}
    target_counts: dict[str, int] = {}

    try:
        source_tables = _source_tables(source)
        orm_tables = set(Base.metadata.tables)
        extra_source_tables = source_tables - orm_tables - IGNORED_SQLITE_TABLES
        missing_source_tables = orm_tables - source_tables
        if extra_source_tables or missing_source_tables:
            raise RuntimeError(
                "Source and ORM table sets differ: "
                f"extra={sorted(extra_source_tables)}, missing={sorted(missing_source_tables)}"
            )

        async with target.transaction():
            if truncate:
                names = ", ".join(
                    f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables)
                )
                await target.execute(f"TRUNCATE TABLE {names} CASCADE")

            for table in Base.metadata.sorted_tables:
                destination_count = int(
                    await target.fetchval(f'SELECT COUNT(*) FROM "{table.name}"')
                )
                if destination_count and not truncate:
                    raise RuntimeError(
                        f"Destination table {table.name!r} is not empty: {destination_count} rows"
                    )

                rows = _read_rows(source, table.name)
                source_counts[table.name] = len(rows)
                for batch in _chunks(rows):
                    if batch:
                        await target.copy_records_to_table(
                            table.name,
                            records=batch,
                            columns=_table_columns(table.name),
                        )
                target_counts[table.name] = int(
                    await target.fetchval(f'SELECT COUNT(*) FROM "{table.name}"')
                )
                if source_counts[table.name] != target_counts[table.name]:
                    raise RuntimeError(
                        f"Row-count mismatch for {table.name}: "
                        f"source={source_counts[table.name]} target={target_counts[table.name]}"
                    )

        bad_vectors = int(
            await target.fetchval(
                """
                SELECT COUNT(*)
                FROM knowledge_chunks
                WHERE embedding IS NOT NULL
                  AND vector_dims(embedding) <> 1024
                """
            )
        )
        if bad_vectors:
            raise RuntimeError(f"Found {bad_vectors} embeddings with dimensions other than 1024")
    finally:
        source.close()
        await target.close()

    return source_counts


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy ECHO SQLite data into an Alembic-created PostgreSQL database."
    )
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target-url", required=True)
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate destination ORM tables before copying.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if not args.source.is_file():
        raise SystemExit(f"SQLite source does not exist: {args.source}")
    counts = asyncio.run(_migrate(args.source.resolve(), args.target_url, truncate=args.truncate))
    total = sum(counts.values())
    print(json.dumps({"tables": len(counts), "rows": total, "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
