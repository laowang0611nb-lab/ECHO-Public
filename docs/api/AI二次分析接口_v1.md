# ECHO AI 二次分析接口 v1

版本：`v1.0`
状态：后端已实现
迁移 head：`f4a5b6c7d8e9`

## 1. 目标

AI 二次分析基于已经持久化的学习证据继续推理：

```text
现象 → 原因 → 影响学生 → 证据 → 教学建议
```

它不是重新生成 AI 回答，也不会在证据不足时编造原因。

## 2. 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/courses/{course_id}/ai-analysis` | 创建一次初始分析 |
| GET | `/api/v1/courses/{course_id}/ai-analysis` | 分页查询课程分析记录 |
| GET | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}` | 查询完整状态、结果和证据 |
| GET | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/result` | 只查询分析结果 |
| POST | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze` | 基于完成的分析创建二次分析 |
| POST | `/api/v1/courses/{course_id}/ai-analysis/{analysis_id}/strategy` | 将建议转为 `suggested` 教学策略 |

所有接口仅课程教师可访问。

## 3. 创建初始分析

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
  "focus": "进一步确认错误原因"
}
```

约束：

- `scope` 为 `whole_class`、`student_group` 或 `custom_students`。
- `whole_class` 不得提交 `student_ids`。
- 学生范围分析必须提交非空 `student_ids`。
- `time_range_days` 范围为 7 至 180 天。
- 知识点必须属于当前课程，且章节和教材未被删除。

成功响应包含：

```json
{
  "id": "uuid",
  "analysis_type": "initial",
  "status": "completed",
  "scope": "whole_class",
  "evidence": [],
  "result": {
    "conclusion": "",
    "root_cause": "",
    "recommendation": "",
    "affected_student_ids": [],
    "facts": [
      {
        "fact": "",
        "evidence_ids": []
      }
    ],
    "evidence_summary": [],
    "recommendation_payload": {},
    "insufficient_evidence": false,
    "model_name": "qwen3.8-flash",
    "strategy_id": null,
    "generated_at": "ISO-8601"
  }
}
```

## 4. 查询状态

完整查询返回：

- 分析状态：`analyzing`、`completed` 或 `failed`。
- 失败原因。
- 课程、知识点、学生范围、时间窗口。
- 全部持久化证据。
- 结构化结果。
- 已关联的教学策略 ID。

结果接口只返回 `result` 对象。

## 5. 进一步分析

```http
POST /api/v1/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze
Content-Type: application/json
```

请求：

```json
{
  "focus": "进一步确认错误类型",
  "time_range_days": 42
}
```

规则：

- 只能基于 `completed` 的初始分析继续分析。
- 不覆盖原分析记录。
- 新记录类型为 `secondary`，并通过 `previous_analysis_id` 链接原记录。
- 原分析结果会作为 `initial_analysis` 证据加入新分析。
- 二次分析不能再次递归触发。

## 6. 证据来源

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

每条证据保留：

- 课程和知识点范围。
- 学生 ID。
- 原实体 ID。
- 证据描述。
- 当时的证据快照。
- 创建时间。

AI 返回的每条事实必须引用当前分析中真实存在的 `evidence_id`。无效引用会被丢弃。

## 7. 证据不足规则

以下情况返回 `insufficient_evidence=true`：

- 可用证据少于 2 条。
- AI 明确返回证据不足。
- AI 没有返回任何带有效证据 ID 的事实。

证据不足时：

- 不生成教学策略。
- 返回“现有证据不足”的结论和补充证据建议。
- 不把模型推测保存为确定原因。

## 8. 转教学策略

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

## 9. 状态与并发

分析记录先以 `analyzing` 持久化，再执行证据聚合和模型推理。成功进入 `completed`，失败进入 `failed` 并保存错误摘要。

当前版本采用同步请求完成分析，接口状态已经按后续任务队列兼容的方式设计。

## 10. OpenAPI 与共享客户端

共享客户端方法：

```text
createAIAnalysis
listAIAnalyses
getAIAnalysis
getAIAnalysisResult
reanalyzeAIAnalysis
createStrategyFromAIAnalysis
```
