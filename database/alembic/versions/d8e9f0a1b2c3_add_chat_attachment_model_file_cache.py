"""add chat attachment model file cache

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-09-23 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: str | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Persist model-bound temporary media URLs for chat attachments."""
    with op.batch_alter_table("chat_attachments") as batch_op:
        batch_op.add_column(sa.Column("model_file_url", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("model_file_model", sa.String(length=120), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "model_file_expires_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )


def downgrade() -> None:
    """Drop cached model media URL fields."""
    with op.batch_alter_table("chat_attachments") as batch_op:
        batch_op.drop_column("model_file_expires_at")
        batch_op.drop_column("model_file_model")
        batch_op.drop_column("model_file_url")
