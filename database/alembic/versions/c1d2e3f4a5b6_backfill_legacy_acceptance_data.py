"""backfill legacy acceptance data

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-09-19 18:00:00.000000

"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Sequence
from typing import Any
from urllib.parse import urlencode
from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RESOURCE_LABELS = {
    "textbook": "教材资料",
    "outline": "教学大纲",
    "question_bank": "题库",
    "code_example": "代码示例",
    "lab": "实验资料",
    "external_link": "外部资源",
    "chapter": "章节",
    "knowledge_point": "知识点",
}
ACTION_MAP = {
    "lecture": "classroom_lecture",
    "practice": "supplementary_practice",
    "review": "individual_tutoring",
}


def _json_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    return list(value) if isinstance(value, (list, tuple)) else []


def _normalize_resources(value: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for raw in _json_list(value):
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        resource_type = str(item.get("resource_type") or item.get("type") or "textbook")
        item["resource_type"] = resource_type
        item.setdefault("title", RESOURCE_LABELS.get(resource_type, "关联资源"))
        normalized.append(item)
    return normalized


def _normalize_actions(value: Any) -> list[str]:
    return [ACTION_MAP.get(str(item), str(item)) for item in _json_list(value)]


def _update_json_column(
    table_name: str,
    column_name: str,
    normalizer: Callable[[Any], Any],
) -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()
    table = sa.Table(
        table_name,
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(column_name, sa.JSON()),
    )
    rows = connection.execute(sa.select(table.c.id, table.c[column_name])).all()
    for row_id, value in rows:
        normalized = normalizer(value)
        if normalized != value:
            connection.execute(
                sa.update(table)
                .where(sa.cast(table.c.id, sa.Text()) == str(row_id))
                .values({column_name: normalized})
            )


def _normalize_review_citations() -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()
    versions = sa.Table(
        "review_answer_versions",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("citations", sa.JSON()),
    )
    chunks = sa.Table(
        "knowledge_chunks",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("content", sa.Text()),
    )
    pages = sa.Table(
        "document_pages",
        metadata,
        sa.Column("document_id", sa.Uuid()),
        sa.Column("page_number", sa.Integer()),
        sa.Column("text", sa.Text()),
    )
    chunk_cache: dict[UUID, str | None] = {}
    page_cache: dict[tuple[UUID, int], str | None] = {}

    def quote_for(citation: dict[str, Any]) -> str:
        quote = citation.get("quote")
        if isinstance(quote, str) and quote.strip():
            return quote
        chunk_id = citation.get("chunk_id")
        if chunk_id:
            try:
                parsed_chunk_id = UUID(str(chunk_id))
            except ValueError:
                parsed_chunk_id = None
            if parsed_chunk_id is not None:
                if parsed_chunk_id not in chunk_cache:
                    chunk_cache[parsed_chunk_id] = connection.scalar(
                        sa.select(chunks.c.content).where(
                            sa.cast(chunks.c.id, sa.Text()) == str(parsed_chunk_id)
                        )
                    )
                content = chunk_cache[parsed_chunk_id]
                if content:
                    return content[:500]
        document_id = citation.get("document_id")
        page_start = citation.get("page_start")
        if document_id and page_start:
            try:
                key = (UUID(str(document_id)), int(page_start))
            except (TypeError, ValueError):
                key = None
            if key is not None:
                if key not in page_cache:
                    page_cache[key] = connection.scalar(
                        sa.select(pages.c.text).where(
                            sa.cast(pages.c.document_id, sa.Text()) == str(key[0]),
                            pages.c.page_number == key[1],
                        )
                    )
                content = page_cache[key]
                if content:
                    return content[:500]
        return ""

    for version_id, citations in connection.execute(
        sa.select(versions.c.id, versions.c.citations)
    ).all():
        normalized: list[dict[str, Any]] = []
        changed = False
        for raw in _json_list(citations):
            if not isinstance(raw, dict):
                continue
            citation = dict(raw)
            quote = quote_for(citation)
            if citation.get("quote") != quote:
                citation["quote"] = quote
                changed = True
            normalized.append(citation)
        if changed or len(normalized) != len(_json_list(citations)):
            connection.execute(
                sa.update(versions)
                .where(sa.cast(versions.c.id, sa.Text()) == str(version_id))
                .values(citations=normalized)
            )


def _normalize_notification_actions() -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()
    notifications = sa.Table(
        "notifications",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("course_id", sa.Uuid()),
        sa.Column("action_url", sa.String(length=2048)),
    )
    for notification_id, course_id, action_url in connection.execute(
        sa.select(
            notifications.c.id,
            notifications.c.course_id,
            notifications.c.action_url,
        )
    ).all():
        if not action_url:
            continue
        updated: str | None = None
        review_match = re.fullmatch(
            r"/review-flags/([0-9a-fA-F-]{36})(?:[/?#].*)?",
            action_url,
        )
        if review_match:
            query = {"reviewId": review_match.group(1)}
            if course_id:
                query["courseId"] = str(course_id)
            updated = f"/ai-review/pending?{urlencode(query)}"
        else:
            course_match = re.fullmatch(
                r"/courses/([0-9a-fA-F-]{36})/students(?:[/?#].*)?",
                action_url,
            )
            if course_match:
                updated = f"/courses/{course_match.group(1)}?tab=students"
        if updated and updated != action_url:
            connection.execute(
                sa.update(notifications)
                .where(notifications.c.action_url == action_url)
                .values(action_url=updated)
            )


def _normalize_course_codes() -> None:
    connection = op.get_bind()
    metadata = sa.MetaData()
    courses = sa.Table(
        "courses",
        metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(length=16)),
    )
    for code in connection.scalars(sa.select(courses.c.code)).all():
        match = re.fullmatch(r"ACC(\d{3})", str(code or ""))
        if not match:
            continue
        updated = f"ACC{int(match.group(1)):05d}"
        connection.execute(
            sa.update(courses).where(courses.c.code == code).values(code=updated)
        )


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE message_citations
            SET quote = COALESCE(
                (
                    SELECT substr(knowledge_chunks.content, 1, 500)
                    FROM knowledge_chunks
                    WHERE knowledge_chunks.id = message_citations.chunk_id
                ),
                (
                    SELECT substr(document_pages.text, 1, 500)
                    FROM document_pages
                    WHERE document_pages.document_id = message_citations.document_id
                      AND document_pages.page_number = message_citations.page_start
                ),
                ''
            )
            WHERE quote IS NULL OR trim(quote) = ''
            """
        )
    )
    _normalize_review_citations()
    for table_name, column_name in (
        ("teaching_strategies", "resources_json"),
        ("execution_plans", "resources_json"),
        ("execution_plan_weeks", "resources_json"),
        ("plan_tasks", "resources_json"),
    ):
        _update_json_column(table_name, column_name, _normalize_resources)
    _update_json_column("execution_plans", "actions", _normalize_actions)
    _normalize_notification_actions()
    _normalize_course_codes()


def downgrade() -> None:
    """Data normalization is intentionally not reverted."""
