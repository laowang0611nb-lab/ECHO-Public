"""create knowledge structure tables

Revision ID: c2d3e4f5a6b7
Revises: 8b1c2d3e4f50
Create Date: 2026-09-15 18:05:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "8b1c2d3e4f50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create chapter, knowledge point, and relation tables."""
    op.create_table(
        "chapters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "order_index >= 0",
            name="ck_chapters_order_index_nonnegative",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "order_index", name="uq_chapters_document_order"
        ),
    )
    op.create_index("ix_chapters_course_id", "chapters", ["course_id"])
    op.create_index("ix_chapters_document_id", "chapters", ["document_id"])

    op.create_table(
        "knowledge_points",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("chapter_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "order_index >= 0",
            name="ck_knowledge_points_order_index_nonnegative",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chapter_id", "name", name="uq_knowledge_points_chapter_name"
        ),
    )
    op.create_index("ix_knowledge_points_course_id", "knowledge_points", ["course_id"])
    op.create_index(
        "ix_knowledge_points_chapter_id", "knowledge_points", ["chapter_id"]
    )

    op.create_table(
        "knowledge_relations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("source_knowledge_point_id", sa.Uuid(), nullable=False),
        sa.Column("target_knowledge_point_id", sa.Uuid(), nullable=False),
        sa.Column("relation_type", sa.String(length=40), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_knowledge_point_id <> target_knowledge_point_id",
            name="ck_knowledge_relations_distinct_points",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_knowledge_point_id",
            "target_knowledge_point_id",
            "relation_type",
            name="uq_knowledge_relations_edge",
        ),
    )
    op.create_index(
        "ix_knowledge_relations_course_id", "knowledge_relations", ["course_id"]
    )
    op.create_index(
        "ix_knowledge_relations_source_knowledge_point_id",
        "knowledge_relations",
        ["source_knowledge_point_id"],
    )
    op.create_index(
        "ix_knowledge_relations_target_knowledge_point_id",
        "knowledge_relations",
        ["target_knowledge_point_id"],
    )


def downgrade() -> None:
    """Drop knowledge structure tables."""
    op.drop_index(
        "ix_knowledge_relations_target_knowledge_point_id",
        table_name="knowledge_relations",
    )
    op.drop_index(
        "ix_knowledge_relations_source_knowledge_point_id",
        table_name="knowledge_relations",
    )
    op.drop_index("ix_knowledge_relations_course_id", table_name="knowledge_relations")
    op.drop_table("knowledge_relations")
    op.drop_index("ix_knowledge_points_chapter_id", table_name="knowledge_points")
    op.drop_index("ix_knowledge_points_course_id", table_name="knowledge_points")
    op.drop_table("knowledge_points")
    op.drop_index("ix_chapters_document_id", table_name="chapters")
    op.drop_index("ix_chapters_course_id", table_name="chapters")
    op.drop_table("chapters")
