"""Reset the ECHO database to an empty but still migrated state.

Every table in the target schema is truncated except `alembic_version`, so the
schema, extensions, indexes and migration revision survive while all business
rows (accounts, courses, documents, vectors, learning history) are removed.

Usage:
    python -m database.scripts.reset_business_data --yes
    python -m database.scripts.reset_business_data --yes --keep-accounts

Always take a dump first:

    pg_dump -Fc -f backup.dump "$ECHO_DATABASE_URL"
"""

from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from database.config import settings
from database.db.base import Base

PROTECTED_TABLES = {"alembic_version"}

# Account-scoped tables that `--keep-accounts` leaves untouched.
ACCOUNT_TABLES = {
    "auth_sessions",
    "phone_verification_claims",
    "student_profiles",
    "teacher_profiles",
    "user_credentials",
    "users",
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Truncate every ECHO business table while keeping migrations intact",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override the database URL configured through ECHO_DATABASE_URL",
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Schema to reset (default: public)",
    )
    parser.add_argument(
        "--keep-accounts",
        action="store_true",
        help="Keep users, credentials, profiles, sessions and verification claims",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag; without it nothing is truncated",
    )
    return parser.parse_args()


async def _existing_tables(connection: AsyncConnection, schema: str) -> list[str]:
    result = await connection.execute(
        text(
            "select tablename from pg_tables where schemaname = :schema order by tablename"
        ),
        {"schema": schema},
    )
    return [row[0] for row in result]


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _qualified_table(schema: str, table: str) -> str:
    return f"{_quote_identifier(schema)}.{_quote_identifier(table)}"


async def _row_counts(
    connection: AsyncConnection,
    schema: str,
    tables: list[str],
) -> dict[str, int]:
    if not tables:
        return {}
    statement = " union all ".join(
        f"select '{table}' as table_name, count(*) as row_count "
        f"from {_qualified_table(schema, table)}"
        for table in tables
    )
    result = await connection.execute(text(statement))
    return {row[0]: int(row[1]) for row in result}


async def reset_business_data(
    database_url: str,
    *,
    schema: str = "public",
    keep_accounts: bool = False,
) -> dict[str, Any]:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            existing = await _existing_tables(connection, schema)
            if not existing:
                raise RuntimeError(f"Schema '{schema}' has no tables to reset")

            metadata_tables = {table.name for table in Base.metadata.sorted_tables}
            unknown = sorted(set(existing) - metadata_tables - PROTECTED_TABLES)

            targets = [table for table in existing if table not in PROTECTED_TABLES]
            if keep_accounts:
                targets = [table for table in targets if table not in ACCOUNT_TABLES]

            before = await _row_counts(connection, schema, existing)

            if targets:
                quoted = ", ".join(_qualified_table(schema, table) for table in targets)
                await connection.execute(
                    text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE")
                )

            after = await _row_counts(connection, schema, existing)

        kept = sorted(set(existing) - set(targets))
        return {
            "schema": schema,
            "keep_accounts": keep_accounts,
            "truncated_tables": len(targets),
            "kept_tables": kept,
            "unknown_tables": unknown,
            "rows_before": sum(before.values()),
            "rows_after": sum(after.values()),
            "remaining_rows": {
                table: count for table, count in after.items() if count > 0
            },
        }
    finally:
        await engine.dispose()


def main() -> None:
    args = _parse_args()
    if not args.yes:
        raise SystemExit(
            "Refusing to truncate without --yes. Take a dump first, then re-run with --yes."
        )

    database_url = args.database_url or settings.database_url
    result = asyncio.run(
        reset_business_data(
            database_url,
            schema=args.schema,
            keep_accounts=args.keep_accounts,
        )
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
