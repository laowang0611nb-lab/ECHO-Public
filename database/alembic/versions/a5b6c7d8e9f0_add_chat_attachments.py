"""add chat attachments

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-09-23 11:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: str | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _attachment_kind_enum() -> sa.Enum:
    return sa.Enum(
        "image",
        "audio",
        "video",
        name="chat_attachment_kind",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def upgrade() -> None:
    """Create persisted chat attachment metadata."""
    op.create_table(
        "chat_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column("kind", _attachment_kind_enum(), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "size_bytes >= 0",
            name="ck_chat_attachments_size_bytes_nonnegative",
        ),
        sa.CheckConstraint(
            "width IS NULL OR width > 0",
            name="ck_chat_attachments_width_positive",
        ),
        sa.CheckConstraint(
            "height IS NULL OR height > 0",
            name="ck_chat_attachments_height_positive",
        ),
        sa.CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds >= 0",
            name="ck_chat_attachments_duration_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(
        "ix_chat_attachments_user_id",
        "chat_attachments",
        ["user_id"],
    )
    op.create_index(
        "ix_chat_attachments_conversation_id",
        "chat_attachments",
        ["conversation_id"],
    )
    op.create_index(
        "ix_chat_attachments_message_id",
        "chat_attachments",
        ["message_id"],
    )
    op.create_index(
        "ix_chat_attachments_storage_key",
        "chat_attachments",
        ["storage_key"],
        unique=True,
    )


def downgrade() -> None:
    """Drop persisted chat attachment metadata."""
    op.drop_index(
        "ix_chat_attachments_storage_key",
        table_name="chat_attachments",
    )
    op.drop_index(
        "ix_chat_attachments_message_id",
        table_name="chat_attachments",
    )
    op.drop_index(
        "ix_chat_attachments_conversation_id",
        table_name="chat_attachments",
    )
    op.drop_index(
        "ix_chat_attachments_user_id",
        table_name="chat_attachments",
    )
    op.drop_table("chat_attachments")
