# ECHO 项目切片：AI 实现与全链路视图

> 用途：给代码代理、审查代理和数据库代理提供实现级导航。  
> 快照：HEAD `934c4b1` / `v0.0.97`，OpenAPI 92 条路径、110 个操作，数据库 head `b0c1d2e3f4a5`。  
> 本文描述当前真实代码和数据流；如果代码与本文冲突，以源码、Pydantic Schema、SQLAlchemy Model 和 Alembic 为准。

> 2026-10-08 状态：正文仍是 `v0.0.97` 历史快照。当前索引版本为 `v0.0.210`，契约行为核对于 `a70f727`，OpenAPI 123 条唯一路径、239 个 Schema，数据库唯一 head 为 `e5f6a7b8c9d0`。实时契约请先看 `docs/API契约.md`、`docs/api/接口索引.md`、`database/README.md` 和源码。

## 1. 机器可读快照

```yaml
repository: F:/KaiFa/XvXiZuSo
git_head: 934c4b1
version: v0.0.97
database_migration_head: b0c1d2e3f4a5
backend: apps/api
teacher_web: apps/web
student_mobile: apps/mobile
database_package: database
shared_types: packages/shared-types
api_client: packages/api-client
api_prefix: /api/v1
auth_transport: X-User-Id
chat_transport: SSE
formal_password_login: not_exposed
```

## 2. 全局运行拓扑

```text
Teacher Web / Student Mobile
        |
        +-- @echo/api-client
        |      |
        |      +-- JSON REST
        |      +-- SSE
        |
        v
FastAPI /api/v1
        |
        +-- dependencies: auth, DB session, storage, AI providers
        +-- Pydantic request validation
        +-- service layer: authorization, transactions, domain rules
        +-- SQLAlchemy async ORM
        +-- local PDF/avatar storage
        +-- Qwen: chat, embedding, knowledge structure
        |
        v
PostgreSQL target / SQLite local and tests
```

## 3. 单次请求生命周期

```text
HTTP request
→ FastAPI route
→ DBSession dependency
→ CurrentUser dependency from X-User-Id
→ request Schema validation
→ service function
→ role/course/member/ownership checks
→ SQLAlchemy query or mutation
→ external AI/storage call when required
→ commit / refresh / rollback
→ Pydantic response schema
→ JSON or SSE
```

通用错误映射：

| 场景 | HTTP |
|---|---:|
| 参数、Schema、业务字段错误 | 400 / 422 |
| 未认证或开发身份无效 | 401 |
| 非成员、非教师、非所有者 | 403 |
| 对象不存在 | 404 |
| 状态机冲突、唯一约束、并发冲突 | 409 |
| 文件过大 | 413 |
| 不支持头像/文件类型 | 415 |
| AI、Embedding、外部 Provider 失败 | 502 / 503 / 504 |

## 4. 模块所有权

| 模块 | 文件 | 主要职责 |
|---|---|---|
| API 入口 | `apps/api/app/main.py`、`api/router.py` | 创建 FastAPI、CORS、挂载路由 |
| 认证 | `api/routes/auth.py`、`services/auth.py`、`services/avatar.py` | 开发登录、Profile、密码、头像 |
| 用户头像读取 | `api/routes/users.py` | 稳定头像文件流 |
| 通知 | `api/routes/notifications.py`、`services/notifications.py` | 列表、未读、已读、创建通知 |
| 课程 | `api/routes/courses.py`、`services/course.py` | 课程、成员、归档、成员变化通知 |
| 文档 | `api/routes/documents.py`、`services/document.py`、`storage.py` | 上传、解析、元数据、文件存储 |
| Chunk | `api/routes/chunks.py`、`services/chunking.py` | 页面到文本 Chunk |
| Embedding/检索 | `services/embedding.py`、`search.py` | 向量化、余弦距离检索 |
| 知识结构 | `api/routes/knowledge.py`、`services/knowledge.py` | 生成、编辑、排序、合并、删除 |
| 对话 | `api/routes/chat.py`、`services/chat.py` | 会话、消息、RAG、SSE、引用 |
| Quick Check | `api/routes/quick_check.py`、`services/quick_checks.py` | 题目生成、答题、提示、掌握更新 |
| 学习分析 | `api/routes/learning.py`、`services/learning.py` | LearningEvent、状态、快照 |
| Dashboard | `api/routes/dashboard*.py`、`services/dashboard*.py` | 总览、章节、知识点、学生详情 |
| AI 审核 | `api/routes/review.py`、`services/review.py`、`review_workflow.py` | 自动标记、审核、版本、重生成 |
| 教师资源 | `api/routes/teacher_resources.py` | PDF 证据、趋势、错误、题库、外链、回收站、图谱 |
| 教学策略 | `services/teaching_strategy.py`、`planning.py` | 建议、版本、教师状态机 |
| 执行计划 | `services/execution_plan.py`、`plan_generation.py`、`plan_effects.py` | 计划、周任务、事件、效果 |
| Demo | `api/routes/demo.py`、`database/seeds/*` | 小 Demo 与大型验收数据 |

## 5. 数据库聚合映射

### 5.1 身份

```text
users
├─ user_credentials 1:0..1
├─ auth_sessions 1:N
├─ teacher_profiles 1:0..1
├─ student_profiles 1:0..1
└─ notifications 1:N
```

`users.avatar_url` 是公开图片地址；`users.avatar_storage_key` 是服务端文件定位键。

### 5.2 课程

```text
courses
├─ course_members 1:N
├─ course_invites 1:N
├─ documents 1:N
├─ conversations 1:N
├─ learning_events 1:N
├─ student_knowledge_states 1:N
├─ mastery_snapshots 1:N
├─ ai_review_flags 1:N
├─ teaching_policies 1:0..1
├─ teaching_strategies 1:N
├─ execution_plans 1:N
├─ question_items 1:N
├─ external_resources 1:N
└─ notifications 1:N
```

课程权限由 `course_members.role` 决定，不从 `users.role` 单独推断。

### 5.3 教材与知识

```text
documents
└─ document_pages 1:N

documents
└─ knowledge_chunks 1:N

chapters
└─ knowledge_points 1:N

knowledge_points
├─ knowledge_relations N:M
├─ question_item_knowledge_points N:M
└─ external_resource_knowledge_points N:M
```

`knowledge_chunks.embedding` 是 1024 维 pgvector；`chunk_index` 在文档内唯一；`page_start/page_end` 用于 Citation 定位。

### 5.4 对话与审核

```text
conversations
└─ messages 1:N
   ├─ message_citations 1:N
   ├─ quick_check_attempts 0..N
   ├─ learning_events 0..N
   └─ ai_review_flags 0..N

ai_review_flags
├─ review_answer_versions 1:N
├─ review_regeneration_runs 1:N
└─ review_history 1:N
```

### 5.5 教学计划

```text
teaching_strategies
├─ teaching_strategy_versions 1:N
├─ strategy_target_knowledge_points N:M
├─ strategy_target_students N:M
└─ execution_plans 1:N

execution_plans
├─ execution_plan_weeks 1:N
├─ plan_tasks 1:N
├─ execution_plan_generations 1:N
├─ plan_target_knowledge_points N:M
└─ plan_target_students N:M

plan_tasks
├─ plan_task_knowledge_points N:M
└─ plan_task_target_students N:M
```

## 6. 完整接口到数据流映射

以下每条记录表示：入口 → 主要服务 → 主要读写 → 返回或副作用。

表格中的路径省略公共前缀 `/api/v1`。

### 6.1 认证、用户、头像

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /auth/login` | `get_or_register_user` | `users` 查/建；返回当前开发用户 |
| `GET /auth/me` | 当前用户依赖 | 读 `users`；返回 `UserResponse` |
| `GET /auth/me/profile` | `get_teacher_profile` | 读 `users + teacher_profiles` |
| `PATCH /auth/me/profile` | `update_teacher_profile` | 更新 `users.display_name`、`teacher_profiles` |
| `POST /auth/change-password` | `change_password` | 校验 `user_credentials`；撤销 `auth_sessions` |
| `POST /auth/me/avatar` | `upload_avatar` | 文件签名校验 → 头像文件 → `users.avatar_url/avatar_storage_key` |
| `DELETE /auth/me/avatar` | `delete_avatar` | 清空头像字段 → 删除文件 |
| `GET /users/{user_id}/avatar` | `get_avatar_path` | 读用户头像键 → 图片文件流 |

头像限制：JPEG、PNG、WebP；最大 2 MB；读取地址公开，写入和删除需要当前用户。

### 6.2 通知

| 接口 | 服务 | 数据流 |
|---|---|---|
| `GET /notifications` | `list_notifications` | 读 `notifications`；游标按 `created_at + id` 倒序 |
| `GET /notifications/unread-count` | `count_unread_notifications` | 统计 `read_at IS NULL` |
| `POST /notifications/{id}/read` | `mark_notification_read` | 校验 `user_id`；写 `read_at` |
| `POST /notifications/read-all` | `mark_all_notifications_read` | 批量写当前用户所有未读 |

通知创建点：

- `services/review.py`：高风险审核标记 → 课程教师。
- `services/course.py`：学生加入课程 → 课程教师。

### 6.3 系统与 Demo

| 接口 | 服务 | 数据流 |
|---|---|---|
| `GET /health` | route | 返回服务版本与环境 |
| `GET /system/status` | `system.py` | 检查数据库、pgvector、AI 配置、文件和局域网 |
| `GET /demo/status` | `demo.py` | 查询隔离 Demo 课程及关键对象 |
| `POST /demo/reset` | `seed_teacher_student_analytics` | 清理并重建固定 Demo namespace |

### 6.4 课程与成员

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /courses` | `create_course` | 写 `courses + course_members(teacher)` |
| `GET /courses` | `list_courses_for_user` | `courses JOIN course_members` |
| `POST /courses/join` | `join_course_by_code` | 校验 published/code → 写成员 → 写教师通知 |
| `GET /courses/{course_id}` | `get_course_for_member` | 校验成员 → 返回课程 |
| `PATCH /courses/{course_id}` | `update_course` | 校验教师 → 更新可编辑字段 |
| `POST /courses/{course_id}/publish` | `publish_course` | `draft → published` |
| `POST /courses/{course_id}/archive` | `archive_course` | `published/draft → archived`，设置 `archived_at` |
| `POST /courses/{course_id}/restore` | `restore_course` | `archived → draft` |
| `GET /courses/{course_id}/members` | `list_course_members` | 教师读取成员 + 用户头像和邮箱 |
| `GET /courses/{course_id}/chapters` | `list_course_chapters` | 读章节、知识点及文档归属 |

### 6.5 文档、页面、Chunk、Embedding、检索

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /courses/{course_id}/documents` | `upload_course_document` | 文件 → storage；写 `documents.uploaded` |
| `GET /courses/{course_id}/documents` | `list_course_documents` | 读未删除资料 |
| `PATCH /courses/{course_id}/documents/{document_id}/metadata` | `update_document_metadata` | 只改展示元数据，不改 Chunk/Citation |
| `POST /documents/{document_id}/parse` | `parse_document` | 删除旧 Chunk → PDF 文本 → 写 `document_pages` → `ready/failed` |
| `POST /documents/{document_id}/chunks` | `chunk_document` | 删除旧 Chunk → 页文本切分重叠块 → 写 `knowledge_chunks` |
| `POST /documents/{document_id}/embeddings` | embedding route | 读空向量 Chunk → Qwen → 写 `embedding` |
| `POST /courses/{course_id}/search` | `search_course_chunks` | Query Embedding → pgvector cosine → ready 文档 Chunk |
| `GET /courses/{course_id}/documents/{document_id}/index-status` | `document_evidence.py` | 聚合页数、Chunk 数和向量数 |
| `GET /courses/{course_id}/documents/{document_id}/file` | `document_evidence.py` | Range 文件流 |
| `GET /courses/{course_id}/documents/{document_id}/pages/{page_number}` | `document_evidence.py` | 页文本 + Chunk bbox/引用证据 |
| `GET /courses/{course_id}/documents/{document_id}/citations` | `document_evidence.py` | 读 `message_citations` 并分页 |

### 6.6 章节、知识点和知识图谱

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /documents/{document_id}/generate-structure` | `generate_knowledge_structure` | PDF 页文本 → Qwen → 替换章节知识点 |
| `POST /documents/{document_id}/chapters` | `create_chapter` | 写 `chapters` |
| `PATCH /chapters/{chapter_id}` | `update_chapter` | 改标题、简介、顺序 |
| `DELETE /chapters/{chapter_id}` | `trash_chapter` | 软删除章节及活动引用 |
| `POST /chapters/{chapter_id}/knowledge-points` | `create_knowledge_point` | 写知识点 |
| `PATCH /knowledge-points/{point_id}` | `update_knowledge_point` | 改名、排序或移动 |
| `DELETE /knowledge-points/{point_id}` | `trash_knowledge_point` | 软删除，不再参与图谱和关联 |
| `POST /courses/{course_id}/knowledge-points/merge` | `merge_knowledge_points` | 迁移状态、快照、事件和关系；写合并快照 |
| `GET /courses/{course_id}/knowledge-graph` | `knowledge_graph.py` | 读取章节、知识点、关系和资源节点 |

### 6.7 对话、RAG、SSE、Quick Check

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /courses/{course_id}/conversations` | `create_conversation` | 校验成员 → 写会话 |
| `GET /courses/{course_id}/conversations` | `list_conversations` | 读当前用户会话 |
| `GET /conversations/{conversation_id}/messages` | `list_messages` | 校验所有者 → 消息 + Citation |
| `POST /conversations/{conversation_id}/messages/stream` | `stream_chat_response` | 过滤检索 → Prompt → SSE → 消息/引用/事件/审核 |
| `POST /conversations/{conversation_id}/messages/{message_id}/continue` | `continue_chat_response` | 恢复 interrupted/failed 回答 |
| `POST /quick-checks/{question_id}/attempts` | `submit_quick_check` | 写答题记录 → 学习事件 → 更新掌握度 |
| `POST /messages/{message_id}/hints` | `build_hint_block` | 读取 Quick Check → 返回分层提示 |
| `GET /courses/{course_id}/students/{student_id}/conversations` | `list_student_conversations` | 教师读取指定学生会话 |
| `GET /courses/{course_id}/conversations/{conversation_id}/messages` | `list_conversation_messages_for_teacher` | 教师读取完整对话、知识点、引用和审核状态 |

SSE 事件：

```text
message_start
text_delta
citation
block
interrupted
error
done
```

### 6.8 LearningEvent、掌握度和 Dashboard

| 接口 | 服务 | 数据流 |
|---|---|---|
| `POST /courses/{course_id}/learning-events` | `record_learning_event` | 写事件 → 更新状态 → 写快照 |
| `GET /courses/{course_id}/students/{student_id}/mastery` | `learning.py` | 读 `student_knowledge_states` |
| `GET /courses/{course_id}/dashboard` | `dashboard.py` | 聚合学生、事件、掌握度和审核 |
| `GET /dashboard/overview` | `dashboard.py` | 首页统计、趋势、洞察、章节、难点和行动 |
| `GET /courses/{course_id}/chapters/analytics` | `dashboard_details.py` | 章节聚合 |
| `GET /courses/{course_id}/knowledge-points/{id}/analytics` | `dashboard_details.py` | 知识点掌握分布 |
| `GET /courses/{course_id}/students/{student_id}/learning` | `dashboard_details.py` | 学生掌握状态和最近证据 |
| `GET /courses/{course_id}/knowledge-points/{id}/mastery-trend` | `knowledge_analytics.py` | 按快照和事件生成趋势 |
| `GET /courses/{course_id}/knowledge-points/{id}/error-patterns` | `knowledge_analytics.py` | 聚类错误事件 |
| `GET /courses/{course_id}/students/{student_id}/mastery-trend` | `knowledge_analytics.py` | 学生长期趋势 |
| `GET /courses/{course_id}/students/{student_id}/error-patterns` | `knowledge_analytics.py` | 学生长期错误画像 |

### 6.9 AI 审核

| 接口 | 服务 | 数据流 |
|---|---|---|
| `GET /courses/{course_id}/review-flags` | `list_review_flags` | 审核列表 |
| `GET /courses/{course_id}/review-flags/query` | `list_review_flags` | 服务端筛选、排序、游标和摘要 |
| `GET /courses/{course_id}/review-flags/summary` | `review_summary` | 状态计数 |
| `GET /courses/{course_id}/review-flags/{flag_id}` | `get_review_flag` | 详情、版本和历史 |
| `GET /courses/{course_id}/review-flags/{flag_id}/context` | `review_workflow.py` | 聚合问题、消息、Citation、知识点和事件 |
| `POST /courses/{course_id}/review-flags/{flag_id}/review` | `review_flag` | 写教师决定、版本和历史 |
| `POST /courses/{course_id}/review-flags/{flag_id}/regenerate` | `regenerate_review` | 读原回答和上下文 → Qwen → 新版本 |
| `GET /courses/{course_id}/review-flags/{flag_id}/regeneration` | `review_workflow.py` | 重生成状态 |
| `GET /courses/{course_id}/review-flags/{flag_id}/versions` | `review_workflow.py` | 回答版本 |
| `GET /courses/{course_id}/review-flags/{flag_id}/history` | `review_workflow.py` | 审核历史 |
| `POST /courses/{course_id}/messages/{message_id}/not-resolved` | `report_message_not_resolved` | 写学生未解决审核标记 |

自动审核条件包括缺少课程依据、课程外内容过多、重复追问、学生未解决和教师规则冲突。

### 6.10 教师资源、题库、回收站和外链

| 接口 | 服务 | 数据流 |
|---|---|---|
| `GET /courses/{course_id}/question-items` | `list_question_items` | 读题库并分页 |
| `POST /courses/{course_id}/question-items` | `create_question_item` | 校验知识点 → 写题 |
| `GET /courses/{course_id}/question-items/{id}` | `get_question_item` | 读题和知识点关联 |
| `PATCH /courses/{course_id}/question-items/{id}` | `update_question_item` | 更新题目和关联 |
| `DELETE /courses/{course_id}/question-items/{id}` | `trash_question_item` | 软删除 |
| `GET /courses/{course_id}/external-resources` | `list_external_resources` | 读外链并分页 |
| `POST /courses/{course_id}/external-resources` | `create_external_resource` | 写外链和知识点关系 |
| `PATCH /courses/{course_id}/external-resources/{id}` | `update_external_resource` | 更新外链元数据 |
| `DELETE /courses/{course_id}/external-resources/{id}` | `trash_external_resource` | 软删除 |
| `GET /courses/{course_id}/resources` | `resource_lifecycle.py` | 聚合文档、章节、知识点、题库和外链 |
| `POST /courses/{course_id}/resources/{id}/trash` | `trash_resource` | 软删除 |
| `POST /courses/{course_id}/resources/{id}/restore` | `restore_resource` | 恢复并检查命名冲突 |
| `DELETE /courses/{course_id}/resources/{id}` | `permanently_delete_resource` | 删除文件、页面、Chunk、关系和引用 |

### 6.11 教学策略、执行计划、任务和效果

| 接口 | 服务 | 数据流 |
|---|---|---|
| `GET /courses/{course_id}/teaching-policy` | `teaching_policy.py` | 读课程规则 |
| `PUT /courses/{course_id}/teaching-policy` | `teaching_policy.py` | 写课程规则 |
| `GET /courses/{course_id}/teaching-strategies` | `teaching_strategy.py` | 策略列表 |
| `POST /courses/{course_id}/teaching-strategies/generate` | `generate_teaching_strategy` | 读学情 → Qwen → `suggested` |
| `POST /courses/{course_id}/teaching-strategies` | `create_teaching_strategy` | 手工创建策略 |
| `GET /teaching-strategies/{id}` | `get_teaching_strategy` | 详情、目标、版本和计划 |
| `PATCH /teaching-strategies/{id}` | `update_teaching_strategy` | 更新并写版本 |
| `POST /teaching-strategies/{id}/actions` | `act_on_teaching_strategy` | 教师状态机 |
| `GET /teaching-strategies/{id}/versions` | `teaching_strategy.py` | 策略版本 |
| `GET /teaching-strategies/{id}/effect` | `plan_effects.py` | 策略效果观察 |
| `GET /courses/{course_id}/execution-plans` | `execution_plan.py` | 计划列表 |
| `POST /courses/{course_id}/execution-plans` | `create_execution_plan` | 写计划、目标关系和任务草稿 |
| `GET /execution-plans/{id}` | `get_execution_plan` | 详情、周计划和任务 |
| `PATCH /execution-plans/{id}` | `update_execution_plan` | 更新计划参数 |
| `POST /execution-plans/{id}/actions` | `act_on_execution_plan` | 发布、暂停、继续、完成、取消 |
| `POST /execution-plans/{id}/generate-weekly-plan` | `plan_generation.py` | Qwen → 周计划和任务草稿 |
| `GET /execution-plans/{id}/tasks` | `execution_plan.py` | 任务和完成度 |
| `PATCH /plan-tasks/{task_id}` | `update_plan_task` | 更新任务内容、状态和关联 |
| `GET /execution-plans/{id}/learning-events` | `execution_plan.py` | 计划、任务和学生事件 |
| `GET /execution-plans/{id}/effect` | `plan_effects.py` | 前后指标、任务效果和证据不足判断 |

AI 初始输出不能直接变为 active/published。策略必须经过教师采纳，计划必须经过教师发布。

## 7. 详细数据流

### 7.1 登录、Profile、密码和头像

```text
POST /auth/login
→ 按 email 查 users
→ 不存在则创建 User
→ 返回 UserResponse（包含 avatar_url）

PATCH /auth/me/profile
→ 校验 role=teacher
→ users.display_name
→ upsert teacher_profiles
→ commit
→ 返回完整 Profile

POST /auth/change-password
→ 读 user_credentials
→ verify current password
→ Argon2id hash new password
→ 更新 password_changed_at / failed_login_count
→ revoke active auth_sessions
→ commit

POST /auth/me/avatar
→ 读取最多 max+1 字节
→ 校验 JPEG/PNG/WebP 签名
→ 生成 avatar_storage_key
→ 写文件
→ 更新 users.avatar_url/avatar_storage_key
→ 删除旧文件
```

### 7.2 课程生命周期

```text
创建：users(teacher) → courses(draft) → course_members(teacher)
发布：课程教师校验 → courses.published
加入：课程码 → courses.published 校验 → course_members(student) → Notification(teacher)
归档：课程教师校验 → courses.archived + archived_at
恢复：archived 校验 → courses.draft + archived_at=NULL
```

历史学生、资源、对话、事件和审核记录不会因归档被删除。

### 7.3 教材到检索

```text
Upload
→ documents(uploaded)
→ 文件存 storage

Parse
→ delete old knowledge_chunks
→ PdfReader 提取每页
→ delete old document_pages
→ insert document_pages
→ documents.ready/failed

Chunk
→ delete old chunks
→ 逐页按 chunk_size/overlap 切分
→ insert knowledge_chunks

Embedding
→ select chunks where embedding is NULL
→ Qwen batch
→ update knowledge_chunks.embedding

Search
→ query embedding
→ join documents/chapters
→ document ready + 未软删除 + chapter 未软删除
→ cosine distance
→ threshold + limit
→ ChunkSearchResult
```

### 7.4 知识结构

```text
Generate
→ 读取 pages
→ LLM token budget 分段
→ Qwen JSON
→ 章节/知识点草稿
→ 复用或新建实体
→ 写 chapters / knowledge_points

Edit
→ 校验教师
→ update/create/trash
→ 保持稳定顺序和活动唯一索引

Merge
→ 校验目标和来源同课程
→ 计算全来源平均掌握度
→ 迁移 events/states/snapshots/relations
→ 写合并后的 MasterySnapshot
→ 软删除来源知识点
```

### 7.5 RAG 与 SSE

```text
stream_chat_response
→ 校验 Conversation 所有者
→ client_request_id 幂等检查
→ search_course_chunks
→ TeachingPolicy
→ resolve knowledge point
→ 读取最近历史
→ 写 user Message
→ 学生记录 question_asked
→ 写 streaming assistant Message
→ yield message_start
→ Prompt:
   system = 教学规则 + 不可信材料声明
   user = <course_material>...
   history
   question
→ Qwen stream
→ 周期持久化 text_delta
→ 完成：解析 [n] 引用
→ 写 MessageCitation
→ Quick Check / hint
→ attach_auto_review_flags
→ Message.complete
→ yield citation/block/done
```

中断：

```text
CancelledError → Message.interrupted
Provider error → Message.failed + SSE error
Continue route → 复用原 assistant Message 并从 partial answer 追加
```

### 7.6 Quick Check 与学习掌握

```text
生成题
→ Qwen structured output
→ QuestionItem
→ QuickCheckBlock

提交答案
→ 校验学生课程成员
→ QuickCheckAttempt 唯一 attempt_id
→ 判断 correct
→ record_learning_event
→ StudentKnowledgeState 更新
→ MasterySnapshot
→ 返回 explanation/hint/mastery_update
```

### 7.7 Dashboard 聚合

```text
CourseMember + LearningEvent
→ active students
→ weekly interaction count

StudentKnowledgeState
→ average mastery
→ high-risk points

AIReviewFlag
→ pending review count

LearningEvent
→ 7 天按业务时区分桶
→ trend

DashboardOverview
→ stats + trend + insight + chapter mastery + difficulties + actions
```

### 7.8 AI 审核闭环

```text
Assistant Message 完成
→ _detect_review_reasons
→ AIReviewFlag(open)
→ 若 high severity，创建教师 Notification

教师审核
→ confirm_correct / mark_incorrect / dismiss
→ ReviewAnswerVersion
→ ReviewHistoryEntry
→ 更新 status/reviewed_at/note/corrected_answer

重新生成
→ generating
→ 读当前版本、消息、Citation、知识点和教学规则
→ Qwen
→ 新 ReviewAnswerVersion
→ pending_rereview / regeneration_failed
```

### 7.9 策略和执行计划

```text
Dashboard / analytics
→ AI insight
→ strategy generate
→ suggested
→ teacher accept
→ accepted/active

strategy
→ create plan
→ draft/ready
→ publish
→ active

active plan
→ generate weekly plan
→ weeks + tasks
→ student LearningEvent

plan effect
→ 时间窗内事件 + 快照
→ 指标前后变化
→ 任务完成率
→ facts / remaining issues
→ insufficient_evidence
```

### 7.10 通知

```text
create_notification
→ notifications(user_id, type, severity, payload_json, dedupe_key)
→ unread = read_at IS NULL

list_notifications
→ filters: user_id + optional unread + cursor
→ order: created_at DESC, id DESC
→ limit + 1
→ nextCursor
→ unreadCount

mark read
→ user ownership check
→ read_at = now
```

## 8. 教师端切片

### 8.1 路由与模块

| 路由 | 模块 | 主要后端读取 |
|---|---|---|
| `/dashboard` | Overview KPI、趋势、洞察、行动 | `/dashboard/overview` |
| `/courses` | 课程列表和聚合 | `/courses`、Dashboard、成员 |
| `/courses/new` | 五步课程向导 | 建课、上传、解析、结构、发布 |
| `/courses/[courseId]` | 课程控制中心 | 课程详情、成员、资源、审核、策略、计划 |
| `/knowledge` | 资源、结构、图谱 | documents、chapters、knowledge graph |
| `/knowledge/resources/[id]` | 资源详情和 Citation | index status、citations、file |
| `/knowledge/resources/[id]/source` | PDF 页定位 | pages、range file |
| `/knowledge/points/[id]` | 知识点详情 | trend、error patterns、questions、resources |
| `/students` | 全班学情 | analytics、review、traffic |
| `/students/[id]` | 学生详情 | learning、event、mastery trend |
| `/students/[id]/conversations/[id]` | 完整对话证据 | teacher messages、citation、review |
| `/ai-review` | 审核工作台 | review query、context、regenerate、history |
| `/ai-insights` | 教学洞察 | Dashboard insight、考试/事件聚合 |
| `/teaching-strategies` | 策略列表 | strategy list/generate |
| `/teaching-strategies/[id]` | 策略详情 | versions、plans、effect |
| `/execution-plans/new` | 五步计划向导 | plan create、generate weekly plan |
| `/execution-plans/[id]` | 计划详情 | tasks、events、effect |
| `/me` | 资料、密码和偏好 | profile、change password |
| `/settings/server` | 服务状态 | `/system/status` |
| `/settings/demo` | Demo 管理 | `/demo/status`、`/demo/reset` |

### 8.2 状态层

```text
TeacherSessionProvider
→ localStorage teacher user-id
→ GET /auth/me
→ user + role

CourseWorkspaceProvider
→ GET /courses
→ localStorage selected course-id
→ selectedCourse 共享给业务页面

TanStack Query
→ 每个 feature 的 queries.ts
→ query key 包含 user/course/entity ID
→ mutation 成功后 invalidate 对应 key
```

## 9. 学生端切片

### 9.1 路由与状态

| 路由 | 用途 | 主要 API |
|---|---|---|
| `/login` | 开发账号登录 | `/auth/login` |
| `/join-course` | 课程码加入 | `/courses/join` |
| `/(tabs)/ai` | 主学习空间 | conversations、SSE |
| `/(tabs)/courses` | 我的课程 | `/courses` |
| `/(tabs)/me` | 学生个人信息 | `/auth/me` |
| `/chat` | 完整问答 | messages、SSE、citation、Quick Check |
| `/courses/[id]` | 课程内容 | chapters、knowledge |
| `/knowledge/[id]` | 知识点 | 课程结构与学习状态 |
| `/learning-records` | 学习记录 | learning events |
| `/wrong-questions` | 错题 | 事件/题目后续接口 |

```text
StudentSessionProvider
→ student storage
→ User + current course
→ protected Stack

CurrentCourseProvider
→ selected course persistence
→ 课程上下文

use-chat / chat-shell / chat-message
→ 发起 SSE
→ 合并 text_delta
→ 渲染 markdown、citation、hint、quick_check
→ 处理 interrupted / error / continue
```

## 10. Shared Contract 规则

`packages/shared-types/src/index.ts` 是前端类型层，`packages/api-client/src/index.ts` 是唯一网络访问层。

映射：

```text
Pydantic Response
↔ shared-types interface
↔ api-client generic request<T>
↔ feature query/mutation
↔ component view model
```

禁止：

- 页面组件直接 `fetch` 后端 URL。
- 前端根据局部数据自行计算掌握度、趋势、审核状态或效果。
- 新增后端字段但不同步 shared-types/API Client。
- 为学生端接入教师权限接口。

## 11. AI 修改导航

### 修改课程状态或成员

```text
database/models/course.py
database/alembic/versions/*
apps/api/app/schemas/course.py
apps/api/app/services/course.py
apps/api/app/api/routes/courses.py
packages/shared-types/src/index.ts
packages/api-client/src/index.ts
apps/web/src/features/courses/**
apps/mobile/src/app/courses/**
```

### 修改 RAG 或引用

```text
apps/api/app/services/search.py
apps/api/app/services/chat.py
apps/api/app/services/review.py
database/models/chat.py
database/models/knowledge.py
packages/shared-types/src/index.ts
apps/web/src/features/knowledge/**
apps/mobile/src/features/chat/**
```

### 修改学习分析

```text
apps/api/app/services/learning.py
apps/api/app/services/dashboard.py
apps/api/app/services/dashboard_details.py
apps/api/app/services/knowledge_analytics.py
database/models/learning.py
apps/web/src/features/dashboard/**
apps/web/src/features/students/**
```

### 修改审核

```text
apps/api/app/services/review.py
apps/api/app/services/review_workflow.py
apps/api/app/api/routes/review.py
database/models/review.py
packages/shared-types/src/index.ts
packages/api-client/src/index.ts
apps/web/src/features/ai-review/**
```

### 修改策略/计划

```text
apps/api/app/services/teaching_strategy.py
apps/api/app/services/execution_plan.py
apps/api/app/services/plan_generation.py
apps/api/app/services/plan_effects.py
database/models/planning.py
apps/web/src/features/teaching-strategies/**
apps/web/src/features/execution-plans/**
```

## 12. 当前已知边界

- 正式密码登录和 Bearer JWT 没有冻结到当前 API 契约，开发身份仍为 `X-User-Id`。
- 通知实时推送没有实现；当前接口是拉取和已读状态。
- `student_abnormal` 与 `system_status` 有通知枚举，但没有独立自动检测器。
- CPU/RAM/Disk/Network/日志监控是只读系统状态的一部分，不是完整监控平台。
- 独立大型验收 Seed 使用本地确定性 1024 维向量，不依赖远程 Embedding Key。
- PostgreSQL 实库兼容性已有迁移和模型验证，但当前本地常见验证仍可由 SQLite 执行。
