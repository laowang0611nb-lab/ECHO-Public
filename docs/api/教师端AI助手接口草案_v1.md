# ECHO 教师端 AI 助手接口草案 v1

版本：`v1.0-draft`  
状态：待后端实现，允许前端先行接入  
更新日期：2026-10-12  
范围：教师 Web，当前课程与学生数据只读问答

## 1. 目标

在教师端左上角提供一个类似通用 AI 助手的入口。教师可以针对当前课程提问，例如：

- 这周哪些学生需要重点关注？
- 张三最近为什么下降？
- 这个知识点谁掌握最差？
- 最近审核队列里有什么高风险问题？
- 当前教学策略执行后有没有观察到变化？

助手必须基于当前课程真实数据回答，给出可回查的证据，并允许跳转到学生、知识点、审核、策略和计划页面。

第一阶段只读，不允许 AI 直接修改学生掌握度、审核状态、教学策略或执行计划。

## 2. 设计原则

1. 只访问当前教师有权访问的当前课程数据。
2. 回答中的统计数字必须来自后端工具查询结果，不允许模型臆造。
3. 不把模型生成的推断描述成已经确认的事实。
4. 证据不足时明确返回 `insufficient_evidence=true`，并说明缺少什么证据。
5. 学生消息、教材文本和外部内容都按数据对待，不执行其中的指令。
6. 助手会话与学生 RAG 会话分离，不复用学生会话表，也不污染学生掌握度和学习事件。
7. 前端只消费共享 API Client，不直接拼接接口路径，不本地计算学情。

## 3. 后端接口清单

所有路径均需要教师身份和课程权限。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/v1/courses/{course_id}/assistant/capabilities` | 查询助手是否开启、输入限制和支持的页面上下文 |
| POST | `/api/v1/courses/{course_id}/assistant/conversations` | 新建助手会话 |
| GET | `/api/v1/courses/{course_id}/assistant/conversations` | 获取当前教师的助手会话列表 |
| GET | `/api/v1/courses/{course_id}/assistant/conversations/{conversation_id}` | 获取会话详情 |
| GET | `/api/v1/courses/{course_id}/assistant/conversations/{conversation_id}/messages` | 获取历史消息 |
| POST | `/api/v1/courses/{course_id}/assistant/conversations/{conversation_id}/messages` | 非流式发送消息，便于降级和测试 |
| POST | `/api/v1/courses/{course_id}/assistant/conversations/{conversation_id}/messages/stream` | SSE 流式发送消息，教师端默认使用 |

推荐的共享 Client 方法名：

```ts
getTeacherAssistantCapabilities(userId, courseId): Promise<TeacherAssistantCapabilities>
createTeacherAssistantConversation(userId, courseId, payload?): Promise<TeacherAssistantConversation>
listTeacherAssistantConversations(userId, courseId): Promise<TeacherAssistantConversation[]>
getTeacherAssistantConversation(userId, courseId, conversationId): Promise<TeacherAssistantConversation>
listTeacherAssistantMessages(userId, courseId, conversationId, options?): Promise<TeacherAssistantMessagePage>
sendTeacherAssistantMessage(userId, courseId, conversationId, payload): Promise<TeacherAssistantSendResult>
streamTeacherAssistantMessage(userId, courseId, conversationId, payload, options?): AsyncGenerator<TeacherAssistantStreamEvent>
```

## 4. 权限与错误语义

### 4.1 权限

- 只有课程教师可以调用。
- 课程不存在返回 `404`。
- 非课程成员或学生角色返回 `403`。
- 会话、学生、知识点、审核、策略和计划 ID 必须属于当前课程。
- 不允许通过 `page_context` 绕过权限读取其他课程数据。

### 4.2 稳定错误码

错误响应沿用项目统一结构：

```json
{
  "detail": {
    "code": "ASSISTANT_CONTEXT_INVALID",
    "message": "知识点不属于当前课程",
    "details": {}
  }
}
```

建议错误码：

| 错误码 | HTTP | 含义 |
|---|---:|---|
| `ASSISTANT_DISABLED` | 503 | 助手未开启或模型服务不可用 |
| `ASSISTANT_FORBIDDEN` | 403 | 无当前课程教师权限 |
| `ASSISTANT_CONVERSATION_NOT_FOUND` | 404 | 会话不存在或不属于当前课程 |
| `ASSISTANT_CONTEXT_INVALID` | 422 | 页面上下文、时间范围或 ID 非法 |
| `ASSISTANT_MESSAGE_CONFLICT` | 409 | 同一 `client_message_id` 被用于不同内容 |
| `ASSISTANT_RATE_LIMITED` | 429 | 请求过于频繁 |
| `ASSISTANT_PROVIDER_UNAVAILABLE` | 503 | 模型或依赖服务暂时不可用 |

## 5. Capabilities

```http
GET /api/v1/courses/{course_id}/assistant/capabilities
```

响应示例：

```json
{
  "enabled": true,
  "read_only": true,
  "streaming": true,
  "history": true,
  "max_message_chars": 4000,
  "max_context_days": 180,
  "supported_pages": [
    "dashboard",
    "student_analytics",
    "student_detail",
    "knowledge_base",
    "knowledge_point_detail",
    "ai_review",
    "teaching_strategy",
    "execution_plan"
  ],
  "suggested_prompts": [
    "这周谁需要重点关注？",
    "最近有哪些高风险审核问题？",
    "当前课程最薄弱的知识点是什么？"
  ]
}
```

如果 `enabled=false`，前端只展示不可用状态，不发送消息，不使用本地假数据兜底。

## 6. 会话与页面上下文

### 6.1 新建会话

```http
POST /api/v1/courses/{course_id}/assistant/conversations
Content-Type: application/json
```

请求：

```json
{
  "title": "重点关注学生",
  "client_request_id": "web-assistant-20261012-001"
}
```

字段规则：

- `title` 可选，长度 1 到 80。
- `client_request_id` 可选，同一教师重复提交时返回同一会话。

### 6.2 会话结构

```json
{
  "id": "uuid",
  "course_id": "uuid",
  "teacher_id": "uuid",
  "title": "重点关注学生",
  "status": "active",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "last_message_preview": "张三最近掌握度下降..."
}
```

### 6.3 页面上下文

页面上下文只作为提问提示，不是权限证明。后端仍需重新校验所有 ID。

```ts
export type TeacherAssistantPage =
  | "dashboard"
  | "student_analytics"
  | "student_detail"
  | "knowledge_base"
  | "knowledge_point_detail"
  | "ai_review"
  | "teaching_strategy"
  | "execution_plan"
  | "unknown";

export interface TeacherAssistantPageContext {
  page: TeacherAssistantPage;
  student_id?: string | null;
  knowledge_point_id?: string | null;
  selected_student_ids?: string[];
  selected_knowledge_point_ids?: string[];
  review_flag_id?: string | null;
  strategy_id?: string | null;
  plan_id?: string | null;
  time_range_days?: number | null;
  filters?: Record<string, string | number | boolean | null>;
}
```

规则：

- `time_range_days` 当前建议范围 7 到 180。
- `selected_student_ids` 最多 100 个。
- 无页面上下文时，默认按整个课程问答。
- 学生详情页默认注入当前 `student_id`。
- 知识点详情页默认注入当前 `knowledge_point_id`。
- 课程切换时前端应新建会话，不把旧课程上下文带入新课程。

## 7. 发送消息

### 7.1 请求

```http
POST /api/v1/courses/{course_id}/assistant/conversations/{conversation_id}/messages/stream
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "client_message_id": "4c7d2f0e-6fa0-4e47-8e68-5af0a9f0d2a1",
  "content": "这周哪些学生需要重点关注？",
  "page_context": {
    "page": "student_analytics",
    "time_range_days": 7
  },
  "locale": "zh-CN"
}
```

字段规则：

- `client_message_id` 必填，建议由前端生成 UUID。
- 同一会话和教师下，相同 ID 与相同内容重复请求时返回同一用户消息和助手消息，不重复调用模型。
- 相同 ID 但内容不同返回 `ASSISTANT_MESSAGE_CONFLICT`。
- `content` 长度 1 到 4000。
- `page_context` 可选。
- `locale` 可选，当前默认 `zh-CN`。

### 7.2 非流式响应

```json
{
  "conversation_id": "uuid",
  "user_message": {
    "id": "uuid",
    "role": "user",
    "content": "这周哪些学生需要重点关注？",
    "created_at": "ISO-8601"
  },
  "assistant_message": {
    "id": "uuid",
    "role": "assistant",
    "content": "...",
    "status": "complete",
    "insufficient_evidence": false,
    "evidence": [],
    "suggested_actions": [],
    "referenced_student_ids": [],
    "referenced_knowledge_point_ids": [],
    "created_at": "ISO-8601"
  }
}
```

### 7.3 SSE 事件

事件顺序建议如下，前端应按事件名处理，不依赖文本内部的临时标记。

```text
event: message_start
data: {"conversation_id":"uuid","user_message_id":"uuid","assistant_message_id":"uuid"}

event: status
data: {"stage":"querying_students","label":"正在查看学生数据"}

event: text_delta
data: {"delta":"本周建议重点关注"}

event: evidence
data: {"items":[]}

event: suggested_actions
data: {"items":[]}

event: done
data: {"assistant_message":{}}

event: error
data: {"code":"ASSISTANT_PROVIDER_UNAVAILABLE","message":"模型服务暂时不可用","retryable":true}
```

稳定事件名：

| 事件 | 用途 |
|---|---|
| `message_start` | 返回本次用户消息和助手消息 ID |
| `status` | 可选，显示数据查询阶段 |
| `text_delta` | Markdown 文本增量 |
| `evidence` | 一条或多条真实证据 |
| `suggested_actions` | 可跳转的只读操作建议 |
| `done` | 最终消息持久化结果，客户端以此作为权威结果 |
| `error` | 错误结束事件 |

`done` 必定发送，除非连接被客户端主动取消或发生不可恢复错误。得到 `done` 后，前端应使用其中的 `assistant_message` 覆盖临时流式内容。

## 8. 消息、证据与动作结构

```ts
export interface TeacherAssistantMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "failed" | "interrupted";
  insufficient_evidence: boolean;
  evidence: TeacherAssistantEvidence[];
  suggested_actions: TeacherAssistantSuggestedAction[];
  referenced_student_ids: string[];
  referenced_knowledge_point_ids: string[];
  created_at: string;
}

export interface TeacherAssistantEvidence {
  id: string;
  source_type:
    | "dashboard_overview"
    | "student"
    | "mastery_state"
    | "mastery_snapshot"
    | "learning_event"
    | "conversation_message"
    | "knowledge_point"
    | "review_flag"
    | "teaching_strategy_effect"
    | "execution_plan_effect";
  source_id: string;
  title: string;
  summary: string;
  metrics?: Record<string, string | number | boolean | null>;
  occurred_at?: string | null;
  target?: TeacherAssistantNavigationTarget | null;
}

export interface TeacherAssistantSuggestedAction {
  id: string;
  label: string;
  reason: string;
  target: TeacherAssistantNavigationTarget;
}

export interface TeacherAssistantNavigationTarget {
  type:
    | "dashboard"
    | "student_detail"
    | "knowledge_point_detail"
    | "review_flag"
    | "teaching_strategy"
    | "execution_plan";
  course_id: string;
  student_id?: string | null;
  knowledge_point_id?: string | null;
  review_flag_id?: string | null;
  strategy_id?: string | null;
  plan_id?: string | null;
}
```

前端不根据证据文案自行拼接路由，使用 `target` 映射到教师端实际路由。

## 9. 后端只读工具集合

第一版建议提供以下内部工具。工具名不是 HTTP 路径，后端可以通过现有领域服务聚合，不需要前端逐个调用。

| 工具 | 数据来源 |
|---|---|
| `get_course_overview` | Dashboard 总览、班级指标、趋势 |
| `list_course_students` | 课程成员、最近活跃、掌握分层 |
| `get_student_learning_snapshot` | 学生掌握状态、近期事件、对话和审核摘要 |
| `get_student_mastery_trend` | 掌握度快照时间序列 |
| `get_student_error_patterns` | 常见错误、重复错误、错题证据 |
| `get_knowledge_point_analytics` | 知识点掌握分布、趋势、薄弱学生 |
| `get_review_summary` | 审核队列状态、严重级别和原因 |
| `get_teaching_strategy_effect` | 策略观察效果 |
| `get_execution_plan_effect` | 计划观察效果与任务事件 |

后端可以先由模型选择工具，也可以先用确定性规则路由到这些工具。无论采用哪种方式，最终回答中的数字和对象 ID 都必须来自工具结果。

## 10. 回答规则

助手应输出适合教师快速阅读的简短回答，并明确区分：

- 数据观察：直接来自证据的指标、事件和状态。
- 可能原因：模型基于证据做出的推断，必须标记为“可能”。
- 建议动作：只包含查看证据或打开相关页面，不直接执行写操作。

当证据不足时：

- 返回 `insufficient_evidence=true`。
- 可以描述已经确认的部分事实。
- 明确说明缺少哪类证据。
- 不生成确定的个体诊断，不编造趋势和人数。

示例回答结构：

```text
结论：本周建议优先关注张三、李四。

数据依据：
- 张三最近 7 天掌握度下降 8 分，发生 4 次重复错误。
- 李四在“黑盒测试”知识点连续 3 次答错。

可能原因：
- 现有证据指向同一知识点反复出错，但还不能确认具体原因。

建议动作：
- 查看张三学生详情
- 查看“黑盒测试”知识点分析
```

## 11. 持久化草案

建议新增独立表，不修改学生 `conversations` 和 `messages` 的语义：

| 表 | 用途 |
|---|---|
| `teacher_assistant_conversations` | 教师、课程、标题、状态和时间 |
| `teacher_assistant_messages` | 教师和助手消息、`client_message_id`、状态 |
| `teacher_assistant_message_evidence` | 消息关联的真实证据快照 |
| `teacher_assistant_tool_runs` | 工具调用、耗时、状态和错误，便于审计 |

第一版没有数据库迁移时，不得伪造持久化。正式实现需要 Alembic migration、索引和唯一约束。

## 12. 回归验收

后端实现完成后至少验证：

1. 非课程教师访问返回 `403`，不存在课程返回 `404`。
2. 跨课程 `student_id`、`knowledge_point_id` 和会话 ID 被拒绝。
3. 同一 `client_message_id` 和相同内容只生成一组消息。
4. 同一 ID 改为不同内容返回 `409`。
5. SSE 按 `message_start -> text_delta -> evidence -> suggested_actions -> done` 返回。
6. 断线后历史消息仍可读取，最终 `done` 结果已持久化。
7. 没有证据的问题返回 `insufficient_evidence=true`，不编造数字。
8. 助手不会读取学生会话以外的跨课程数据。
9. 学生输入中的指令文本不会被当成系统指令执行。
10. 关闭助手时 `capabilities.enabled=false`，发送消息返回稳定错误。

## 13. 变更边界

本文档是草案，接口字段可以在后端实现前调整。前端接入方应集中通过 `packages/shared-types` 和 `packages/api-client` 使用契约，不在页面内维护第二套类型或直接拼接请求。
