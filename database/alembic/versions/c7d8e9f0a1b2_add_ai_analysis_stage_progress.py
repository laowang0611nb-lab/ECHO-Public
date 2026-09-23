"""add ai analysis stage progress

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-09-23 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _stage_enum(name: str) -> sa.Enum:
    return sa.Enum(
        "collecting_previous_analysis",
        "querying_evidence",
        "expanding_knowledge_graph",
        "analyzing_student_impact",
        "generating_recommendation",
        name=name,
        native_enum=False,
        length=40,
        create_constraint=True,
    )


def upgrade() -> None:
    """Persist analysis progress and stage history."""
    with op.batch_alter_table("ai_analyses") as batch_op:
        batch_op.add_column(
            sa.Column("client_request_id", sa.String(length=128), nullable=True)
        )
        batch_op.add_column(
            sa.Column("stage", _stage_enum("ai_analysis_stage"), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "progress_percent",
                sa.Integer(),
                server_default="0",
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("progress_message", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_check_constraint(
            "ck_ai_analyses_progress_percent_range",
            "progress_percent >= 0 AND progress_percent <= 100",
        )
        batch_op.create_unique_constraint(
            "uq_ai_analyses_course_creator_request",
            ["course_id", "created_by", "client_request_id"],
        )

    op.create_table(
        "ai_analysis_stage_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("analysis_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "stage",
            _stage_enum("ai_analysis_stage_event_stage"),
            nullable=False,
        ),
        sa.Column("percent", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "percent >= 0 AND percent <= 100",
            name="ck_ai_analysis_stage_events_percent_range",
        ),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["ai_analyses.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "analysis_id",
            "sequence",
            name="uq_ai_analysis_stage_events_sequence",
        ),
    )
    op.create_index(
        "ix_ai_analysis_stage_events_analysis_id",
        "ai_analysis_stage_events",
        ["analysis_id"],
    )


def downgrade() -> None:
    """Drop stage history and progress columns."""
    op.drop_index(
        "ix_ai_analysis_stage_events_analysis_id",
        table_name="ai_analysis_stage_events",
    )
    op.drop_table("ai_analysis_stage_events")

    with op.batch_alter_table("ai_analyses") as batch_op:
        batch_op.drop_constraint("ai_analysis_stage", type_="check")
        batch_op.drop_constraint(
            "uq_ai_analyses_course_creator_request",
            type_="unique",
        )
        batch_op.drop_constraint(
            "ck_ai_analyses_progress_percent_range",
            type_="check",
        )
        batch_op.drop_column("heartbeat_at")
        batch_op.drop_column("progress_message")
        batch_op.drop_column("progress_percent")
        batch_op.drop_column("stage")
        batch_op.drop_column("client_request_id")
