"""create knowledge graph embed sessions

Revision ID: b1c2d3e4f5a6
Revises: b8c9d0e1f2a3
Create Date: 2026-10-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create one-time tickets for read-only knowledge graph embeds."""
    op.create_table(
        "knowledge_graph_embed_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ticket_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_knowledge_graph_embed_sessions_course_id",
        "knowledge_graph_embed_sessions",
        ["course_id"],
        unique=False,
    )
    op.create_index(
        "ix_knowledge_graph_embed_sessions_expires_at",
        "knowledge_graph_embed_sessions",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_knowledge_graph_embed_sessions_ticket_hash",
        "knowledge_graph_embed_sessions",
        ["ticket_hash"],
        unique=True,
    )
    op.create_index(
        "ix_knowledge_graph_embed_sessions_user_id",
        "knowledge_graph_embed_sessions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Drop knowledge graph embed sessions."""
    op.drop_index(
        "ix_knowledge_graph_embed_sessions_user_id",
        table_name="knowledge_graph_embed_sessions",
    )
    op.drop_index(
        "ix_knowledge_graph_embed_sessions_ticket_hash",
        table_name="knowledge_graph_embed_sessions",
    )
    op.drop_index(
        "ix_knowledge_graph_embed_sessions_expires_at",
        table_name="knowledge_graph_embed_sessions",
    )
    op.drop_index(
        "ix_knowledge_graph_embed_sessions_course_id",
        table_name="knowledge_graph_embed_sessions",
    )
    op.drop_table("knowledge_graph_embed_sessions")
