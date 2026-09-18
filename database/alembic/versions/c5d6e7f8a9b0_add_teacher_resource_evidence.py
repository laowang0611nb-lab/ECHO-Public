"""add teacher resource evidence and lifecycle

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-09-18 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: str | None = "b4c5d6e7f8a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add resource metadata, page dimensions, and teacher content tables."""
    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(
            sa.Column(
                "resource_type",
                sa.String(length=24),
                server_default="textbook",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True)
        )

    with op.batch_alter_table("document_pages") as batch_op:
        batch_op.add_column(sa.Column("width", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("height", sa.Integer(), nullable=True))

    with op.batch_alter_table("chapters") as batch_op:
        batch_op.add_column(
            sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.drop_constraint("uq_chapters_document_order", type_="unique")
    op.create_index(
        "uq_chapters_active_document_order",
        "chapters",
        ["document_id", "order_index"],
        unique=True,
        sqlite_where=sa.text("trashed_at IS NULL"),
        postgresql_where=sa.text("trashed_at IS NULL"),
    )

    with op.batch_alter_table("knowledge_points") as batch_op:
        batch_op.add_column(
            sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.drop_constraint(
            "uq_knowledge_points_chapter_name",
            type_="unique",
        )
    op.create_index(
        "uq_knowledge_points_active_chapter_name",
        "knowledge_points",
        ["chapter_id", "name"],
        unique=True,
        sqlite_where=sa.text("trashed_at IS NULL"),
        postgresql_where=sa.text("trashed_at IS NULL"),
    )

    op.create_table(
        "question_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "single_choice",
                "multiple_choice",
                "true_false",
                "short_answer",
                "coding",
                "experiment",
                name="question_item_type",
                native_enum=False,
                length=24,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "difficulty",
            sa.Enum(
                "easy",
                "medium",
                "hard",
                name="question_item_difficulty",
                native_enum=False,
                length=16,
                create_constraint=False,
            ),
            server_default="medium",
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("source_document_id", sa.Uuid(), nullable=True),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True),
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
            "source_page IS NULL OR source_page > 0",
            name="ck_question_items_source_page_positive",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["documents.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_question_items_course_id", "question_items", ["course_id"])
    op.create_index(
        "ix_question_items_source_document_id",
        "question_items",
        ["source_document_id"],
    )
    op.create_index("ix_question_items_created_by", "question_items", ["created_by"])

    op.create_table(
        "external_resources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("provider", sa.String(length=120), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "check_status",
            sa.Enum(
                "unchecked",
                "valid",
                "invalid",
                "unknown",
                name="external_resource_status",
                native_enum=False,
                length=16,
                create_constraint=False,
            ),
            server_default="unchecked",
            nullable=False,
        ),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("trashed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_external_resources_course_id",
        "external_resources",
        ["course_id"],
    )
    op.create_index(
        "ix_external_resources_created_by",
        "external_resources",
        ["created_by"],
    )

    op.create_table(
        "question_item_knowledge_points",
        sa.Column("question_item_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_item_id"],
            ["question_items.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("question_item_id", "knowledge_point_id"),
    )
    op.create_table(
        "external_resource_knowledge_points",
        sa.Column("external_resource_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["external_resource_id"],
            ["external_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("external_resource_id", "knowledge_point_id"),
    )


def downgrade() -> None:
    """Remove teacher resource metadata and content tables."""
    op.drop_table("external_resource_knowledge_points")
    op.drop_table("question_item_knowledge_points")
    op.drop_index("ix_external_resources_created_by", table_name="external_resources")
    op.drop_index("ix_external_resources_course_id", table_name="external_resources")
    op.drop_table("external_resources")
    op.drop_index("ix_question_items_created_by", table_name="question_items")
    op.drop_index(
        "ix_question_items_source_document_id",
        table_name="question_items",
    )
    op.drop_index("ix_question_items_course_id", table_name="question_items")
    op.drop_table("question_items")

    op.drop_index(
        "uq_knowledge_points_active_chapter_name",
        table_name="knowledge_points",
    )
    with op.batch_alter_table("knowledge_points") as batch_op:
        batch_op.drop_column("trashed_at")
        batch_op.create_unique_constraint(
            "uq_knowledge_points_chapter_name",
            ["chapter_id", "name"],
        )

    op.drop_index("uq_chapters_active_document_order", table_name="chapters")
    with op.batch_alter_table("chapters") as batch_op:
        batch_op.drop_column("trashed_at")
        batch_op.create_unique_constraint(
            "uq_chapters_document_order",
            ["document_id", "order_index"],
        )

    with op.batch_alter_table("document_pages") as batch_op:
        batch_op.drop_column("height")
        batch_op.drop_column("width")

    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_column("trashed_at")
        batch_op.drop_column("resource_type")
