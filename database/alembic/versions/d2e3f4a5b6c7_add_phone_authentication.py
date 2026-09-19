"""add phone authentication fields and verification claims

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-09-19 17:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add unique phone identity and one-time SMS verification claims."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("phone", sa.String(length=20), nullable=True))
        batch_op.create_index("ix_users_phone", ["phone"], unique=True)

    op.create_table(
        "phone_verification_claims",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("jti"),
    )
    op.create_index("ix_phone_verification_claims_phone", "phone_verification_claims", ["phone"])
    op.create_index(
        "ix_phone_verification_claims_purpose",
        "phone_verification_claims",
        ["purpose"],
    )
    op.create_index(
        "ix_phone_verification_claims_expires_at",
        "phone_verification_claims",
        ["expires_at"],
    )


def downgrade() -> None:
    """Drop SMS verification claims and phone identity."""
    op.drop_index(
        "ix_phone_verification_claims_expires_at",
        table_name="phone_verification_claims",
    )
    op.drop_index(
        "ix_phone_verification_claims_purpose",
        table_name="phone_verification_claims",
    )
    op.drop_index(
        "ix_phone_verification_claims_phone",
        table_name="phone_verification_claims",
    )
    op.drop_table("phone_verification_claims")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_phone")
        batch_op.drop_column("phone")
