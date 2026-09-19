"""add chat message lifecycle and quick check attempts

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-09-19 08:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.add_column(
            sa.Column("client_request_id", sa.String(length=128), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "status",
                sa.Enum(
                    "sending",
                    "sent",
                    "streaming",
                    "complete",
                    "interrupted",
                    "failed",
                    name="message_status",
                    native_enum=False,
                    length=16,
                    create_constraint=True,
                ),
                server_default="complete",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "blocks",
                sa.JSON(),
                server_default=sa.text("'[]'"),
                nullable=False,
            )
        )
        batch_op.create_unique_constraint(
            "uq_messages_conversation_client_request_id",
            ["conversation_id", "client_request_id"],
        )

    op.create_table(
        "quick_check_attempts",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("course_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("question_item_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("conversation_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("message_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("attempt_id", sa.String(length=128), nullable=False),
        sa.Column("selected_option_id", sa.String(length=64), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column(
            "response_json",
            sa.JSON(),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["messages.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["question_item_id"],
            ["question_items.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "attempt_id",
            name="uq_quick_check_attempts_user_attempt",
        ),
    )
    op.create_index(
        op.f("ix_quick_check_attempts_conversation_id"),
        "quick_check_attempts",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quick_check_attempts_course_id"),
        "quick_check_attempts",
        ["course_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quick_check_attempts_knowledge_point_id"),
        "quick_check_attempts",
        ["knowledge_point_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quick_check_attempts_message_id"),
        "quick_check_attempts",
        ["message_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quick_check_attempts_question_item_id"),
        "quick_check_attempts",
        ["question_item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_quick_check_attempts_user_id"),
        "quick_check_attempts",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_quick_check_attempts_user_id"),
        table_name="quick_check_attempts",
    )
    op.drop_index(
        op.f("ix_quick_check_attempts_question_item_id"),
        table_name="quick_check_attempts",
    )
    op.drop_index(
        op.f("ix_quick_check_attempts_message_id"),
        table_name="quick_check_attempts",
    )
    op.drop_index(
        op.f("ix_quick_check_attempts_knowledge_point_id"),
        table_name="quick_check_attempts",
    )
    op.drop_index(
        op.f("ix_quick_check_attempts_course_id"),
        table_name="quick_check_attempts",
    )
    op.drop_index(
        op.f("ix_quick_check_attempts_conversation_id"),
        table_name="quick_check_attempts",
    )
    op.drop_table("quick_check_attempts")

    with op.batch_alter_table("messages") as batch_op:
        batch_op.drop_constraint(
            "uq_messages_conversation_client_request_id",
            type_="unique",
        )
        batch_op.drop_constraint("message_status", type_="check")
        batch_op.drop_column("blocks")
        batch_op.drop_column("status")
        batch_op.drop_column("client_request_id")
