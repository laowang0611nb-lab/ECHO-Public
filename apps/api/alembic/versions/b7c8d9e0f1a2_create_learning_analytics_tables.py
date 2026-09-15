"""create learning analytics tables

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-09-15 18:55:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create learning events, knowledge state, and mastery snapshots."""
    op.create_table(
        "learning_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=True),
        sa.Column("conversation_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.Uuid(), nullable=True),
        sa.Column(
            "event_type",
            sa.Enum(
                "question_asked",
                "hint_requested",
                "quiz_correct",
                "quiz_wrong",
                "concept_confusion",
                "repeated_error",
                "resolved",
                "teacher_adjustment",
                name="learning_event_type",
                native_enum=False,
                length=32,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_learning_events_course_id", "learning_events", ["course_id"])
    op.create_index("ix_learning_events_user_id", "learning_events", ["user_id"])
    op.create_index(
        "ix_learning_events_knowledge_point_id",
        "learning_events",
        ["knowledge_point_id"],
    )
    op.create_index(
        "ix_learning_events_conversation_id",
        "learning_events",
        ["conversation_id"],
    )
    op.create_index("ix_learning_events_message_id", "learning_events", ["message_id"])

    op.create_table(
        "student_knowledge_states",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
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
            "score >= 0 AND score <= 100",
            name="ck_student_knowledge_states_score_range",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_id",
            "user_id",
            "knowledge_point_id",
            name="uq_student_knowledge_state_identity",
        ),
    )
    op.create_index(
        "ix_student_knowledge_states_course_id",
        "student_knowledge_states",
        ["course_id"],
    )
    op.create_index(
        "ix_student_knowledge_states_user_id",
        "student_knowledge_states",
        ["user_id"],
    )
    op.create_index(
        "ix_student_knowledge_states_knowledge_point_id",
        "student_knowledge_states",
        ["knowledge_point_id"],
    )

    op.create_table(
        "mastery_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.Column("source_event_id", sa.Uuid(), nullable=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100",
            name="ck_mastery_snapshots_score_range",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_event_id"],
            ["learning_events.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mastery_snapshots_course_id", "mastery_snapshots", ["course_id"])
    op.create_index("ix_mastery_snapshots_user_id", "mastery_snapshots", ["user_id"])
    op.create_index(
        "ix_mastery_snapshots_knowledge_point_id",
        "mastery_snapshots",
        ["knowledge_point_id"],
    )
    op.create_index(
        "ix_mastery_snapshots_source_event_id",
        "mastery_snapshots",
        ["source_event_id"],
    )


def downgrade() -> None:
    """Drop learning analytics tables."""
    op.drop_index("ix_mastery_snapshots_source_event_id", table_name="mastery_snapshots")
    op.drop_index(
        "ix_mastery_snapshots_knowledge_point_id",
        table_name="mastery_snapshots",
    )
    op.drop_index("ix_mastery_snapshots_user_id", table_name="mastery_snapshots")
    op.drop_index("ix_mastery_snapshots_course_id", table_name="mastery_snapshots")
    op.drop_table("mastery_snapshots")
    op.drop_index(
        "ix_student_knowledge_states_knowledge_point_id",
        table_name="student_knowledge_states",
    )
    op.drop_index(
        "ix_student_knowledge_states_user_id",
        table_name="student_knowledge_states",
    )
    op.drop_index(
        "ix_student_knowledge_states_course_id",
        table_name="student_knowledge_states",
    )
    op.drop_table("student_knowledge_states")
    op.drop_index("ix_learning_events_message_id", table_name="learning_events")
    op.drop_index("ix_learning_events_conversation_id", table_name="learning_events")
    op.drop_index(
        "ix_learning_events_knowledge_point_id",
        table_name="learning_events",
    )
    op.drop_index("ix_learning_events_user_id", table_name="learning_events")
    op.drop_index("ix_learning_events_course_id", table_name="learning_events")
    op.drop_table("learning_events")
