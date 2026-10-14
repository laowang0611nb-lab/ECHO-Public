"""add ai analysis insufficient detail

Revision ID: e5f6a7b8c9d0
Revises: d8e9f0a1b2c3
Create Date: 2026-09-26 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d8e9f0a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Persist the model's own insufficient-evidence explanation."""
    with op.batch_alter_table("ai_analysis_results") as batch_op:
        batch_op.add_column(sa.Column("insufficient_reason", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "insufficient_categories",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("ai_analysis_results") as batch_op:
        batch_op.drop_column("insufficient_categories")
        batch_op.drop_column("insufficient_reason")
