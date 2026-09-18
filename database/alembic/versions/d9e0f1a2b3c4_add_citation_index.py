"""add citation index

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-09-16 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: str | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Persist the original source index used in an assistant answer."""
    op.add_column(
        "message_citations",
        sa.Column("citation_index", sa.Integer(), server_default="1", nullable=False),
    )


def downgrade() -> None:
    """Drop the persisted citation index."""
    op.drop_column("message_citations", "citation_index")
