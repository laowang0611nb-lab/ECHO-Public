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

Tests and lint:

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```

The scaffold creates the SQLAlchemy async engine but does not connect to
PostgreSQL until a feature that needs the database is invoked.
