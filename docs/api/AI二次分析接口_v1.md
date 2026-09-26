# ECHO AI 二次分析接口 v1

版本：`v1.1`
状态：后端已实现异步真实进度
迁移 head：`c7d8e9f0a1b2`

## 1. 目标

AI 二次分析基于已经持久化的学习证据继续推理：

```text
现象 -> 原因 -> 影响学生 -> 证据 -> 教学建议
```

分析默认以异步任务执行。接口立即持久化 `analyzing` 记录并返回 `202`，客户端轮询真实阶段进度，不再在页面本地模拟五阶段。

## 2. 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/courses/{course_id}/ai-analysis` | 创建初始分析，默认返回 `202` |
| GET | `/api/v1/courses/{course_id}/ai-analysis` | 分页查询分析记录 |
| GET | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}` | 查询完整状态、结果和证据 |
| GET | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/progress` | 轮询阶段、百分比、心跳与错误 |
| GET | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/result` | 只查询分析结果 |
| POST | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze` | 基于完成的分析创建二次分析 |
| POST | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/strategy` | 将建议转为 `suggested` 教学策略 |

所有接口仅课程教师可访问，课程归属和权限错误沿用现有 `403`、`404`、`409` 语义。

## 3. 异步创建

```http
POST /api/v1/courses/{course_id}/ai-analysis
Content-Type: application/json
```

请求：

```json
{
  "knowledge_point_id": "uuid-or-null",
  "scope": "whole_class",
  "student_ids": [],
  "time_range_days": 28,
  "focus": "进一步确认错误原因",
  "async": true,
  "client_request_id": "web-analysis-20260923-001"
}
```

规则：

- `async` 默认 `true`。默认返回 `202 Accepted` 和 `status=analyzing` 的分析记录。
- 兼容同步执行时可传 `"async": false`，此时等待分析完成后返回 `200 OK`。
- `client_request_id` 可选，同一课程、同一教师、同一请求 ID 重试返回同一分析记录，不重复创建。
- `scope` 为 `whole_class`、`student_group` 或 `custom_students`。
- `whole_class` 不得提交 `student_ids`；学生范围分析必须提交非空 `student_ids`。
- `time_range_days` 范围为 7 至 180 天。
- 知识点必须属于当前课程，且章节和教材未被删除。

异步响应包含：

```json
{
  "id": "uuid",
  "analysis_id": "uuid",
  "analysis_type": "initial",
  "status": "analyzing",
  "client_request_id": "web-analysis-20260923-001",
  "progress": {
    "stage": "collecting_previous_analysis",
    "stage_label": "收集已有分析结果",
    "percent": 10,
    "message": "收集已有分析结果",
    "heartbeat_at": "ISO-8601"
  }
}
```

## 4. 阶段进度

固定阶段和百分比：

| 阶段 | 标签 | 百分比 |
|---|---|---:|
| `collecting_previous_analysis` | 收集已有分析结果 | 10 |
| `querying_evidence` | 查询关联学习证据 | 30 |
| `expanding_knowledge_graph` | 扩展知识关系 | 50 |
| `analyzing_student_impact` | 分析影响学生 | 70 |
| `generating_recommendation` | 生成教学建议 | 90 |
| 完成 | 分析完成 | 100 |

阶段只能顺序前进，百分比单调不减。执行期间后台任务每 5 秒更新一次 `heartbeat_at`；可通过 `ECHO_ANALYSIS_PROGRESS_HEARTBEAT_SECONDS` 调整。

```http
GET /api/v1/courses/{course_id}/ai-analysis/{analysis_id}/progress
```

响应：

```json
{
  "analysis_id": "uuid",
  "status": "analyzing",
  "stage": "expanding_knowledge_graph",
  "stage_label": "扩展知识关系",
  "percent": 50,
  "message": "扩展知识关系",
  "started_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "heartbeat_at": "ISO-8601",
  "completed_at": null,
  "error_message": null
}
```

失败时：

- `status=failed`
- 保留最后阶段和阶段百分比
- `error_message` 保存可读错误
- `completed_at` 记录失败终止时间

证据不足不是失败：任务按正常五阶段结束，返回 `status=completed`、`percent=100`、`insufficient_evidence=true`。

## 5. 完整状态、列表和历史记录

`AIAnalysisResponse` 和列表项均包含 `progress`。完整响应还包含：

- 分析状态：`analyzing`、`completed` 或 `failed`
- `client_request_id`
- 课程、知识点、学生范围、时间窗口
- 全部持久化证据
- 结构化结果
- 已关联的教学策略 ID

旧的已完成记录没有阶段数据时，详情和列表兼容返回：

```json
{
  "stage": null,
  "stage_label": null,
  "percent": 100,
  "message": "分析完成"
}
```

不会因为缺少新进度字段返回 `500`。

## 6. 进一步分析

```http
POST /api/v1/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze
Content-Type: application/json
```

请求：

```json
{
  "focus": "进一步确认错误类型",
  "time_range_days": 42,
  "async": true,
  "client_request_id": "web-reanalysis-20260923-001"
}
```

规则：

- 只能基于 `completed` 的初始分析继续分析。
- 不覆盖原分析记录。
- 新记录类型为 `secondary`，并通过 `previous_analysis_id` 链接原记录。
- 原分析结果会作为 `initial_analysis` 证据加入新分析。
- 二次分析不能再次递归触发。
- 默认异步返回 `202`，也支持 `"async": false`。

## 7. 证据来源

`AIAnalysisEvidence.source_type` 支持：

```text
initial_analysis
learning_event
mastery_snapshot
quick_check_attempt
conversation_message
review_flag
message_citation
knowledge_chunk
```

AI 返回的每条 fact 必须引用当前分析中真实存在的 `evidence_id`。无效引用会被丢弃。

## 8. 证据不足规则

以下情况返回 `insufficient_evidence=true`：

- 可用证据少于 2 条。
- AI 明确返回证据不足。
- AI 没有返回任何带有效证据 ID 的事实。

证据不足时仍完成阶段进度，但不生成教学策略。

后端**保留模型自己的解释**，只在字段为空时使用安全兜底文案：

- `conclusion`、`root_cause`、`recommendation` 优先保存模型返回值。
- `insufficient_reason` 保存模型给出的不足原因；模型未提供时由分类推导。
- `insufficient_categories` 为结构化分类数组，取值：

```text
no_evidence              没有可用的持久化证据
partial_coverage         证据只覆盖部分学生或知识点
conflicting_evidence     证据之间互相冲突
missing_causal_evidence  缺少能确认因果链的关键证据
model_uncertain          证据存在但模型无法确认结论
```

- `facts` 在证据不足时照常返回，前端可展示已确认的事实与其证据来源。
- 旧记录没有这两个字段时，接口返回 `insufficient_reason: null` 与 `insufficient_categories: []`，不会报错。

## 9. 转教学策略

```http
POST /api/v1/courses/{course_id}/ai-analysis/{analysis_id}/strategy
Content-Type: application/json
```

请求字段均可选：

```json
{
  "title": "针对性教学建议",
  "description": "教师可修改后的策略说明",
  "type": "content_adjustment",
  "priority": "medium"
}
```

行为：

- 仅允许证据充足的分析结果创建策略。
- 策略初始状态固定为 `suggested`。
- 自动关联分析中的知识点和目标学生。
- 重复调用返回已关联的策略，不重复创建。
- 后续仍由教师通过现有策略动作接口采纳、发布或忽略。

## 10. OpenAPI 与共享客户端

共享客户端方法：

```text
createAIAnalysis
listAIAnalyses
getAIAnalysis
getAIAnalysisProgress
getAIAnalysisResult
reanalyzeAIAnalysis
createStrategyFromAIAnalysis
```

前端精确调用签名：

```ts
getAIAnalysisProgress(
  userId: string,
  courseId: string,
  analysisId: string,
): Promise<AIAnalysisProgressResponse>
```

创建与重分析请求支持 `async?: boolean`、`run_async?: boolean` 和 `client_request_id?: string | null`。
