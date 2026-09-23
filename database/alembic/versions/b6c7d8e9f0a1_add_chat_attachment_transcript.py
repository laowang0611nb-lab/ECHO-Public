"""add chat attachment transcript

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-09-23 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: str | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Persist optional local ASR transcript for an attachment."""
    with op.batch_alter_table("chat_attachments") as batch_op:
        batch_op.add_column(sa.Column("transcript", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove persisted attachment transcript."""
    with op.batch_alter_table("chat_attachments") as batch_op:
        batch_op.drop_column("transcript")
