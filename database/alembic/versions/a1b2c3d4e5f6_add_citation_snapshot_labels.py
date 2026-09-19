"""add citation snapshot labels

Revision ID: a1b2c3d4e5f6
Revises: f8a9b0c1d2e3
Create Date: 2026-09-19 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f8a9b0c1d2e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("message_citations") as batch_op:
        batch_op.add_column(sa.Column("document_name", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("chapter_title", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("message_citations") as batch_op:
        batch_op.drop_column("chapter_title")
        batch_op.drop_column("document_name")
