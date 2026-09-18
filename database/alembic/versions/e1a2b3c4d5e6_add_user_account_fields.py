"""add user account fields

Revision ID: e1a2b3c4d5e6
Revises: d9e0f1a2b3c4
Create Date: 2026-09-18 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1a2b3c4d5e6"
down_revision: str | None = "d9e0f1a2b3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add account status and optional identity fields to existing users."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("username", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("avatar_url", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "status",
                sa.Enum(
                    "active",
                    "disabled",
                    "pending",
                    name="user_status",
                    native_enum=False,
                    length=16,
                    create_constraint=True,
                ),
                server_default=sa.text("'active'"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True)
        )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_status", "users", ["status"], unique=False)


def downgrade() -> None:
    """Remove account fields while preserving the original user identity."""
    op.drop_index("ix_users_status", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("user_status", type_="check")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("status")
        batch_op.drop_column("avatar_url")
        batch_op.drop_column("username")
