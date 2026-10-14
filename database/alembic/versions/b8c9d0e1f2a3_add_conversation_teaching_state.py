"""add conversation teaching dialog state

Revision ID: b8c9d0e1f2a3
Revises: e5f6a7b8c9d0
Create Date: 2026-10-11 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversation_teaching_states",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("conversation_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("topic_key", sa.String(length=255), nullable=False),
        sa.Column(
            "intent",
            sa.Enum(
                "chitchat",
                "concept",
                "exercise",
                "ambiguous",
                "attempt",
                "answer_request",
                name="teaching_intent",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "stage",
            sa.Enum(
                "idle",
                "clarify_waiting",
                "awaiting_attempt",
                "hinting",
                "explaining",
                "ready_for_quick_check",
                "completed",
                name="teaching_stage",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            server_default="idle",
            nullable=False,
        ),
        sa.Column("hint_level", sa.Integer(), server_default="0", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "consecutive_incorrect_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "answer_requested",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("pending_question", sa.Text(), nullable=True),
        sa.Column("last_user_message_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("last_assistant_message_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("quick_check_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("state_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "hint_level >= 0",
            name="ck_conversation_teaching_states_hint_level_nonnegative",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0",
            name="ck_conversation_teaching_states_attempt_count_nonnegative",
        ),
        sa.CheckConstraint(
            "consecutive_incorrect_count >= 0",
            name="ck_conversation_teaching_states_incorrect_count_nonnegative",
        ),
        sa.CheckConstraint(
            "state_version >= 1",
            name="ck_conversation_teaching_states_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["last_user_message_id"],
            ["messages.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["last_assistant_message_id"],
            ["messages.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["quick_check_id"],
            ["question_items.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "topic_key",
            name="uq_conversation_teaching_states_topic",
        ),
    )
    op.create_index(
        op.f("ix_conversation_teaching_states_conversation_id"),
        "conversation_teaching_states",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_conversation_teaching_states_knowledge_point_id"),
        "conversation_teaching_states",
        ["knowledge_point_id"],
        unique=False,
    )

    op.create_table(
        "teaching_dialog_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("state_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("message_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column(
            "from_stage",
            sa.Enum(
                "idle",
                "clarify_waiting",
                "awaiting_attempt",
                "hinting",
                "explaining",
                "ready_for_quick_check",
                "completed",
                name="teaching_event_from_stage",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column(
            "to_stage",
            sa.Enum(
                "idle",
                "clarify_waiting",
                "awaiting_attempt",
                "hinting",
                "explaining",
                "ready_for_quick_check",
                "completed",
                name="teaching_event_to_stage",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column(
            "metadata_json",
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
            ["message_id"],
            ["messages.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["state_id"],
            ["conversation_teaching_states.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_teaching_dialog_events_state_id"),
        "teaching_dialog_events",
        ["state_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_teaching_dialog_events_state_id"),
        table_name="teaching_dialog_events",
    )
    op.drop_table("teaching_dialog_events")
    op.drop_index(
        op.f("ix_conversation_teaching_states_knowledge_point_id"),
        table_name="conversation_teaching_states",
    )
    op.drop_index(
        op.f("ix_conversation_teaching_states_conversation_id"),
        table_name="conversation_teaching_states",
    )
    op.drop_table("conversation_teaching_states")
