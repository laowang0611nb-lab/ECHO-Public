import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

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


def _json_value(value: object) -> object:
    if isinstance(value, str):
        return json.loads(value)
    return value


def test_legacy_acceptance_data_is_backfilled(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy-acceptance.db"
    database_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    _run_alembic(database_url, "upgrade", "b0c1d2e3f4a5")

    (
        teacher_id,
        student_id,
        course_id,
        document_id,
        page_id,
        chunk_id,
        conversation_id,
        message_id,
        citation_id,
        strategy_id,
        plan_id,
        week_id,
        task_id,
        flag_id,
        version_id,
        review_notification_id,
        member_notification_id,
    ) = [str(uuid4()) for _ in range(17)]

    connection = sqlite3.connect(database_path)
    connection.execute(
        "INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)",
        (teacher_id, "legacy-teacher@example.com", "Legacy Teacher", "teacher"),
    )
    connection.execute(
        "INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)",
        (student_id, "legacy-student@example.com", "Legacy Student", "student"),
    )
    connection.execute(
        "INSERT INTO courses (id, name, code, created_by) VALUES (?, ?, ?, ?)",
        (course_id, "Legacy Course", "ACC001", teacher_id),
    )
    connection.execute(
        """
        INSERT INTO documents (
            id, course_id, uploaded_by, original_name, storage_key,
            content_type, size_bytes, status, page_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            document_id,
            course_id,
            teacher_id,
            "legacy.pdf",
            "legacy/legacy.pdf",
            "application/pdf",
            100,
            "ready",
            1,
        ),
    )
    connection.execute(
        """
        INSERT INTO document_pages (id, document_id, page_number, text, char_count)
        VALUES (?, ?, ?, ?, ?)
        """,
        (page_id, document_id, 1, "Legacy page evidence", 20),
    )
    connection.execute(
        """
        INSERT INTO knowledge_chunks (
            id, course_id, document_id, chunk_index, page_start, page_end,
            content, char_count, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            chunk_id,
            course_id,
            document_id,
            0,
            1,
            1,
            "Real chunk quote from legacy material",
            38,
            "{}",
        ),
    )
    connection.execute(
        "INSERT INTO conversations (id, course_id, user_id) VALUES (?, ?, ?)",
        (conversation_id, course_id, student_id),
    )
    connection.execute(
        """
        INSERT INTO messages (id, conversation_id, role, status, content, blocks)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (message_id, conversation_id, "assistant", "complete", "Legacy answer", "[]"),
    )
    connection.execute(
        """
        INSERT INTO message_citations (
            id, message_id, citation_index, chunk_id, document_id,
            page_start, page_end, quote
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (citation_id, message_id, 1, chunk_id, document_id, 1, 1, ""),
    )
    connection.execute(
        """
        INSERT INTO teaching_strategies (
            id, course_id, title, description, type, priority, status, source,
            version, goals, teaching_methods, teaching_flow,
            personalization_rules, ai_rules, expected_effect, generated_context,
            resources_json, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            strategy_id,
            course_id,
            "Legacy Strategy",
            "Legacy",
            "content_adjustment",
            "high",
            "active",
            "ai_generated",
            1,
            "[]",
            "[]",
            "[]",
            "[]",
            "[]",
            "{}",
            "{}",
            json.dumps([{"id": document_id, "type": "textbook"}]),
            teacher_id,
            teacher_id,
        ),
    )
    connection.execute(
        """
        INSERT INTO execution_plans (
            id, course_id, strategy_id, title, description, status,
            start_date, end_date, target_scope, actions, plan_parameters,
            evaluation_metrics, resources_json, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            plan_id,
            course_id,
            strategy_id,
            "Legacy Plan",
            "Legacy",
            "active",
            "2026-01-01",
            "2026-02-01",
            "whole_class",
            json.dumps(["lecture", "practice", "review"]),
            "{}",
            "[]",
            json.dumps([{"id": document_id, "type": "textbook"}]),
            teacher_id,
            teacher_id,
        ),
    )
    connection.execute(
        """
        INSERT INTO execution_plan_weeks (
            id, plan_id, week_number, start_date, end_date, content,
            knowledge_point_ids, resources_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            week_id,
            plan_id,
            1,
            "2026-01-01",
            "2026-01-07",
            "Legacy week",
            "[]",
            json.dumps([{"id": document_id, "type": "textbook"}]),
        ),
    )
    connection.execute(
        """
        INSERT INTO plan_tasks (
            id, plan_id, week_id, week_number, order_index, title, description,
            type, status, resources_json, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            plan_id,
            week_id,
            1,
            0,
            "Legacy Task",
            "Legacy",
            "classroom_lecture",
            "not_started",
            json.dumps([{"id": document_id, "type": "textbook"}]),
            teacher_id,
        ),
    )
    connection.execute(
        """
        INSERT INTO ai_review_flags (
            id, course_id, conversation_id, message_id, student_id,
            reason, severity, status, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            flag_id,
            course_id,
            conversation_id,
            message_id,
            student_id,
            "missing_course_basis",
            "high",
            "open",
            "{}",
        ),
    )
    connection.execute(
        """
        INSERT INTO review_answer_versions (
            id, review_flag_id, version, answer, knowledge_point_ids,
            citations, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            version_id,
            flag_id,
            1,
            "Legacy answer",
            "[]",
            json.dumps(
                [
                    {
                        "document_id": document_id,
                        "chunk_id": chunk_id,
                        "page_start": 1,
                        "page_end": 1,
                    }
                ]
            ),
            "original",
        ),
    )
    connection.execute(
        """
        INSERT INTO notifications (
            id, user_id, course_id, type, severity, title, body,
            action_url, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            review_notification_id,
            teacher_id,
            course_id,
            "ai_high_risk",
            "critical",
            "Review",
            "Review body",
            f"/review-flags/{flag_id}",
            "{}",
        ),
    )
    connection.execute(
        """
        INSERT INTO notifications (
            id, user_id, course_id, type, severity, title, body,
            action_url, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            member_notification_id,
            teacher_id,
            course_id,
            "course_member_change",
            "info",
            "Member",
            "Member body",
            f"/courses/{course_id}/students",
            "{}",
        ),
    )
    connection.commit()
    connection.close()

    _run_alembic(database_url, "upgrade", "head")

    connection = sqlite3.connect(database_path)
    assert connection.execute(
        "SELECT code FROM courses WHERE id = ?",
        (course_id,),
    ).fetchone() == ("ACC00001",)
    assert connection.execute(
        "SELECT quote FROM message_citations WHERE id = ?",
        (citation_id,),
    ).fetchone() == ("Real chunk quote from legacy material",)

    version_citations = _json_value(
        connection.execute(
            "SELECT citations FROM review_answer_versions WHERE id = ?",
            (version_id,),
        ).fetchone()[0]
    )
    assert version_citations[0]["quote"] == "Real chunk quote from legacy material"

    for table_name in (
        "teaching_strategies",
        "execution_plans",
        "execution_plan_weeks",
        "plan_tasks",
    ):
        row_id = {
            "teaching_strategies": strategy_id,
            "execution_plans": plan_id,
            "execution_plan_weeks": week_id,
            "plan_tasks": task_id,
        }[table_name]
        resources = _json_value(
            connection.execute(
                f"SELECT resources_json FROM {table_name} WHERE id = ?",
                (row_id,),
            ).fetchone()[0]
        )
        assert resources[0]["resource_type"] == "textbook"
        assert resources[0]["title"] == "教材资料"

    actions = _json_value(
        connection.execute(
            "SELECT actions FROM execution_plans WHERE id = ?",
            (plan_id,),
        ).fetchone()[0]
    )
    assert actions == [
        "classroom_lecture",
        "supplementary_practice",
        "individual_tutoring",
    ]

    review_action = connection.execute(
        "SELECT action_url FROM notifications WHERE id = ?",
        (review_notification_id,),
    ).fetchone()[0]
    member_action = connection.execute(
        "SELECT action_url FROM notifications WHERE id = ?",
        (member_notification_id,),
    ).fetchone()[0]
    connection.close()

    assert review_action == (
        f"/ai-review/pending?reviewId={flag_id}&courseId={course_id}"
    )
    assert member_action == f"/courses/{course_id}?tab=students"
