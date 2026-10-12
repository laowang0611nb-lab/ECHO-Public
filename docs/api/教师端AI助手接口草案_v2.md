# ECHO 教师端 AI 助手接口草案 v2

版本：`v2.0`  
状态：后端与共享契约已实现  
更新日期：2026-10-12  
范围：FastAPI 后端、shared-types、api-client，不包含教师 UI  
优先级：用户最新需求 > v2 > v1

本文档替代 v1 的会话持久化设计。v1 保留用于追溯，不再描述最终接口。

## 1. v1 与 v2 的差异

v1 曾定义：

- `/assistant/conversations` 系列接口；
- 服务端会话和消息持久化；
- 教师助手会话、证据和工具运行表。

v2 明确移除以上内容：

- 不新增 Teacher Assistant ORM model；
- 不新增 Alembic migration；
- 不提供会话列表、历史查询或服务器端消息恢复；
- 对话历史只保存在浏览器会话缓存；
- 前端每次最多携带最近 16 条消息，即约 8 轮；
- 历史消息只用于理解“他”“刚才”“这个知识点”等指代，不作为事实证据和权限依据。

用户界面入口以最新教师端设计为准：位于 Header 右上角通知区域旁。旧 v1 中的左上角入口描述不再作为最终规格。

## 2. 外部端点

| HTTP | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/courses/{course_id}/assistant/capabilities` | 助手可用性、输入限制和引导问题 |
| POST | `/api/v1/courses/{course_id}/assistant/messages` | 非流式问答，用于测试和降级 |
| POST | `/api/v1/courses/{course_id}/assistant/messages/stream` | SSE 流式问答，教师端主接口 |

所有接口均使用当前认证方案，并要求当前课程教师权限。控制器内部通过现有 `ensure_course_teacher` 语义校验。

## 3. 共享 Client

```ts
getTeacherAssistantCapabilities(
  userId: string,
  courseId: string,
): Promise<TeacherAssistantCapabilities>;

sendTeacherAssistantMessage(
  userId: string,
  courseId: string,
  payload: TeacherAssistantMessageCreateRequest,
): Promise<TeacherAssistantMessage>;

streamTeacherAssistantMessage(
  userId: string,
  courseId: string,
  payload: TeacherAssistantMessageCreateRequest,
  options?: { signal?: AbortSignal },
): AsyncGenerator<TeacherAssistantStreamEvent>;
```

流式方法复用 `packages/api-client` 的通用 `parseSseEvents`，不复制第二套 SSE parser。

## 4. Capabilities

```http
GET /api/v1/courses/{course_id}/assistant/capabilities
```

响应：

```json
{
  "enabled": true,
  "read_only": true,
  "streaming": true,
  "memory_mode": "client_session",
  "max_message_chars": 4000,
  "max_context_days": 180,
  "supported_pages": [
    "dashboard",
    "ai_insights",
    "student_analytics",
    "student_detail",
    "student_conversation",
    "knowledge_base",
    "knowledge_point_detail",
    "ai_review",
    "teaching_strategy",
    "execution_plan",
    "courses",
    "unknown"
  ],
  "suggested_prompts": [
    "这门课最近一周学习情况怎么样？",
    "最近学生主要在问什么？",
    "带我去 AI 审核页面"
  ]
}
```

`enabled=false` 时，消息接口返回 `503 ASSISTANT_DISABLED`。不会返回硬编码演示答案。

## 5. 请求结构

```json
{
  "client_message_id": "4c7d2f0e-6fa0-4e47-8e68-5af0a9f0d2a1",
  "content": "张三最近为什么下降？",
  "history": [
    {
      "role": "user",
      "content": "帮我看看张三"
    },
    {
      "role": "assistant",
      "content": "我会重新查询课程数据。"
    }
  ],
  "page_context": {
    "page": "student_detail",
    "student_id": "uuid",
    "time_range_days": 7
  },
  "locale": "zh-CN"
}
```

字段约束：

- `client_message_id` 是 UUID，仅用于请求追踪和前端防重复点击，不提供数据库级幂等承诺。
- `content` 长度为 1 到 4000 字符。
- `history` 最多 16 条，单条最多 1500 字符。
- `time_range_days` 范围为 7 到 180；未提供时默认最近 7 天。
- `history` 和页面上下文都不是可信事实或授权凭据。

页面上下文支持：

```ts
type TeacherAssistantPage =
  | "dashboard"
  | "ai_insights"
  | "student_analytics"
  | "student_detail"
  | "student_conversation"
  | "knowledge_base"
  | "knowledge_point_detail"
  | "ai_review"
  | "teaching_strategy"
  | "execution_plan"
  | "courses"
  | "unknown";

interface TeacherAssistantPageContext {
  page: TeacherAssistantPage;
  student_id?: string | null;
  conversation_id?: string | null;
  knowledge_point_id?: string | null;
  review_flag_id?: string | null;
  strategy_id?: string | null;
  plan_id?: string | null;
  time_range_days?: number | null;
}
```

跨课程或已删除的对象 ID 返回 `422 ASSISTANT_CONTEXT_INVALID`。

## 6. 非流式响应

```json
{
  "id": "temporary-uuid",
  "role": "assistant",
  "content": "张三最近 7 天的平均掌握度下降。现有证据显示...",
  "status": "complete",
  "insufficient_evidence": false,
  "suggested_actions": [
    {
      "id": "student-uuid",
      "label": "查看张三的学情",
      "reason": "查看该学生的掌握状态和学习事件。",
      "target": {
        "type": "student_detail",
        "course_id": "uuid",
        "student_id": "uuid"
      }
    }
  ],
  "created_at": "ISO-8601"
}
```

`id` 是本次结果的临时 UUID，不对应数据库消息表。

## 7. SSE

```http
POST /api/v1/courses/{course_id}/assistant/messages/stream
Content-Type: application/json
Accept: text/event-stream
```

事件示例：

```text
event: message_start
data: {"client_message_id":"uuid","assistant_message_id":"uuid"}

event: status
data: {"stage":"querying_course","label":"正在读取课程真实数据"}

event: text_delta
data: {"delta":"最近 7 天课程..."}

event: suggested_actions
data: {"items":[]}

event: done
data: {"assistant_message":{}}
```

事件规则：

- `done.data.assistant_message` 是最终权威结果，不是数据库持久化消息。
- `suggested_actions` 以 `done` 中的最终值为准。
- `error` 至少包含 `code`、`message`、`retryable`。
- 建连前错误使用项目统一 HTTP 错误结构。
- 客户端 abort 后应释放上游 HTTP 和数据库会话资源。

## 8. 导航动作白名单

`target.type` 只允许：

```text
dashboard
ai_insights
students_list
student_detail
student_conversation
knowledge_base
knowledge_point_detail
ai_review
ai_review_pending
review_flag
teaching_strategies
teaching_strategy
execution_plans
execution_plan
courses
course_detail
```

动作由服务端根据真实课程对象构造。模型不能直接生成 URL、路径、HTML 按钮或任意 target type。对象已删除、跨课程或无法查证时不返回详情按钮。

## 9. 实际只读工具

| 内部工具 | 实际来源 |
|---|---|
| `get_course_overview` | `dashboard.py` 教师 Dashboard 聚合 |
| `list_course_students` | `course_members + users + 掌握状态 + LearningEvent` |
| `get_student_learning_snapshot` | `dashboard_details.py` 学生学习详情 |
| `get_student_mastery_trend` | `knowledge_analytics.py` 掌握快照趋势 |
| `get_student_error_patterns` | `knowledge_analytics.py` 错误事件聚类 |
| `get_knowledge_point_analytics` | `dashboard_details.py` 知识点掌握分布 |
| `get_course_question_summary` | 当前课程学生 Conversation/Message 限量聚合 |
| `get_review_summary` | `review_workflow.py` 审核摘要 |
| `list_teaching_strategies` | `teaching_strategy.py` |
| `get_teaching_strategy_effect` | `plan_effects.py` |
| `get_execution_plan_effect` | `plan_effects.py` |
| `get_feature_navigation` | 后端静态功能目录和导航白名单 |

Qwen Provider 当前没有经过验证的原生 tool calling。本版采用确定性意图路由和有界工具查询，再由 Qwen 对结构化事实生成文字，不把模型输出当 SQL、工具名或授权凭据。

硬限制：

- 最多 8 次工具调用。
- 工具结果和学生消息均限量。
- 验证失败、超时或依赖不可用时返回证据不足或稳定错误。
- 不提供任意 SQL、外部 HTTP、文件系统或写操作工具。

## 10. 错误码

| 错误码 | HTTP | 说明 |
|---|---:|---|
| `ASSISTANT_DISABLED` | 503 | 助手关闭或模型未配置 |
| `ASSISTANT_FORBIDDEN` | 403 | 非当前课程教师 |
| `ASSISTANT_COURSE_NOT_FOUND` | 404 | 课程不存在 |
| `ASSISTANT_CONTEXT_INVALID` | 422 | 页面对象非法、跨课程或已删除 |
| `ASSISTANT_PROVIDER_UNAVAILABLE` | 503 | 模型调用失败或超时 |
| `ASSISTANT_TOOL_UNAVAILABLE` | 503 | 只读依赖暂时不可用 |

## 11. 数据库与持久化

本版没有新增迁移。以下表不会被创建：

```text
teacher_assistant_conversations
teacher_assistant_messages
teacher_assistant_message_evidence
teacher_assistant_tool_runs
```

服务器仅记录必要的运维元数据。学生原消息、学习事件、审核、策略和计划不会因教师助手请求发生写入。

## 12. OpenAPI 路径

```text
GET  /api/v1/courses/{course_id}/assistant/capabilities
POST /api/v1/courses/{course_id}/assistant/messages
POST /api/v1/courses/{course_id}/assistant/messages/stream
```

## 13. 已知边界

- Agent 不是无限循环的通用规划器，而是确定性路由 + 有界查询。
- 学生提问摘要只读取当前课程教师有权访问的数据。
- 策略与计划只有在页面上下文提供合法 ID 时才读取详细效果；否则返回列表入口。
- 前端需要自行维护 `sessionStorage` 历史，断线恢复由前端重试或保留已收到文本完成。
