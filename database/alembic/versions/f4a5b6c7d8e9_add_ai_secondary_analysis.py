"""add ai secondary analysis records, evidence, and results

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-09-23 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _analysis_type_enum() -> sa.Enum:
    return sa.Enum(
        "initial",
        "secondary",
        name="ai_analysis_type",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def _analysis_status_enum() -> sa.Enum:
    return sa.Enum(
        "analyzing",
        "completed",
        "failed",
        name="ai_analysis_status",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def _analysis_scope_enum() -> sa.Enum:
    return sa.Enum(
        "whole_class",
        "student_group",
        "custom_students",
        name="ai_analysis_scope",
        native_enum=False,
        length=24,
        create_constraint=True,
    )


def _evidence_source_enum() -> sa.Enum:
    return sa.Enum(
        "initial_analysis",
        "learning_event",
        "mastery_snapshot",
        "quick_check_attempt",
        "conversation_message",
        "review_flag",
        "message_citation",
        "knowledge_chunk",
        name="ai_analysis_evidence_source",
        native_enum=False,
        length=32,
        create_constraint=True,
    )


def upgrade() -> None:
    """Create persisted AI analysis workflow tables."""
    op.create_table(
        "ai_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=True),
        sa.Column("previous_analysis_id", sa.Uuid(), nullable=True),
        sa.Column("analysis_type", _analysis_type_enum(), nullable=False),
        sa.Column("scope", _analysis_scope_enum(), nullable=False),
        sa.Column("student_ids", sa.JSON(), nullable=False),
        sa.Column("time_range_days", sa.Integer(), nullable=False),
        sa.Column("focus", sa.Text(), nullable=True),
        sa.Column(
            "status",
            _analysis_status_enum(),
            server_default="analyzing",
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "time_range_days >= 1",
            name="ck_ai_analyses_time_range_days_positive",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["previous_analysis_id"],
            ["ai_analyses.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_analyses_course_id", "ai_analyses", ["course_id"])
    op.create_index(
        "ix_ai_analyses_knowledge_point_id",
        "ai_analyses",
        ["knowledge_point_id"],
    )
    op.create_index(
        "ix_ai_analyses_previous_analysis_id",
        "ai_analyses",
        ["previous_analysis_id"],
    )
    op.create_index("ix_ai_analyses_created_by", "ai_analyses", ["created_by"])

    op.create_table(
        "ai_analysis_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", _evidence_source_enum(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=True),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=True),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["ai_analyses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_analysis_evidence_analysis_id",
        "ai_analysis_evidence",
        ["analysis_id"],
    )
    op.create_index(
        "ix_ai_analysis_evidence_source_type",
        "ai_analysis_evidence",
        ["source_type"],
    )
    op.create_index(
        "ix_ai_analysis_evidence_student_id",
        "ai_analysis_evidence",
        ["student_id"],
    )
    op.create_index(
        "ix_ai_analysis_evidence_knowledge_point_id",
        "ai_analysis_evidence",
        ["knowledge_point_id"],
    )

    op.create_table(
        "ai_analysis_results",
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("conclusion", sa.Text(), nullable=False),
        sa.Column("root_cause", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("affected_student_ids", sa.JSON(), nullable=False),
        sa.Column("facts", sa.JSON(), nullable=False),
        sa.Column("evidence_summary", sa.JSON(), nullable=False),
        sa.Column("recommendation_payload", sa.JSON(), nullable=False),
        sa.Column("insufficient_evidence", sa.Boolean(), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=True),
        sa.Column("strategy_id", sa.Uuid(), nullable=True),
        sa.Column(
            "generated_at",
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
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["ai_analyses.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["teaching_strategies.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("analysis_id"),
    )
    op.create_index(
        "ix_ai_analysis_results_strategy_id",
        "ai_analysis_results",
        ["strategy_id"],
    )


def downgrade() -> None:
    """Drop persisted AI analysis workflow tables."""
    op.drop_index(
        "ix_ai_analysis_results_strategy_id",
        table_name="ai_analysis_results",
    )
    op.drop_table("ai_analysis_results")

    op.drop_index(
        "ix_ai_analysis_evidence_knowledge_point_id",
        table_name="ai_analysis_evidence",
    )
    op.drop_index(
        "ix_ai_analysis_evidence_student_id",
        table_name="ai_analysis_evidence",
    )
    op.drop_index(
        "ix_ai_analysis_evidence_source_type",
        table_name="ai_analysis_evidence",
    )
    op.drop_index(
        "ix_ai_analysis_evidence_analysis_id",
        table_name="ai_analysis_evidence",
    )
    op.drop_table("ai_analysis_evidence")

    op.drop_index("ix_ai_analyses_created_by", table_name="ai_analyses")
    op.drop_index(
        "ix_ai_analyses_previous_analysis_id",
        table_name="ai_analyses",
    )
    op.drop_index(
        "ix_ai_analyses_knowledge_point_id",
        table_name="ai_analyses",
    )
    op.drop_index("ix_ai_analyses_course_id", table_name="ai_analyses")
    op.drop_table("ai_analyses")
