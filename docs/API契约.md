# ECHO API 契约

> 冻结版本：`v0.0.85`
> 基础路径：`/api/v1`  
> 当前认证：开发环境 `X-User-Id`，生产部署前必须替换。
> 数据库层已具备 Argon2id、Access JWT、Refresh Session 和 Profile 基础，但正式 Bearer 登录接口尚未进入本契约；在接口冻结前客户端仍使用开发身份头。

## 1. 通用约定

- 请求和响应使用 JSON，文件上传除外。
- UUID 均以字符串传输。
- 时间使用 ISO 8601 字符串。
- 错误响应统一为 `{"detail": "..."}`。
- 未登录或开发身份无效返回 `401`。
- 角色或课程权限不足返回 `403`。
- 资源不存在返回 `404`。
- 状态冲突、重复数据或未发布课程返回 `409`。
- 请求参数或模型输出不合法返回 `422`。
- 模型、Embedding 或外部服务失败返回 `502` 或 `503`。

## 2. 身份与课程

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/health` | 公开 | 服务存活检查 |
| POST | `/auth/login` | 公开 | 创建或恢复开发用户 |
| GET | `/auth/me` | 已登录 | 当前用户 |
| POST | `/courses` | 教师 | 创建课程并自动成为教师成员 |
| GET | `/courses` | 已登录 | 当前用户加入的课程 |
| GET | `/courses/{course_id}` | 课程成员 | 课程详情 |
| POST | `/courses/join` | 学生 | 课程码加入已发布课程 |
| POST | `/courses/{course_id}/publish` | 课程教师 | 发布课程 |
| GET | `/courses/{course_id}/members` | 课程教师 | 查看含邮箱的成员列表 |

## 3. 文档与知识结构

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/courses/{course_id}/documents` | 课程教师 | 上传 PDF |
| GET | `/courses/{course_id}/documents` | 课程教师 | 查询教材列表和解析状态 |
| POST | `/documents/{document_id}/parse` | 课程教师 | 解析 PDF 页文本 |
| POST | `/documents/{document_id}/generate-structure` | 课程教师 | 生成并替换章节结构 |
| GET | `/courses/{course_id}/chapters` | 课程成员 | 查询章节与知识点 |
| POST | `/documents/{document_id}/chapters` | 课程教师 | 新建章节 |
| PATCH | `/chapters/{chapter_id}` | 课程教师 | 修改标题、简介或顺序 |
| DELETE | `/chapters/{chapter_id}` | 课程教师 | 删除章节及知识点 |
| POST | `/chapters/{chapter_id}/knowledge-points` | 课程教师 | 新建知识点 |
| PATCH | `/knowledge-points/{point_id}` | 课程教师 | 改名、排序或跨章节移动 |
| DELETE | `/knowledge-points/{point_id}` | 课程教师 | 删除知识点 |
| POST | `/courses/{course_id}/knowledge-points/merge` | 课程教师 | 合并知识点并迁移学情 |
| POST | `/documents/{document_id}/chunks` | 课程教师 | 重建文档知识块 |
| POST | `/documents/{document_id}/embeddings` | 课程教师 | 生成 1024 维向量 |
| POST | `/courses/{course_id}/search` | 课程成员 | 课程范围相似度检索 |

### 3.1 长文档结构生成

- `qwen3.8-flash` 的上下文窗口按 `1,000,000 Token` 配置。
- 单次输入安全预算为上下文的 `0.7`，即 `700,000 Token`，其余预算留给系统提示词、输出和安全余量。
- 请求超过安全预算时，服务按页码分段抽取，再递归合并章节与知识点；不会静默截断。
- 相邻提取批次默认保留 `2,000 Token` 重叠上下文，避免章节和知识点在切分边界丢失。
- 每次 LLM 请求显式设置 `max_tokens`，默认输出上限为 `32,768 Token`。
- 只有不可继续拆分的单个片段仍超过预算时，才返回 `422`。
- 可通过 `ECHO_LLM_CONTEXT_WINDOW_TOKENS`、`ECHO_LLM_CONTEXT_SAFETY_RATIO`、`ECHO_LLM_BATCH_OVERLAP_TOKENS` 和 `ECHO_LLM_MAX_OUTPUT_TOKENS` 调整。

### 3.2 知识点合并

```text
POST /api/v1/courses/{course_id}/knowledge-points/merge
```

请求示例：

```json
{
  "target_knowledge_point_id": "uuid",
  "source_knowledge_point_ids": ["uuid", "uuid"],
  "name": "合并后的知识点名称",
  "description": "可选的合并说明"
}
```

合并行为：

- 仅允许同一课程内的知识点合并。
- 目标点不能同时出现在来源列表中。
- 同一学生的来源与目标掌握分按平均值合并。
- 合并后为每个受影响学生写入一条对应新掌握分的快照。
- 来源知识点的事件和掌握快照迁移到目标点。
- 来源知识关系会重连到目标点，自环和重复边会被丢弃。
- 来源知识点在合并完成后删除。

## 4. 聊天与 SSE

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/courses/{course_id}/conversations` | 课程成员 | 新建会话 |
| GET | `/courses/{course_id}/conversations` | 课程成员 | 当前用户的课程会话 |
| GET | `/conversations/{conversation_id}/messages` | 会话所有者 | 历史消息和引用 |
| POST | `/conversations/{conversation_id}/messages/stream` | 会话所有者 | RAG 流式回答 |
| GET | `/courses/{course_id}/students/{student_id}/conversations` | 课程教师 | 查看指定学生会话列表 |
| GET | `/courses/{course_id}/conversations/{conversation_id}/messages` | 课程教师 | 查看完整对话证据、知识点、引用和审核状态 |

SSE 事件：

| 事件 | 数据结构 |
|---|---|
| `text_delta` | `{"delta": "..."}` |
| `citation` | `{"index": 1, "chunk_id": "...", "document_id": "...", "page_start": 1, "page_end": 2}` |
| `error` | `{"detail": "..."}` |
| `done` | `{"conversation_id": "...", "message_id": "..."}` |

历史消息中的引用包含 `citation_index`，表示模型回答使用的原始来源编号。若回答只引用 `[2]`，刷新历史后仍保留编号 `2`，不会重新编号为 `1`。

教师查看学生会话消息时，每条消息额外包含：

```json
{
  "knowledgePointIds": ["uuid"],
  "reviewStatus": "open",
  "citations": []
}
```

知识点关联从现有 `LearningEvent.message_id -> knowledge_point_id` 推导；助手消息会继承最近一条学生问题所关联的知识点。

## 5. 教学规则与学习分析

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/teaching-policy` | 课程成员 | 读取教学规则 |
| PUT | `/courses/{course_id}/teaching-policy` | 课程教师 | 更新教学规则 |
| POST | `/courses/{course_id}/learning-events` | 课程教师 | 记录学习事件 |
| GET | `/courses/{course_id}/students/{student_id}/mastery` | 本人或课程教师 | 查询知识点状态 |

## 6. Dashboard

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/dashboard` | 课程教师 | 课程聚合指标 |
| GET | `/dashboard/overview?courseId={courseId}` | 课程教师 | 教师首页一次性聚合读取 |
| GET | `/courses/{course_id}/chapters/analytics` | 课程教师 | 章节掌握分析 |
| GET | `/courses/{course_id}/knowledge-points/{knowledge_point_id}/analytics` | 课程教师 | 知识点分布 |
| GET | `/courses/{course_id}/students/{student_id}/learning` | 课程教师 | 学生学习证据 |

Dashboard 响应新增字段：

```json
{
  "pending_review_count": 3
}
```

教师首页总览：

```text
GET /api/v1/dashboard/overview?courseId={courseId}
```

```json
{
  "course_id": "uuid",
  "stats": {
    "student_count": 36,
    "active_student_count": 28,
    "weekly_interaction_count": 142,
    "average_mastery": 72.5,
    "attention_knowledge_point_count": 3,
    "pending_review_count": 2
  },
  "trend": [
    {"date": "2026-09-17", "interaction_count": 24, "active_student_count": 18}
  ],
  "insight": {
    "risk_level": "medium",
    "summary": "3 knowledge points need attention and 2 AI answers await review.",
    "generated_at": "2026-09-17T00:00:00Z"
  },
  "chapter_mastery": [],
  "learning_difficulties": [],
  "teacher_actions": []
}
```

`trend[].date` 按 `ECHO_BUSINESS_TIMEZONE` 的业务日历日分组，默认 `Asia/Shanghai`；其他时间字段仍使用 ISO 8601 UTC 表达。
## 7. AI 回答审核

### 7.1 枚举

`reason`：

```text
missing_course_basis
outside_material_heavy
repeated_follow_up
student_not_resolved
teacher_rule_violation
```

`severity`：

```text
low
medium
high
```

`status`：

```text
open
confirmed_correct
marked_incorrect
dismissed
generating
pending_rereview
regeneration_failed
```

### 7.2 查询待审核项

```text
GET /api/v1/courses/{course_id}/review-flags?status=open&severity=high&limit=50
```

权限：课程教师。

响应为审核项数组，每项包含：

```json
{
  "id": "uuid",
  "course_id": "uuid",
  "conversation_id": "uuid",
  "message_id": "uuid",
  "student_id": "uuid",
  "student_display_name": "学生姓名",
  "reason": "missing_course_basis",
  "severity": "high",
  "status": "open",
  "details": {},
  "question": "学生问题",
  "answer": "AI 回答",
  "teacher_note": null,
  "corrected_answer": null,
  "reviewed_by": null,
  "reviewed_at": null,
  "created_at": "2026-09-16T00:00:00Z",
  "updated_at": "2026-09-16T00:00:00Z"
}
```

### 7.3 查询单条

```text
GET /api/v1/courses/{course_id}/review-flags/{flag_id}
```

权限：课程教师。

在原有字段基础上新增 `knowledgePointIds`、`citations`、`current_version`、`generation_status`、`versions` 和 `review_history`。`answer` 仍保留原 Message 回答，不会被重新生成或教师修改稿覆盖。

### 7.4 教师审核

```text
POST /api/v1/courses/{course_id}/review-flags/{flag_id}/review
```

权限：课程教师。

请求示例：

```json
{
  "decision": "mark_incorrect",
  "note": "回答与教材定义冲突。",
  "corrected_answer": "修正后的标准回答。"
}
```

`decision`：

```text
confirm_correct
mark_incorrect
dismiss
```

约束：

- `mark_incorrect` 可以携带 `corrected_answer`。
- `confirm_correct` 和 `dismiss` 不得携带 `corrected_answer`。
- 审核会写入 `reviewed_by` 和 `reviewed_at`。
- 审核同时写入 `review_history`；`mark_incorrect` 携带 `corrected_answer` 时创建 `source=teacher` 的新回答版本。

### 7.5 学生标记未解决

```text
POST /api/v1/courses/{course_id}/messages/{message_id}/not-resolved
```

权限：该助手消息所属会话的学生。

请求示例：

```json
{
  "note": "这个解释没有解决我的问题。"
}
```

行为：

- 仅允许标记属于当前学生和课程的助手消息。
- 同一消息重复标记时保持幂等。
- 已关闭的审核项会重新变为 `open`，严重级别升为 `high`。

### 7.6 重新生成回答

```text
POST /api/v1/courses/{course_id}/review-flags/{flag_id}/regenerate
```

权限：课程教师。

请求：

```json
{
  "instruction": "请按教材定义重写，并补充引用。",
  "base_version": 1
}
```

响应：

```json
{
  "review_id": "uuid",
  "status": "completed",
  "version": 2,
  "answer": "重新生成后的回答",
  "knowledgePointIds": [],
  "citations": [],
  "error": null
}
```

`status` 为 `completed`、`generating` 或 `failed`。同步调用已完成时返回新版本；失败会保留原回答并把审核项置为 `regeneration_failed`，再次调用即可重试。

### 7.7 查询重新生成状态

```text
GET /api/v1/courses/{course_id}/review-flags/{flag_id}/regeneration
```

返回 `status`、`progress`、`version`、`answer`、`error`、`knowledgePointIds` 和 `citations`。

### 7.8 查询回答版本

```text
GET /api/v1/courses/{course_id}/review-flags/{flag_id}/versions
```

返回原回答、重新生成回答和教师修改稿，字段包括 `version`、`answer`、`knowledgePointIds`、`citations`、`source`、`instruction` 和 `created_at`。版本按升序返回。

### 7.9 查询审核历史

```text
GET /api/v1/courses/{course_id}/review-flags/{flag_id}/history
```

返回按发生顺序排列的审核记录，`action` 至少包含：

```text
confirm_correct
mark_incorrect
dismiss
regenerate
```

每条记录包含教师、前后状态、备注、回答快照和修正答案快照。

### 7.10 高级筛选、摘要和上下文

```text
GET /api/v1/courses/{course_id}/review-flags/query?status=open&severity=high&reason=missing_course_basis&studentId=uuid&knowledgePointId=uuid&q=测试&sort=newest&cursor=opaque&limit=50
GET /api/v1/courses/{course_id}/review-flags/summary
GET /api/v1/courses/{course_id}/review-flags/{flag_id}/context
```

`query` 返回 `{ items, total, nextCursor, summary }`，旧 `/review-flags` 数组契约保持不变。`summary` 返回 `pending`、`high_risk`、各 reason 计数、`generating`、`pending_rereview` 和 `regeneration_failed`。`context` 聚合学生问题、当前版本、教材引用、知识点、消息/会话标识、最近 LearningEvent、教学规则和审核历史。

### 7.11 自动检测

当前基础版自动检测：

- 课程存在可检索教材，但 AI 回答没有引用任何课程来源：`missing_course_basis`。
- 课程存在可检索教材，且回答包含明显的课程外补充标记：`outside_material_heavy`。
- 学生重复相同问题，或明确表示“没解决/还是不懂”：`repeated_follow_up`。
- 学生主动点击“没解决”：`student_not_resolved`。

`teacher_rule_violation` 已保留为稳定枚举，但自动检测将在后续审核版本中启用。

## 8. 教师端资源与证据接口

### 8.1 知识点与学生长期证据

```text
GET /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/mastery-trend?days=30
GET /api/v1/courses/{course_id}/knowledge-points/{knowledge_point_id}/error-patterns?days=30
GET /api/v1/courses/{course_id}/students/{student_id}/mastery-trend?days=90
GET /api/v1/courses/{course_id}/students/{student_id}/error-patterns?days=90
```

掌握趋势返回 `range.start_date`、`range.end_date`、`range.days` 和按日期升序的真实 `points`，不插值。错误聚类只聚合可回查的 LearningEvent，每个 pattern 返回 `sample_evidence_ids`。

### 8.2 习题与外部资源

```text
GET/POST /api/v1/courses/{course_id}/question-items
GET/PATCH/DELETE /api/v1/courses/{course_id}/question-items/{question_item_id}
GET/POST /api/v1/courses/{course_id}/external-resources
PATCH/DELETE /api/v1/courses/{course_id}/external-resources/{resource_id}
```

列表统一返回 `items`、`total`、`next_cursor`，支持 `cursor`、`limit` 和知识点筛选。习题类型包括 `single_choice`、`multiple_choice`、`true_false`、`short_answer`、`coding`、`experiment`。

资源类型统一为：

```text
textbook
outline
question_bank
code_example
lab
external_link
```

### 8.3 PDF 文件、页面与索引

```text
GET /api/v1/courses/{course_id}/documents/{document_id}/file
GET /api/v1/courses/{course_id}/documents/{document_id}/pages/{page_number}
GET /api/v1/courses/{course_id}/documents/{document_id}/index-status
GET /api/v1/courses/{course_id}/documents/{document_id}/citations
```

文件接口返回 `application/pdf` 并支持 HTTP Range。页面接口返回宽高、文本和 Chunk blocks；只有 Chunk 元数据存在真实 `bbox` 时返回坐标，否则 `bbox=null`。

### 8.4 回收站与知识图谱

```text
GET /api/v1/courses/{course_id}/resources?trashed=true
POST /api/v1/courses/{course_id}/resources/{resource_id}/trash
POST /api/v1/courses/{course_id}/resources/{resource_id}/restore
DELETE /api/v1/courses/{course_id}/resources/{resource_id}?permanent=true
GET /api/v1/courses/{course_id}/knowledge-graph?chapterId=&pointId=
```

回收站覆盖普通资源、章节、知识点、习题和外部资源。永久删除必须显式传 `permanent=true`，并返回受影响引用数量。图谱节点和边全部来自数据库，不使用前端模拟关系。

软删除的文档、章节和知识点不再参与 RAG、结构读取、图谱、长期证据或资源关联；删除父文档或章节后，其子项在恢复父级前保持隐藏。非课程成员访问教师资源返回 `403`，课程不存在返回 `404`，恢复知识点产生名称冲突返回 `409`。PATCH 请求显式传入非空字段的 `null` 返回 `422`。

永久删除文档在一个事务内清理章节、知识点、学习状态、Chunk 和页面，并解除 QuestionItem 与 Citation 的文档引用；失败时整体回滚，不保留部分删除结果。

## 9. 教学策略与执行计划

### 9.1 核心枚举

- `TeachingStrategyType`: `content_adjustment`、`teaching_method`、`differentiated_instruction`、`assignment_design`、`classroom_interaction`
- `TeachingStrategyPriority`: `high`、`medium`、`low`
- `TeachingStrategyStatus`: `suggested`、`accepted`、`planned`、`active`、`paused`、`completed`、`dismissed`
- `ExecutionPlanStatus`: `draft`、`ready`、`active`、`paused`、`completed`、`cancelled`
- `PlanTaskType`: `supplementary_practice`、`resource_push`、`classroom_lecture`、`quick_check`、`individual_tutoring`、`project_task`
- `PlanTaskStatus`: `not_started`、`in_progress`、`completed`、`overdue`、`cancelled`
- `PlanTargetScope`: `whole_class`、`student_group`、`custom_students`

AI 生成策略初始状态只能是 `suggested`，AI 生成周计划只能作为 `draft` 返回。只有教师动作可以改变策略计划状态；教师动作才会产生 `accepted`、`planned`、`active`、`paused` 或 `completed`。

### 9.2 Teaching Strategy

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/teaching-strategies` | 课程教师 | 按 `status`、`type`、`priority` 筛选，返回 `items,total,nextCursor` |
| POST | `/courses/{course_id}/teaching-strategies/generate` | 课程教师 | AI 生成策略草稿，初始 `suggested` |
| POST | `/courses/{course_id}/teaching-strategies` | 课程教师 | 手工创建策略草稿 |
| GET | `/teaching-strategies/{strategy_id}` | 课程教师 | 策略详情、目标学生/知识点、资源、版本和关联计划 |
| PATCH | `/teaching-strategies/{strategy_id}` | 课程教师 | 修改策略并写入新版本 |
| POST | `/teaching-strategies/{strategy_id}/actions` | 课程教师 | `accept`、`dismiss`、`activate`、`pause`、`resume`、`complete` |
| GET | `/teaching-strategies/{strategy_id}/versions` | 课程教师 | 返回策略版本快照和动作 |
| GET | `/teaching-strategies/{strategy_id}/effect` | 课程教师 | 返回策略关联计划的观察效果 |

生成请求使用 `knowledgePointIds`、`studentIds`、`insightIds` 和 `timeRangeDays`。策略详情区分 `source` 与 `generated_context`，并返回 `version`、`change_history`、`linked_plans` 和真实 `evidence`。

### 9.3 Execution Plan 与周计划

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/execution-plans` | 课程教师 | 按 `strategyId`、`status` 查询计划 |
| POST | `/courses/{course_id}/execution-plans` | 课程教师 | 创建草稿或教师明确发布的计划 |
| GET | `/execution-plans/{plan_id}` | 课程教师 | 计划详情、目标、资源、周计划、任务、最近 LearningEvent 和进度 |
| PATCH | `/execution-plans/{plan_id}` | 课程教师 | 修改计划配置 |
| POST | `/execution-plans/{plan_id}/actions` | 课程教师 | `publish`、`pause`、`resume`、`complete`、`cancel` |
| POST | `/execution-plans/{plan_id}/generate-weekly-plan` | 课程教师 | AI 生成或显式重新生成周计划草案 |

周计划生成响应固定包含 `status: draft`、`generation_id`、`weeks` 和 `recommendations`。未发布计划在生成前后保持 `draft`；发布由教师 `publish` 动作完成。暂停、继续和完成不会删除历史任务或 LearningEvent。

### 9.4 Plan Task 与计划 LearningEvent

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/execution-plans/{plan_id}/tasks` | 课程教师 | 按 `status`、`week` 查询任务 |
| PATCH | `/plan-tasks/{task_id}` | 课程教师 | 修改任务内容、状态、截止时间和关联对象 |
| GET | `/execution-plans/{plan_id}/learning-events` | 课程教师 | 按学生、任务、知识点、事件类型查询计划事件 |

任务返回 `completion: {completed,total}`。计划 LearningEvent 复用现有 `LearningEvent`，通过 `planId`、`taskId`、`weekNumber` 回溯计划，并返回学生、知识点和 `correct/wrong/completed/unresolved` 结果。

### 9.5 Effect

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/execution-plans/{plan_id}/effect` | 课程教师 | 计划观察效果 |
| GET | `/teaching-strategies/{strategy_id}/effect` | 课程教师 | 策略关联计划观察效果 |

效果响应包含 `metrics`、`task_effectiveness`、`remaining_issues`、`facts`、`ai_explanation` 和 `insufficient_evidence`。`facts` 只描述观察到的变化，不使用因果断言；样本不足时 `insufficient_evidence=true`。

## 10. 接口冻结规则

- 已登记的方法、路径和枚举值视为稳定契约。
- 新功能只能新增可选字段、新枚举值或新路径。
- 不得无迁移地改名或删除现有字段。
- 破坏性变更必须提升版本并同步本文档与 `INDEX.md`。
- 前端不得依赖未登记字段。 
