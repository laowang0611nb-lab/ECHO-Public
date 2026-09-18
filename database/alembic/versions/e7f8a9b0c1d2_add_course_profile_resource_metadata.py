"""add course, teacher profile, and resource metadata fields

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-09-18 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "d6e7f8a9b0c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add editable course/profile/resource metadata without touching history."""
    with op.batch_alter_table("courses") as batch_op:
        batch_op.add_column(
            sa.Column("course_type", sa.String(length=80), nullable=True)
        )
        batch_op.add_column(
            sa.Column("target_audience", sa.String(length=200), nullable=True)
        )
        batch_op.add_column(
            sa.Column("expected_student_count", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.drop_constraint("course_status", type_="check")
        batch_op.create_check_constraint(
            "course_status",
            "status IN ('draft', 'published', 'archived')",
        )
        batch_op.create_check_constraint(
            "ck_courses_expected_student_count_positive",
            "expected_student_count IS NULL OR expected_student_count > 0",
        )

    with op.batch_alter_table("teacher_profiles") as batch_op:
        batch_op.add_column(
            sa.Column(
                "teaching_fields",
                sa.JSON(),
                server_default=sa.text("'[]'"),
                nullable=False,
            )
        )
        batch_op.create_unique_constraint(
            "uq_teacher_profiles_employee_no",
            ["employee_no"],
        )

    with op.batch_alter_table("documents") as batch_op:
        batch_op.add_column(
            sa.Column("display_name", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(sa.Column("summary", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "keywords",
                sa.JSON(),
                server_default=sa.text("'[]'"),
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("author", sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column("publisher", sa.String(length=255), nullable=True)
        )
        batch_op.add_column(
            sa.Column("copyright", sa.String(length=255), nullable=True)
        )


def downgrade() -> None:
    """Remove the optional course/profile/resource metadata fields."""
    with op.batch_alter_table("documents") as batch_op:
        batch_op.drop_column("copyright")
        batch_op.drop_column("publisher")
        batch_op.drop_column("author")
        batch_op.drop_column("keywords")
        batch_op.drop_column("summary")
        batch_op.drop_column("display_name")

    with op.batch_alter_table("teacher_profiles") as batch_op:
        batch_op.drop_constraint(
            "uq_teacher_profiles_employee_no",
            type_="unique",
        )
        batch_op.drop_column("teaching_fields")

    with op.batch_alter_table("courses") as batch_op:
        batch_op.drop_constraint(
            "ck_courses_expected_student_count_positive",
            type_="check",
        )
        batch_op.drop_constraint("course_status", type_="check")
        batch_op.create_check_constraint(
            "course_status",
            "status IN ('draft', 'published')",
        )
        batch_op.drop_column("archived_at")
        batch_op.drop_column("expected_student_count")
        batch_op.drop_column("target_audience")
        batch_op.drop_column("course_type")
