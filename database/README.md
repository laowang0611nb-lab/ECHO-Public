# ECHO Database

This directory is the database package for ECHO. The API now imports this
package through the `database.*` namespace, and the former backend-local
`app.db`, `app.models`, `app.scripts`, and `apps/api/alembic` entry points have
been removed so there is one source of truth.

## Contents

- `models/`: SQLAlchemy ORM models using the `database.*` import namespace
- `db/`: base metadata, async engine, and session factory
- `alembic/`: the complete migration history plus DB V1 account migrations
- `auth/`: password hashing, access JWT, refresh-token, and session helpers
- `scripts/`: SQLite-to-PostgreSQL migration and verification tooling
- `seeds/`: repeatable demo seed scripts copied from the backend
- `tests/`: isolated model, auth-helper, and migration tests
- `config.py`: database-owned settings entry point
- `requirements.txt`: runtime dependencies for this package
- `requirements-dev.txt`: pytest and Ruff development dependencies

## Current Schema

- Verified at repository version `v0.0.210` on 2026-10-08; `alembic heads` returns one head only.
- Existing history head: `d9e0f1a2b3c4`
- Current workflow head: `e5f6a7b8c9d0`
- Migration scripts: 30.
- Added models: `UserCredential`, `AuthSession`, `TeacherProfile`,
  `StudentProfile`, `ReviewAnswerVersion`, `ReviewRegenerationRun`,
  `ReviewHistoryEntry`, `QuestionItem`, `ExternalResource`, `AIAnalysis`,
  `AIAnalysisEvidence`, `AIAnalysisResult`, `ChatAttachment`
- Added user fields: `username`, `avatar_url`, `status`, `last_login_at`

## Verification

Run from the repository root with the backend virtual environment:

```powershell
python -m pip install -r database\requirements-dev.txt
```

```powershell
apps\api\.venv\Scripts\python.exe -m pytest -c database\pytest.ini database\tests -q
apps\api\.venv\Scripts\python.exe -m ruff check database
apps\api\.venv\Scripts\python.exe -m ruff format --check database
```

Run migrations against an isolated SQLite database:

```powershell
$env:ECHO_DATABASE_URL = "sqlite+aiosqlite:///./echo-db-test.db"
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini upgrade head
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini downgrade d9e0f1a2b3c4
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini upgrade head
```

SQLite remains the fast test database. The local production target has also
been validated with native PostgreSQL 17.6 and pgvector 0.8.0, including the
`vector(1024)` column, HNSW cosine index, full data import, and API health
endpoint checks.

## Runtime Data

Local database data, logs, backups and credentials belong under
`database/runtime/`, which is ignored by Git. Configure the PostgreSQL
connection through `ECHO_DATABASE_URL`; never commit runtime data, credentials
or private keys. Database maintenance scripts are documented in
`scripts/database/README.md`.

## Integration Status

The API, tests, seed command, and Alembic command use this package directly.
There is one migration entry point at `database/alembic.ini`; the legacy
backend-local database directories are no longer active.
