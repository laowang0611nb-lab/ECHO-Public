# ECHO API

FastAPI backend for the ECHO education agent. The base scaffold follows the
project technology baseline: FastAPI, Pydantic, SQLAlchemy, PostgreSQL, and
pgvector.

## Local development

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Health endpoint:

```text
GET http://127.0.0.1:8000/api/v1/health
```

## Temporary development authentication

Authentication is intentionally limited to identity bootstrap and development
lookup. It does not implement passwords, JWT, sessions, or production access
control.

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

`login` accepts `email`, `display_name`, and `role`. An existing email must
reuse the same role. `me` reads the development-only `X-User-Id` request
header and returns that user, or `401` when the header is absent, malformed,
or unknown.

Replace this mechanism before any deployed or production use.

Tests and lint:

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```

Database migrations:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

Implemented domain models:

- `User`: identity and teacher/student role.
- `Course`: course metadata, join code, draft/published status.
- `CourseMember`: course membership and role.
- `CourseInvite`: invite lifecycle, usage limit, and expiry metadata.

The initial migration is `alembic/versions/441be7725f7c_create_core_identity_and_course_tables.py`.

The scaffold creates the SQLAlchemy async engine but does not connect to
PostgreSQL until a feature that needs the database is invoked.
