"""add student analytics indexes

Revision ID: f1a2b3c4d5e6
Revises: b1c2d3e4f5a6
Create Date: 2026-10-20
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_learning_events_course_user_created_at",
        "learning_events",
        ["course_id", "user_id", "created_at"],
    )
    op.create_index(
        "ix_conversations_course_user",
        "conversations",
        ["course_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_conversations_course_user",
        table_name="conversations",
    )
    op.drop_index(
        "ix_learning_events_course_user_created_at",
        table_name="learning_events",
    )
