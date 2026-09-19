import os
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_CONFIG = REPO_ROOT / "database" / "alembic.ini"


def _run_alembic(
    database_url: str, *arguments: str
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


def test_avatar_storage_and_notifications_migration(tmp_path: Path) -> None:
    database_path = tmp_path / "avatar-notifications.db"
    database_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"

    _run_alembic(database_url, "upgrade", "a9b8c7d6e5f4")
    current = _run_alembic(database_url, "current")
    assert "a9b8c7d6e5f4" in current.stdout

    connection = sqlite3.connect(database_path)
    user_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    notification_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(notifications)").fetchall()
    }
    indexes = {
        row[1]
        for row in connection.execute("PRAGMA index_list(notifications)").fetchall()
    }
    connection.close()

    assert "avatar_storage_key" in user_columns
    assert {
        "id",
        "user_id",
        "actor_id",
        "course_id",
        "type",
        "severity",
        "title",
        "body",
        "action_url",
        "payload_json",
        "dedupe_key",
        "read_at",
        "created_at",
    } <= notification_columns
    assert "ix_notifications_user_read_created" in indexes

    _run_alembic(database_url, "downgrade", "e7f8a9b0c1d2")
    connection = sqlite3.connect(database_path)
    user_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    connection.close()
    assert "avatar_storage_key" not in user_columns
    assert "notifications" not in tables
