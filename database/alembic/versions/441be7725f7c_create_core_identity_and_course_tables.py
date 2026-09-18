"""create core identity and course tables

Revision ID: 441be7725f7c
Revises:
Create Date: 2026-09-15 17:24:10.259204

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "441be7725f7c"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create identity and course foundation tables."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "teacher",
                "student",
                name="user_role",
                native_enum=False,
                length=16,
                create_constraint=True,
            ),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "courses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("term", sa.String(length=80), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                name="course_status",
                native_enum=False,
                length=16,
                create_constraint=True,
            ),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=16), nullable=False),
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
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)
    op.create_index("ix_courses_created_by", "courses", ["created_by"], unique=False)

    op.create_table(
        "course_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "teacher",
                "student",
                name="course_member_role",
                native_enum=False,
                length=16,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_id", "user_id", name="uq_course_members_course_user"
        ),
    )
    op.create_index("ix_course_members_course_id", "course_members", ["course_id"])
    op.create_index("ix_course_members_user_id", "course_members", ["user_id"])

    op.create_table(
        "course_invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column(
            "used_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "max_uses IS NULL OR max_uses > 0",
            name="ck_course_invites_max_uses_positive",
        ),
        sa.CheckConstraint(
            "used_count >= 0",
            name="ck_course_invites_used_count_nonnegative",
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_course_invites_code", "course_invites", ["code"], unique=True)
    op.create_index(
        "ix_course_invites_course_id",
        "course_invites",
        ["course_id"],
    )
    op.create_index(
        "ix_course_invites_created_by",
        "course_invites",
        ["created_by"],
    )


def downgrade() -> None:
    """Drop identity and course foundation tables."""
    op.drop_index("ix_course_invites_created_by", table_name="course_invites")
    op.drop_index("ix_course_invites_course_id", table_name="course_invites")
    op.drop_index("ix_course_invites_code", table_name="course_invites")
    op.drop_table("course_invites")
    op.drop_index("ix_course_members_user_id", table_name="course_members")
    op.drop_index("ix_course_members_course_id", table_name="course_members")
    op.drop_table("course_members")
    op.drop_index("ix_courses_created_by", table_name="courses")
    op.drop_index("ix_courses_code", table_name="courses")
    op.drop_table("courses")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
