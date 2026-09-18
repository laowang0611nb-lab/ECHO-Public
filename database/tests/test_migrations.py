import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_CONFIG = REPO_ROOT / "database" / "alembic.ini"


def _run_alembic(
    database_url: str,
    *arguments: str,
) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["ECHO_DATABASE_URL"] = database_url
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            str(ALEMBIC_CONFIG),
            *arguments,
        ],
        cwd=REPO_ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_migration_head_can_downgrade_and_upgrade(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{(tmp_path / 'echo.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current")
    assert "a3c4d5e6f7a8 (head)" in current.stdout

    _run_alembic(database_url, "downgrade", "d9e0f1a2b3c4")
    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current")
    assert "a3c4d5e6f7a8 (head)" in current.stdout
