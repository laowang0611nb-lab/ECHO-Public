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
Set `ECHO_ENVIRONMENT=production` and `ECHO_DEVELOPMENT_AUTH_ENABLED=false`.
The application refuses production startup while development auth remains on.

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
members. Student accounts join idempotently by submitting the course code.
Only teachers can view the member list and email addresses. Teacher accounts
cannot join by code. Publishing must happen before students can join.

## Document uploads

```text
POST /api/v1/courses/{course_id}/documents
POST /api/v1/documents/{document_id}/parse
```

Course teachers can upload PDF files. The default development adapter stores
files under `tmp/uploads`; the storage interface is isolated so MinIO or OSS
can replace it later. Teachers can parse an uploaded PDF into page-level text;
successful parsing updates `page_count` and marks the document `ready`, while
invalid files are marked `failed`.

## Knowledge structure generation

```text
POST /api/v1/documents/{document_id}/generate-structure
GET  /api/v1/courses/{course_id}/chapters
```

Teachers can also edit the generated structure:

```text
POST   /api/v1/documents/{document_id}/chapters
PATCH  /api/v1/chapters/{chapter_id}
DELETE /api/v1/chapters/{chapter_id}
POST   /api/v1/chapters/{chapter_id}/knowledge-points
PATCH  /api/v1/knowledge-points/{knowledge_point_id}
DELETE /api/v1/knowledge-points/{knowledge_point_id}
```

Knowledge points can be renamed, described, reordered, and moved between
chapters in the same course. Merging multiple knowledge points remains a
separate follow-up because it requires combining mastery and relation data.

Teachers can generate chapters and knowledge points from a parsed document.
Generation uses a Qwen-compatible chat completions endpoint configured by
`ECHO_LLM_API_KEY`, `ECHO_LLM_BASE_URL`, and `ECHO_LLM_MODEL`. Regeneration
replaces the previous structure for that document.
Duplicate knowledge-point names are normalized within a chapter. Documents above
the configured context limit return `422` instead of being silently truncated.

## Knowledge chunks

```text
POST /api/v1/documents/{document_id}/chunks
```

Parsed pages are split into overlapping chunks with page metadata. Re-running
chunking replaces the previous chunks for the document.

## Embeddings and retrieval

```text
POST /api/v1/documents/{document_id}/embeddings
POST /api/v1/courses/{course_id}/search
```

Chunks are embedded in batches using a Qwen-compatible embeddings endpoint.
PostgreSQL search uses pgvector cosine distance; SQLite uses the same cosine
ranking in memory for development and tests.
Results above `ECHO_RETRIEVAL_MAX_DISTANCE` are discarded before the prompt is built.

## Chat and SSE

```text
POST /api/v1/courses/{course_id}/conversations
GET  /api/v1/courses/{course_id}/conversations
GET  /api/v1/conversations/{conversation_id}/messages
POST /api/v1/conversations/{conversation_id}/messages/stream
```

The stream endpoint retrieves course chunks, builds a teaching prompt, emits
`text_delta`, `citation`, `done`, or `error` SSE events, and persists the user
message plus assistant message citations.

## Teaching policy

```text
GET /api/v1/courses/{course_id}/teaching-policy
PUT /api/v1/courses/{course_id}/teaching-policy
```

Course members can read the teacher-defined policy. Course teachers can update
it. The policy is injected into the RAG system prompt for later chat turns.

## Learning analytics

```text
POST /api/v1/courses/{course_id}/learning-events
GET  /api/v1/courses/{course_id}/students/{student_id}/mastery
```

Teachers can record explainable learning events. Events update per-course,
per-knowledge-point mastery state and create mastery snapshots. Students can
read their own state; teachers can read student state.

## Teacher dashboard

```text
GET /api/v1/courses/{course_id}/dashboard
GET /api/v1/courses/{course_id}/chapters/analytics
GET /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/analytics
GET /api/v1/courses/{course_id}/students/{student_id}/learning
```

Course teachers receive student counts, seven-day active students, seven-day
question volume, total events, average mastery, and high-risk knowledge points.
Additional drill-down endpoints return chapter averages, per-knowledge-point
student distributions, and a student's recent learning evidence.

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
- `Chapter`: generated chapter structure tied to a course document.
- `KnowledgePoint`: knowledge points belonging to a chapter.
- `KnowledgeRelation`: typed prerequisite/related edges between knowledge points.
- `KnowledgeChunk`: searchable text chunks with page metadata.
- `Conversation`: course-scoped user chat thread.
- `Message`: persisted user, assistant, and system message content.
- `MessageCitation`: snapshot of a retrieved chunk and page range.
- `TeachingPolicy`: natural-language teaching behavior for a course.
- `LearningEvent`: append-only evidence of student learning behavior.
- `StudentKnowledgeState`: current explainable mastery score per knowledge point.
- `MasterySnapshot`: historical score record linked to an event.

Migrations:

- `441be7725f7c`: core identity and course tables.
- `8b1c2d3e4f50`: document and document page tables.
- `c2d3e4f5a6b7`: chapters, knowledge points, and relation tables.
- `d3e4f5a6b7c8`: searchable knowledge chunk table.
- `e4f5a6b7c8d9`: 1024-dimensional knowledge chunk embeddings.
- `f5a6b7c8d9e0`: conversation, message, and citation tables.
- `a6b7c8d9e0f1`: per-course teaching policy table.
- `b7c8d9e0f1a2`: learning events, knowledge state, and mastery snapshots.

The scaffold creates the SQLAlchemy async engine but does not connect to
PostgreSQL until a feature that needs the database is invoked.
