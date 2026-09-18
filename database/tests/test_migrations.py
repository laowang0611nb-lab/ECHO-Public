import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

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


def test_existing_review_flag_survives_workflow_upgrade(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-review.db"
    database_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    _run_alembic(database_url, "upgrade", "a3c4d5e6f7a8")

    user_id, course_id, conversation_id, message_id, flag_id = [
        str(uuid4()) for _ in range(5)
    ]
    connection = sqlite3.connect(database_path)
    connection.execute(
        "INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)",
        (user_id, "legacy@example.com", "Legacy Student", "student"),
    )
    connection.execute(
        "INSERT INTO courses (id, name, code, created_by) VALUES (?, ?, ?, ?)",
        (course_id, "Legacy Course", "LEGACY01", user_id),
    )
    connection.execute(
        "INSERT INTO conversations (id, course_id, user_id) VALUES (?, ?, ?)",
        (conversation_id, course_id, user_id),
    )
    connection.execute(
        "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
        (message_id, conversation_id, "assistant", "Legacy answer"),
    )
    connection.execute(
        "INSERT INTO ai_review_flags ("
        "id, course_id, conversation_id, message_id, student_id, reason, severity, status, details"
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            flag_id,
            course_id,
            conversation_id,
            message_id,
            user_id,
            "missing_course_basis",
            "high",
            "open",
            "{}",
        ),
    )
    connection.commit()
    connection.close()

    _run_alembic(database_url, "upgrade", "head")

    connection = sqlite3.connect(database_path)
    migrated = connection.execute(
        "SELECT status, current_version, generation_status FROM ai_review_flags WHERE id = ?",
        (flag_id,),
    ).fetchone()
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    connection.close()

    assert migrated == ("open", 1, "idle")
    assert {
        "review_answer_versions",
        "review_regeneration_runs",
        "review_history",
    } <= tables


def test_migration_head_can_downgrade_and_upgrade(tmp_path: Path) -> None:
    database_url = f"sqlite+aiosqlite:///{(tmp_path / 'echo.db').as_posix()}"

    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current")
    assert "c5d6e7f8a9b0 (head)" in current.stdout

    _run_alembic(database_url, "downgrade", "d9e0f1a2b3c4")
    _run_alembic(database_url, "upgrade", "head")
    current = _run_alembic(database_url, "current")
    assert "c5d6e7f8a9b0 (head)" in current.stdout
