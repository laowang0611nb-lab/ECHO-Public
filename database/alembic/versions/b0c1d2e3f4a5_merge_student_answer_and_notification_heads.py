"""merge student answer and notification heads

Revision ID: b0c1d2e3f4a5
Revises: a1b2c3d4e5f6, a9b8c7d6e5f4
Create Date: 2026-09-19 17:00:00.000000

"""

from collections.abc import Sequence

revision: str = "b0c1d2e3f4a5"
down_revision: tuple[str, str] | None = ("a1b2c3d4e5f6", "a9b8c7d6e5f4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
