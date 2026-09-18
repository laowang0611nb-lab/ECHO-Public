"""add teaching strategies and execution plans

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-09-18 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d6e7f8a9b0c1"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _strategy_type_enum() -> sa.Enum:
    return sa.Enum(
        "content_adjustment",
        "teaching_method",
        "differentiated_instruction",
        "assignment_design",
        "classroom_interaction",
        name="teaching_strategy_type",
        native_enum=False,
        length=32,
        create_constraint=True,
    )


def _strategy_priority_enum() -> sa.Enum:
    return sa.Enum(
        "high",
        "medium",
        "low",
        name="teaching_strategy_priority",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def _strategy_status_enum() -> sa.Enum:
    return sa.Enum(
        "suggested",
        "accepted",
        "planned",
        "active",
        "paused",
        "completed",
        "dismissed",
        name="teaching_strategy_status",
        native_enum=False,
        length=24,
        create_constraint=True,
    )


def _strategy_source_enum() -> sa.Enum:
    return sa.Enum(
        "ai_generated",
        "teacher_created",
        name="teaching_strategy_source",
        native_enum=False,
        length=24,
        create_constraint=True,
    )


def _strategy_history_action_enum() -> sa.Enum:
    return sa.Enum(
        "generated",
        "created",
        "updated",
        "accept",
        "dismiss",
        "activate",
        "pause",
        "resume",
        "complete",
        "plan_created",
        "plan_published",
        name="teaching_strategy_history_action",
        native_enum=False,
        length=24,
        create_constraint=True,
    )


def _plan_status_enum() -> sa.Enum:
    return sa.Enum(
        "draft",
        "ready",
        "active",
        "paused",
        "completed",
        "cancelled",
        name="execution_plan_status",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def _target_scope_enum() -> sa.Enum:
    return sa.Enum(
        "whole_class",
        "student_group",
        "custom_students",
        name="plan_target_scope",
        native_enum=False,
        length=24,
        create_constraint=True,
    )


def _task_type_enum() -> sa.Enum:
    return sa.Enum(
        "supplementary_practice",
        "resource_push",
        "classroom_lecture",
        "quick_check",
        "individual_tutoring",
        "project_task",
        name="plan_task_type",
        native_enum=False,
        length=32,
        create_constraint=True,
    )


def _task_status_enum() -> sa.Enum:
    return sa.Enum(
        "not_started",
        "in_progress",
        "completed",
        "overdue",
        "cancelled",
        name="plan_task_status",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def _generation_status_enum() -> sa.Enum:
    return sa.Enum(
        "generating",
        "completed",
        "failed",
        name="execution_plan_generation_status",
        native_enum=False,
        length=16,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "teaching_strategies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type", _strategy_type_enum(), nullable=False),
        sa.Column("priority", _strategy_priority_enum(), nullable=False),
        sa.Column(
            "status",
            _strategy_status_enum(),
            server_default="suggested",
            nullable=False,
        ),
        sa.Column("source", _strategy_source_enum(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("goals", sa.JSON(), nullable=False),
        sa.Column("teaching_methods", sa.JSON(), nullable=False),
        sa.Column("teaching_flow", sa.JSON(), nullable=False),
        sa.Column("personalization_rules", sa.JSON(), nullable=False),
        sa.Column("ai_rules", sa.JSON(), nullable=False),
        sa.Column("expected_effect", sa.JSON(), nullable=False),
        sa.Column("generated_context", sa.JSON(), nullable=False),
        sa.Column("resources_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
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
            "version >= 1", name="ck_teaching_strategies_version_positive"
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_teaching_strategies_course_id",
        "teaching_strategies",
        ["course_id"],
    )
    op.create_index(
        "ix_teaching_strategies_created_by",
        "teaching_strategies",
        ["created_by"],
    )
    op.create_index(
        "ix_teaching_strategies_updated_by",
        "teaching_strategies",
        ["updated_by"],
    )

    op.create_table(
        "strategy_target_knowledge_points",
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["teaching_strategies.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("strategy_id", "knowledge_point_id"),
    )
    op.create_table(
        "strategy_target_students",
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["teaching_strategies.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("strategy_id", "user_id"),
    )
    op.create_table(
        "teaching_strategy_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("action", _strategy_history_action_enum(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_teaching_strategy_versions_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["strategy_id"],
            ["teaching_strategies.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "strategy_id",
            "version",
            name="uq_teaching_strategy_versions_number",
        ),
    )
    op.create_index(
        "ix_teaching_strategy_versions_strategy_id",
        "teaching_strategy_versions",
        ["strategy_id"],
    )
    op.create_index(
        "ix_teaching_strategy_versions_changed_by",
        "teaching_strategy_versions",
        ["changed_by"],
    )

    op.create_table(
        "execution_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("strategy_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status", _plan_status_enum(), server_default="draft", nullable=False
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("target_scope", _target_scope_enum(), nullable=False),
        sa.Column("actions", sa.JSON(), nullable=False),
        sa.Column("plan_parameters", sa.JSON(), nullable=False),
        sa.Column("evaluation_metrics", sa.JSON(), nullable=False),
        sa.Column("resources_json", sa.JSON(), nullable=False),
        sa.Column("teacher_note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
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
            "end_date >= start_date", name="ck_execution_plans_date_range"
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["strategy_id"], ["teaching_strategies.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_execution_plans_course_id", "execution_plans", ["course_id"])
    op.create_index(
        "ix_execution_plans_strategy_id", "execution_plans", ["strategy_id"]
    )
    op.create_index("ix_execution_plans_created_by", "execution_plans", ["created_by"])
    op.create_index("ix_execution_plans_updated_by", "execution_plans", ["updated_by"])

    op.create_table(
        "plan_target_knowledge_points",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["execution_plans.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", "knowledge_point_id"),
    )
    op.create_table(
        "plan_target_students",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["execution_plans.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("plan_id", "user_id"),
    )

    op.create_table(
        "execution_plan_weeks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("week_number", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("knowledge_point_ids", sa.JSON(), nullable=False),
        sa.Column("resources_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "week_number >= 1",
            name="ck_execution_plan_weeks_number_positive",
        ),
        sa.CheckConstraint(
            "end_date >= start_date",
            name="ck_execution_plan_weeks_date_range",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["execution_plans.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "plan_id",
            "week_number",
            name="uq_execution_plan_weeks_number",
        ),
    )
    op.create_index(
        "ix_execution_plan_weeks_plan_id", "execution_plan_weeks", ["plan_id"]
    )

    op.create_table(
        "execution_plan_generations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("status", _generation_status_enum(), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["execution_plans.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_execution_plan_generations_plan_id",
        "execution_plan_generations",
        ["plan_id"],
    )
    op.create_index(
        "ix_execution_plan_generations_created_by",
        "execution_plan_generations",
        ["created_by"],
    )

    op.create_table(
        "plan_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("week_id", sa.Uuid(), nullable=True),
        sa.Column("week_number", sa.Integer(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type", _task_type_enum(), nullable=False),
        sa.Column(
            "status", _task_status_enum(), server_default="not_started", nullable=False
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resources_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
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
            "week_number >= 1", name="ck_plan_tasks_week_number_positive"
        ),
        sa.CheckConstraint(
            "order_index >= 0", name="ck_plan_tasks_order_index_nonnegative"
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["execution_plans.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["week_id"],
            ["execution_plan_weeks.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_tasks_plan_id", "plan_tasks", ["plan_id"])
    op.create_index("ix_plan_tasks_week_id", "plan_tasks", ["week_id"])
    op.create_index("ix_plan_tasks_created_by", "plan_tasks", ["created_by"])

    op.create_table(
        "plan_task_knowledge_points",
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_point_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["plan_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_point_id"],
            ["knowledge_points.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("task_id", "knowledge_point_id"),
    )
    op.create_table(
        "plan_task_target_students",
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["plan_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("task_id", "user_id"),
    )

    with op.batch_alter_table("learning_events") as batch_op:
        batch_op.add_column(sa.Column("plan_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("task_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("week_number", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_learning_events_plan_id_execution_plans",
            "execution_plans",
            ["plan_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_learning_events_task_id_plan_tasks",
            "plan_tasks",
            ["task_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_check_constraint(
            "ck_learning_events_week_number_positive",
            "week_number IS NULL OR week_number >= 1",
        )
    op.create_index("ix_learning_events_plan_id", "learning_events", ["plan_id"])
    op.create_index("ix_learning_events_task_id", "learning_events", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_learning_events_task_id", table_name="learning_events")
    op.drop_index("ix_learning_events_plan_id", table_name="learning_events")
    with op.batch_alter_table("learning_events") as batch_op:
        batch_op.drop_constraint(
            "ck_learning_events_week_number_positive",
            type_="check",
        )
        batch_op.drop_constraint(
            "fk_learning_events_task_id_plan_tasks",
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            "fk_learning_events_plan_id_execution_plans",
            type_="foreignkey",
        )
        batch_op.drop_column("week_number")
        batch_op.drop_column("task_id")
        batch_op.drop_column("plan_id")

    op.drop_table("plan_task_target_students")
    op.drop_table("plan_task_knowledge_points")
    op.drop_index("ix_plan_tasks_created_by", table_name="plan_tasks")
    op.drop_index("ix_plan_tasks_week_id", table_name="plan_tasks")
    op.drop_index("ix_plan_tasks_plan_id", table_name="plan_tasks")
    op.drop_table("plan_tasks")
    op.drop_index(
        "ix_execution_plan_generations_created_by",
        table_name="execution_plan_generations",
    )
    op.drop_index(
        "ix_execution_plan_generations_plan_id",
        table_name="execution_plan_generations",
    )
    op.drop_table("execution_plan_generations")
    op.drop_index("ix_execution_plan_weeks_plan_id", table_name="execution_plan_weeks")
    op.drop_table("execution_plan_weeks")
    op.drop_table("plan_target_students")
    op.drop_table("plan_target_knowledge_points")
    op.drop_index("ix_execution_plans_updated_by", table_name="execution_plans")
    op.drop_index("ix_execution_plans_created_by", table_name="execution_plans")
    op.drop_index("ix_execution_plans_strategy_id", table_name="execution_plans")
    op.drop_index("ix_execution_plans_course_id", table_name="execution_plans")
    op.drop_table("execution_plans")
    op.drop_index(
        "ix_teaching_strategy_versions_changed_by",
        table_name="teaching_strategy_versions",
    )
    op.drop_index(
        "ix_teaching_strategy_versions_strategy_id",
        table_name="teaching_strategy_versions",
    )
    op.drop_table("teaching_strategy_versions")
    op.drop_table("strategy_target_students")
    op.drop_table("strategy_target_knowledge_points")
    op.drop_index("ix_teaching_strategies_updated_by", table_name="teaching_strategies")
    op.drop_index("ix_teaching_strategies_created_by", table_name="teaching_strategies")
    op.drop_index("ix_teaching_strategies_course_id", table_name="teaching_strategies")
    op.drop_table("teaching_strategies")
