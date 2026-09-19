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
```

The SQLAlchemy models and Alembic migrations live in the repository-level
`database/` package. Run subsequent backend commands from the repository root:

```powershell
cd ..\..
apps\api\.venv\Scripts\python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --reload
```

`0.0.0.0` allows Android devices connected to the computer hotspot to reach
the API. Use the hotspot IPv4 address in `EXPO_PUBLIC_API_BASE_URL`.

Health endpoint:

```text
GET http://127.0.0.1:8000/api/v1/health
```

## Temporary development authentication

The HTTP authentication routes are still intentionally limited to identity
bootstrap and development lookup. The repository-level `database/` package
now contains the password, JWT, refresh-session, and profile data foundation,
but those services are not yet exposed as production HTTP login endpoints.

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

## Aliyun PNVS SMS verification

The backend exposes two public SMS verification endpoints. They use the
Aliyun PNVS `Dypnsapi` API version `2017-05-25`.

```text
POST /api/v1/auth/sms/send
POST /api/v1/auth/sms/verify
```

The send endpoint validates a mainland China phone number and asks Aliyun to
generate and manage the verification code. The code is never returned to the
client or stored in the ECHO database. A successful verify response includes a
five-minute signed `verification_token` that a later registration or phone-login
endpoint can consume.

Required environment variables:

```env
ALIBABA_CLOUD_ACCESS_KEY_ID=
ALIBABA_CLOUD_ACCESS_KEY_SECRET=
ALIYUN_PNVS_SIGN_NAME=
ALIYUN_PNVS_TEMPLATE_CODE=100001
ALIYUN_PNVS_COUNTRY_CODE=86
ALIYUN_PNVS_VALID_TIME=300
ALIYUN_PNVS_INTERVAL=60
ALIYUN_PNVS_TIMEOUT_SECONDS=10
```

Manual smoke test:

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v1/auth/sms/send `
  -H "Content-Type: application/json" `
  -d '{"phone":"13800138000"}'

curl.exe -X POST http://127.0.0.1:8000/api/v1/auth/sms/verify `
  -H "Content-Type: application/json" `
  -d '{"phone":"13800138000","code":"8043"}'
```

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
GET  /api/v1/courses/{course_id}/documents
POST /api/v1/documents/{document_id}/parse
```

Course teachers can upload PDF files. The default development adapter stores
Course teachers can list all uploads for a course with their current parsing
status. Student and non-member accounts receive `403`.
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

Knowledge points can be renamed, described, reordered, moved between
chapters, merged, and deleted. Merging combines student mastery by average and
migrates events, snapshots, and relation edges to the target point.

Teachers can generate chapters and knowledge points from a parsed document.
Generation uses a Qwen-compatible chat completions endpoint configured by
`ECHO_LLM_API_KEY`, `ECHO_LLM_BASE_URL`, and `ECHO_LLM_MODEL`. The default
model is `qwen3.8-flash`. Regeneration replaces the previous structure for
that document.
Duplicate knowledge-point names are normalized within a chapter. Documents above
the configured context limit are processed by a segmented extraction and
recursive merge workflow. The default input budget is 70% of the model's
1,000,000-token context window (`700,000` tokens). A `422` is reserved for an
irreducible single segment that still exceeds the budget.
Adjacent extraction batches keep a configurable token overlap, and every LLM
request sets an explicit `max_tokens` output limit.

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
The default embedding batch size is 10, matching the `text-embedding-v3`
provider limit.
PostgreSQL search uses pgvector cosine distance; SQLite uses the same cosine
ranking in memory for development and tests.
Results above `ECHO_RETRIEVAL_MAX_DISTANCE` are discarded before the prompt is built.

## Chat and SSE

```text
POST /api/v1/courses/{course_id}/conversations
GET  /api/v1/courses/{course_id}/conversations
GET  /api/v1/conversations/{conversation_id}/messages
POST /api/v1/conversations/{conversation_id}/messages/stream
GET  /api/v1/courses/{course_id}/students/{student_id}/conversations
GET  /api/v1/courses/{course_id}/conversations/{conversation_id}/messages
```

The stream endpoint retrieves course chunks, builds a teaching prompt, emits
`text_delta`, `citation`, `done`, or `error` SSE events, and persists the user
message plus assistant message citations.
Course teachers can also read a student's conversation list and complete message
evidence. Teacher message responses include `knowledgePointIds`, `citations`, and
`reviewStatus`.

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
GET /api/v1/dashboard/overview?courseId={courseId}
GET /api/v1/courses/{course_id}/chapters/analytics
GET /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/analytics
GET /api/v1/courses/{course_id}/students/{student_id}/learning
```

Course teachers receive student counts, seven-day active students, seven-day
question volume, total events, average mastery, and high-risk knowledge points.
The dashboard also includes the number of open AI review flags.
The overview endpoint returns the teacher home payload in one request: stats,
seven-day trend, deterministic insight, chapter mastery, learning difficulties,
and suggested teacher actions.
Trend dates are bucketed by `ECHO_BUSINESS_TIMEZONE` (default `Asia/Shanghai`).
Additional drill-down endpoints return chapter averages, per-knowledge-point
student distributions, and a student's recent learning evidence.

## AI answer review

```text
GET  /api/v1/courses/{course_id}/review-flags
GET  /api/v1/courses/{course_id}/review-flags/{flag_id}
POST /api/v1/courses/{course_id}/review-flags/{flag_id}/review
GET  /api/v1/courses/{course_id}/review-flags/query
GET  /api/v1/courses/{course_id}/review-flags/summary
GET  /api/v1/courses/{course_id}/review-flags/{flag_id}/context
POST /api/v1/courses/{course_id}/review-flags/{flag_id}/regenerate
GET  /api/v1/courses/{course_id}/review-flags/{flag_id}/regeneration
GET  /api/v1/courses/{course_id}/review-flags/{flag_id}/versions
GET  /api/v1/courses/{course_id}/review-flags/{flag_id}/history
POST /api/v1/courses/{course_id}/messages/{message_id}/not-resolved
```

Assistant answers are flagged when they lack course citations, rely on
course-external material, or follow an unresolved repeated question. Students
can explicitly report an answer as not resolved. Teachers can filter open
flags and mark them correct, incorrect, or dismissed. Full request and response
contracts are frozen in `docs/API契约.md`.
Teachers can also regenerate an answer with an instruction without overwriting the
original message, then inspect versions, regeneration status, and audit history.

## Teacher resources and evidence

```text
GET  /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/mastery-trend
GET  /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/error-patterns
GET  /api/v1/courses/{course_id}/students/{student_id}/mastery-trend
GET  /api/v1/courses/{course_id}/students/{student_id}/error-patterns
GET/POST /api/v1/courses/{course_id}/question-items
GET/PATCH/DELETE /api/v1/courses/{course_id}/question-items/{question_item_id}
GET/POST /api/v1/courses/{course_id}/external-resources
PATCH/DELETE /api/v1/courses/{course_id}/external-resources/{resource_id}
GET  /api/v1/courses/{course_id}/resources
POST /api/v1/courses/{course_id}/resources/{resource_id}/trash
POST /api/v1/courses/{course_id}/resources/{resource_id}/restore
DELETE /api/v1/courses/{course_id}/resources/{resource_id}?permanent=true
GET  /api/v1/courses/{course_id}/knowledge-graph
GET  /api/v1/courses/{course_id}/documents/{document_id}/file
GET  /api/v1/courses/{course_id}/documents/{document_id}/pages/{page_number}
GET  /api/v1/courses/{course_id}/documents/{document_id}/index-status
GET  /api/v1/courses/{course_id}/documents/{document_id}/citations
```

Teacher-facing resource lists use cursor pagination. The PDF file endpoint supports
HTTP Range. Page evidence includes real dimensions and only returns bounding
boxes when they exist in chunk metadata.
Seed repeatable teacher student analytics demo data:

```powershell
python -m database.seeds.seed_teacher_student_analytics
```

Run from the repository root so the `database` package is importable. The seed
script writes the full ID manifest to
`tmp/teacher_student_analytics_seed.json`.

Tests and lint:

From the repository root:

```powershell
apps\api\.venv\Scripts\python -m pytest apps/api/tests
apps\api\.venv\Scripts\python -m ruff check apps/api/app apps/api/tests database
```

Database migrations:

From the repository root:

```powershell
apps\api\.venv\Scripts\python -m alembic -c database/alembic.ini upgrade head
```

Implemented domain models:

- `User`: identity and teacher/student role.
- `UserCredential`: one-to-one Argon2id password credential.
- `AuthSession`: refresh-token hash, device metadata, expiry, and revocation.
- `TeacherProfile` and `StudentProfile`: optional one-to-one user profiles.
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
- `AIReviewFlag`: explainable assistant-answer anomaly with teacher review state.
- `ReviewAnswerVersion`: immutable original, regenerated, and teacher-edit answer versions.
- `ReviewRegenerationRun`: persisted regeneration status, progress, instruction, and error.
- `ReviewHistoryEntry`: ordered audit trail for review decisions and regeneration.

Migrations:

- `441be7725f7c`: core identity and course tables.
- `8b1c2d3e4f50`: document and document page tables.
- `c2d3e4f5a6b7`: chapters, knowledge points, and relation tables.
- `d3e4f5a6b7c8`: searchable knowledge chunk table.
- `e4f5a6b7c8d9`: 1024-dimensional knowledge chunk embeddings.
- `f5a6b7c8d9e0`: conversation, message, and citation tables.
- `a6b7c8d9e0f1`: per-course teaching policy table.
- `b7c8d9e0f1a2`: learning events, knowledge state, and mastery snapshots.
- `c8d9e0f1a2b3`: AI answer review flags and teacher decisions.
- `d9e0f1a2b3c4`: original citation index persisted on message citations.
- `e1a2b3c4d5e6`: user account status, username, avatar, and last login fields.
- `f2b3c4d5e6f7`: password credentials and refresh-token sessions.
- `a3c4d5e6f7a8`: optional teacher and student profiles.
- `b4c5d6e7f8a9`: review answer versions, regeneration runs, and review history.
- `c5d6e7f8a9b0`: teacher resources, page dimensions, soft deletion, and graph relationships.

The scaffold creates the SQLAlchemy async engine but does not connect to
PostgreSQL until a feature that needs the database is invoked.
