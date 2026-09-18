# ECHO Database

This directory is the database package for ECHO. It was copied from the
current backend and extended in place. Some backend files already contain
work-in-progress `database.*` imports; final migration-entry unification is
still pending the backend worktree freeze.

## Contents

- `models/`: SQLAlchemy ORM models using the `database.*` import namespace
- `db/`: base metadata, async engine, and session factory
- `alembic/`: the complete migration history plus DB V1 account migrations
- `auth/`: password hashing, access JWT, refresh-token, and session helpers
- `seeds/`: repeatable demo seed scripts copied from the backend
- `tests/`: isolated model, auth-helper, and migration tests
- `config.py`: database-owned settings entry point
- `requirements.txt`: runtime dependencies for this package
- `requirements-dev.txt`: pytest and Ruff development dependencies

## Current Schema

- Existing history head: `d9e0f1a2b3c4`
- DB V1 account head: `a3c4d5e6f7a8`
- Added models: `UserCredential`, `AuthSession`, `TeacherProfile`,
  `StudentProfile`
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
$env:ECHO_DATABASE_URL = "sqlite+aiosqlite:///C:/absolute/path/echo-db-test.db"
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini upgrade head
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini downgrade d9e0f1a2b3c4
apps\api\.venv\Scripts\python.exe -m alembic -c database\alembic.ini upgrade head
```

SQLite is used only for fast unit and migration checks. The production target
remains PostgreSQL with `pgvector`; a real PostgreSQL run is still required
before this package is accepted as the integrated backend database layer.

## Integration Boundary

Do not overwrite the backend work in progress. The backend may temporarily
contain `database.*` imports while other threads continue; those changes do
not mean every legacy entry point has been unified. Final integration must
leave one Alembic entry point and pass the full regression suite.
