"""add course announcements and read state

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-09-19 18:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create course announcements and per-user read markers."""
    op.create_table(
        "course_announcements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_announcements_course_id",
        "course_announcements",
        ["course_id"],
    )
    op.create_index(
        "ix_course_announcements_published_at",
        "course_announcements",
        ["published_at"],
    )
    op.create_index(
        "ix_course_announcements_created_by",
        "course_announcements",
        ["created_by"],
    )

    op.create_table(
        "course_announcement_reads",
        sa.Column("announcement_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "read_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["announcement_id"],
            ["course_announcements.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("announcement_id", "user_id"),
    )
    op.create_index(
        "ix_course_announcement_reads_user_id",
        "course_announcement_reads",
        ["user_id"],
    )


def downgrade() -> None:
    """Drop announcement read markers and announcements."""
    op.drop_index(
        "ix_course_announcement_reads_user_id",
        table_name="course_announcement_reads",
    )
    op.drop_table("course_announcement_reads")
    op.drop_index(
        "ix_course_announcements_created_by",
        table_name="course_announcements",
    )
    op.drop_index(
        "ix_course_announcements_published_at",
        table_name="course_announcements",
    )
    op.drop_index(
        "ix_course_announcements_course_id",
        table_name="course_announcements",
    )
    op.drop_table("course_announcements")
