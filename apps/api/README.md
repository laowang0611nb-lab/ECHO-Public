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

## Course management

```text
POST /api/v1/courses
GET  /api/v1/courses
POST /api/v1/courses/join
GET  /api/v1/courses/{course_id}
POST /api/v1/courses/{course_id}/publish
GET  /api/v1/courses/{course_id}/members
```

Teachers create draft courses with a generated eight-character code and become
course members automatically. Course lists and detail reads are restricted to
members. Student accounts join idempotently by submitting the course code and
can view member lists. Teacher accounts cannot join by code. Publishing
must happen before students can join. Chat remains out of scope for this step.

## Document uploads

```text
POST /api/v1/courses/{course_id}/documents
```

Course teachers can upload PDF files. The default development adapter stores
files under `tmp/uploads`; the storage interface is isolated so MinIO or OSS
can replace it later. Parsing and page extraction are not implemented yet.

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
- `Document`: uploaded course material metadata and parse status.
- `DocumentPage`: extracted text and page-level metadata.

Migrations:

- `441be7725f7c`: core identity and course tables.
- `8b1c2d3e4f50`: document and document page tables.

The scaffold creates the SQLAlchemy async engine but does not connect to
PostgreSQL until a feature that needs the database is invoked.
