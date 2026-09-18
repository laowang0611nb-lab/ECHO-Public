"""create ai review flags

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-09-16 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create AI review flags for assistant answers."""
    op.create_table(
        "ai_review_flags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column(
            "reason",
            sa.Enum(
                "missing_course_basis",
                "outside_material_heavy",
                "repeated_follow_up",
                "student_not_resolved",
                "teacher_rule_violation",
                name="review_reason",
                native_enum=False,
                length=40,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "severity",
            sa.Enum(
                "low",
                "medium",
                "high",
                name="review_severity",
                native_enum=False,
                length=16,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "confirmed_correct",
                "marked_incorrect",
                "dismissed",
                name="review_status",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("teacher_note", sa.Text(), nullable=True),
        sa.Column("corrected_answer", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id",
            "reason",
            name="uq_ai_review_flags_message_reason",
        ),
    )
    op.create_index("ix_ai_review_flags_course_id", "ai_review_flags", ["course_id"])
    op.create_index(
        "ix_ai_review_flags_conversation_id",
        "ai_review_flags",
        ["conversation_id"],
    )
    op.create_index("ix_ai_review_flags_message_id", "ai_review_flags", ["message_id"])
    op.create_index("ix_ai_review_flags_student_id", "ai_review_flags", ["student_id"])
    op.create_index(
        "ix_ai_review_flags_reviewed_by", "ai_review_flags", ["reviewed_by"]
    )


def downgrade() -> None:
    """Drop AI review flags."""
    op.drop_index("ix_ai_review_flags_reviewed_by", table_name="ai_review_flags")
    op.drop_index("ix_ai_review_flags_student_id", table_name="ai_review_flags")
    op.drop_index("ix_ai_review_flags_message_id", table_name="ai_review_flags")
    op.drop_index("ix_ai_review_flags_conversation_id", table_name="ai_review_flags")
    op.drop_index("ix_ai_review_flags_course_id", table_name="ai_review_flags")
    op.drop_table("ai_review_flags")
