"""create review regeneration workflow

Revision ID: b4c5d6e7f8a9
Revises: a3c4d5e6f7a8
Create Date: 2026-09-18 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "a3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REVIEW_STATUSES = (
    "open",
    "confirmed_correct",
    "marked_incorrect",
    "dismissed",
    "generating",
    "pending_rereview",
    "regeneration_failed",
)
LEGACY_REVIEW_STATUSES = (
    "open",
    "confirmed_correct",
    "marked_incorrect",
    "dismissed",
)
GENERATION_STATUSES = ("idle", "generating", "completed", "failed")
VERSION_SOURCES = ("original", "regenerated", "teacher")
HISTORY_ACTIONS = ("confirm_correct", "mark_incorrect", "dismiss", "regenerate")


def _status_check(values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"status IN ({quoted})"


def upgrade() -> None:
    """Add review version, regeneration, and audit-history persistence."""
    with op.batch_alter_table("ai_review_flags") as batch_op:
        batch_op.drop_constraint("review_status", type_="check")
        batch_op.add_column(
            sa.Column(
                "current_version",
                sa.Integer(),
                server_default=sa.text("1"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "generation_status",
                sa.String(length=16),
                server_default="idle",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "generation_progress",
                sa.Integer(),
                server_default=sa.text("0"),
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("generation_error", sa.Text(), nullable=True))
        batch_op.create_check_constraint(
            "ck_ai_review_flags_review_status",
            _status_check(REVIEW_STATUSES),
        )
        batch_op.create_check_constraint(
            "ck_ai_review_flags_current_version_positive",
            "current_version > 0",
        )
        batch_op.create_check_constraint(
            "ck_ai_review_flags_generation_progress_range",
            "generation_progress >= 0 AND generation_progress <= 100",
        )

    op.create_table(
        "review_answer_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("review_flag_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("knowledge_point_ids", sa.JSON(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                *VERSION_SOURCES,
                name="review_version_source",
                native_enum=False,
                length=16,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "version > 0",
            name="ck_review_answer_versions_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["review_flag_id"],
            ["ai_review_flags.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "review_flag_id",
            "version",
            name="uq_review_answer_versions_flag_version",
        ),
    )
    op.create_index(
        "ix_review_answer_versions_created_by",
        "review_answer_versions",
        ["created_by"],
    )
    op.create_index(
        "ix_review_answer_versions_review_flag_id",
        "review_answer_versions",
        ["review_flag_id"],
    )

    op.create_table(
        "review_regeneration_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("review_flag_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                *GENERATION_STATUSES,
                name="review_generation_run_status",
                native_enum=False,
                length=16,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
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
        sa.CheckConstraint(
            "progress >= 0 AND progress <= 100",
            name="ck_review_regeneration_runs_progress_range",
        ),
        sa.CheckConstraint(
            "base_version > 0 AND version > 0",
            name="ck_review_regeneration_runs_versions_positive",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["review_flag_id"],
            ["ai_review_flags.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_review_regeneration_runs_created_by",
        "review_regeneration_runs",
        ["created_by"],
    )
    op.create_index(
        "ix_review_regeneration_runs_review_flag_id",
        "review_regeneration_runs",
        ["review_flag_id"],
    )

    op.create_table(
        "review_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("review_flag_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "action",
            sa.Enum(
                *HISTORY_ACTIONS,
                name="review_history_action",
                native_enum=False,
                length=24,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "from_status",
            sa.Enum(
                *REVIEW_STATUSES,
                name="review_history_from_status",
                native_enum=False,
                length=32,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "to_status",
            sa.Enum(
                *REVIEW_STATUSES,
                name="review_history_to_status",
                native_enum=False,
                length=32,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("teacher_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("answer_snapshot", sa.Text(), nullable=True),
        sa.Column("corrected_answer_snapshot", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "sequence > 0 AND version > 0",
            name="ck_review_history_sequence_and_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["review_flag_id"],
            ["ai_review_flags.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "review_flag_id",
            "sequence",
            name="uq_review_history_flag_sequence",
        ),
    )
    op.create_index(
        "ix_review_history_review_flag_id",
        "review_history",
        ["review_flag_id"],
    )
    op.create_index("ix_review_history_teacher_id", "review_history", ["teacher_id"])


def downgrade() -> None:
    """Remove regeneration and audit-history persistence."""
    op.drop_index("ix_review_history_teacher_id", table_name="review_history")
    op.drop_index("ix_review_history_review_flag_id", table_name="review_history")
    op.drop_table("review_history")
    op.drop_index(
        "ix_review_regeneration_runs_review_flag_id",
        table_name="review_regeneration_runs",
    )
    op.drop_index(
        "ix_review_regeneration_runs_created_by",
        table_name="review_regeneration_runs",
    )
    op.drop_table("review_regeneration_runs")
    op.drop_index(
        "ix_review_answer_versions_review_flag_id",
        table_name="review_answer_versions",
    )
    op.drop_index(
        "ix_review_answer_versions_created_by",
        table_name="review_answer_versions",
    )
    op.drop_table("review_answer_versions")

    with op.batch_alter_table("ai_review_flags") as batch_op:
        batch_op.drop_constraint(
            "ck_ai_review_flags_generation_progress_range",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_ai_review_flags_current_version_positive",
            type_="check",
        )
        batch_op.drop_constraint(
            "ck_ai_review_flags_review_status",
            type_="check",
        )
        batch_op.drop_column("generation_error")
        batch_op.drop_column("generation_progress")
        batch_op.drop_column("generation_status")
        batch_op.drop_column("current_version")
        batch_op.create_check_constraint(
            "review_status",
            _status_check(LEGACY_REVIEW_STATUSES),
        )
