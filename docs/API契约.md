# ECHO API 契约

> 冻结版本：`v0.0.118`
> 当前核对基线：`v0.0.209` / commit `a70f727`（2026-10-08）；实时 OpenAPI 共 123 条唯一路径、239 个 Schema。
> 本文保留 `v0.0.118` 的冻结契约；后续只做向后兼容增量。本轮补充头像读取、资源恢复和聊天知识点上下文门控，并校正路径占位参数名。
> 基础路径：`/api/v1`  
> 当前认证：正式 Bearer JWT + Refresh Session；开发环境保留 `X-User-Id` 兼容入口。
> 数据库层已具备 Argon2id、Access JWT、Refresh Session、手机号验证和 Profile 基础，正式手机号注册、密码登录、密码重置、刷新和退出接口已进入本契约。

## 1. 通用约定

- 请求和响应使用 JSON，文件上传除外。
- UUID 均以字符串传输。
- 时间使用 ISO 8601 字符串。
- 普通错误响应为 `{"detail": "..."}`；短信验证码和正式手机号认证接口使用 `{"detail": {"code": "...", "message": "..."}}` 提供机器可读错误码。
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
| GET | `/system/status` | 教师 | 只读本地部署状态、数据库目标、Qwen、文件和局域网检查 |
| GET | `/demo/status` | 教师 | 隔离 Demo 数据集状态和固定上下文 ID |
| POST | `/demo/reset` | 教师 | 重建隔离 Demo 数据集，不触碰真实课程 |
| POST | `/auth/login` | 公开 | 创建或恢复开发用户 |
| GET | `/auth/me` | 已登录 | 当前用户 |
| GET | `/auth/me/profile` | 教师 | 当前教师完整可公开资料 |
| PATCH | `/auth/me/profile` | 教师 | 更新当前教师资料，不允许修改角色和权限 |
| POST | `/auth/me/avatar` | 已登录 | 上传 JPEG/PNG/WebP 头像，校验签名和 2 MB 上限 |
| DELETE | `/auth/me/avatar` | 已登录 | 删除当前用户头像，幂等 |
| GET | `/users/{user_id}/avatar` | 公开图片 | 稳定头像地址，返回图片流和缓存头 |
| POST | `/auth/change-password` | 已登录 | 验证当前密码、更新 Argon2id Hash 并撤销旧 Refresh Session |
| POST | `/auth/sms/send` | 公开 | 调用阿里云 PNVS 发送手机验证码，不返回验证码或内部 BizId |
| POST | `/auth/sms/verify` | 公开 | 校验 PNVS 验证码，成功后返回 5 分钟手机验证票据 |
| POST | `/auth/register/sms` | 公开 | 消费验证票据，创建手机号教师账号并返回正式会话 |
| POST | `/auth/login/password` | 公开 | 使用邮箱或手机号加密码登录，返回正式会话 |
| POST | `/auth/login/sms` | 公开 | 消费 `login` 用途验证票据，按手机号登录并返回正式会话 |
| POST | `/auth/password/reset` | 公开 | 消费验证票据，重置手机号账号密码并撤销旧会话 |
| POST | `/auth/refresh` | 公开 | 轮换 Refresh Token 并签发新 Access Token |
| POST | `/auth/logout` | 公开 | 撤销指定 Refresh Session |
| POST | `/courses` | 教师 | 创建课程并自动成为教师成员 |
| GET | `/courses` | 已登录 | 当前用户加入的课程 |
| GET | `/courses/{course_id}` | 课程成员 | 课程详情 |
| PATCH | `/courses/{course_id}` | 课程教师 | 更新课程基础信息 |
| POST | `/courses/{course_id}/archive` | 课程教师 | 归档课程并保留历史数据 |
| POST | `/courses/{course_id}/restore` | 课程教师 | 从归档恢复为草稿 |
| POST | `/courses/join` | 学生 | 课程码加入已发布课程 |
| POST | `/courses/{course_id}/publish` | 课程教师 | 发布课程 |
| GET | `/courses/{course_id}/members` | 课程教师 | 查看含邮箱的成员列表 |
| GET | `/notifications` | 已登录 | 当前用户通知列表，支持 `unread`、游标和分页 |
| GET | `/notifications/unread-count` | 已登录 | 当前用户未读通知数 |
| POST | `/notifications/{notification_id}/read` | 已登录 | 标记自己的单条通知已读 |
| POST | `/notifications/read-all` | 已登录 | 标记当前用户全部通知已读 |

通知的 `action_url` 使用教师端可直接跳转的站内路由，例如 `/ai-review/pending?reviewId=...&courseId=...` 和 `/courses/{course_id}?tab=students`。

## 3. 文档与知识结构

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/courses/{course_id}/documents` | 课程教师 | 上传 PDF |
| GET | `/courses/{course_id}/documents` | 课程教师 | 查询教材列表和解析状态 |
| PATCH | `/courses/{course_id}/documents/{document_id}/metadata` | 课程教师 | 更新资源展示名、摘要、关键词和出版元数据，不触发重新解析 |
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

分块和知识结构生成都会维护真实 `KnowledgeChunk.chapter_id`：分块时按章节标题、知识点名称和文档顺序映射；重新生成结构后再次回写，避免知识点来源和 RAG 证据脱离章节。

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
| GET | `/chat/modalities` | 已登录 | 返回当前可用输入模态和是否启用附件 |
| POST | `/chat/attachments` | 已登录 | 上传图片、音频或视频附件 |
| GET | `/chat/attachments/{attachment_id}/file` | 所有者或课程教师 | 读取附件文件流 |
| POST | `/conversations/{conversation_id}/messages/stream` | 会话所有者 | RAG 流式回答 |
| POST | `/conversations/{conversation_id}/messages/{message_id}/continue` | 会话所有者 | 从中断或失败的助手消息继续生成 |
| POST | `/messages/{message_id}/hints` | 会话所有者 | 请求下一层后端 Hint，并记录 `hint_requested` |
| POST | `/quick-checks/{question_id}/attempts` | 课程学生成员 | 提交 Quick Check 答案，幂等并返回真实掌握度变化 |
| GET | `/courses/{course_id}/students/{student_id}/conversations` | 课程教师 | 查看指定学生会话列表 |
| GET | `/courses/{course_id}/conversations/{conversation_id}/messages` | 课程教师 | 查看完整对话证据、知识点、引用和审核状态 |

附件上传先写入 `chat_attachments`，成功响应返回 `attachment` 和 `expires_at`。发送消息时，`attachments` 只接受当前用户创建、尚未绑定且未过期的附件。消息提交后，附件绑定到用户消息；历史消息通过 `attachments` 返回元数据和文件 URL。

学生消息保留完整 5000 字正文，但 `question_asked` 学习事件证据只保存前 2000 字，避免长消息或音频转写导致半保存。用户消息、附件绑定和学习事件在同一事务中提交，失败时整体回滚，`client_request_id` 可安全重试。空白 `client_request_id` 会规范化为 `null`。

未绑定且超过有效期的聊天附件会由后台清理任务删除数据库记录、原文件和视频模型缓存文件；清理间隔默认 3600 秒。

多模态 Chat Provider 输入使用 OpenAI 兼容内容块：图片使用 `image_url`，音频在转写后使用文本，视频使用 `video_url`。上传和消息持久化不代表模型一定具备对应理解能力；如果 Provider 不支持指定模态，会返回真实错误事件，不会伪造分析结果。

音频处理按本地优先、远程兜底：`ECHO_ASR_ENABLED=true` 时先通过可选依赖 `faster-whisper` 转写；未启用或本地转写失败时，使用 `ECHO_ASR_REMOTE_MODEL`（默认 `qwen3-asr-flash`）把 Data URL 音频提交给百炼语音识别。转写结果保存到附件的 `transcript` 字段，并以 `[音频转写]` 文本块进入 RAG，不再把 base64 `input_audio` 交给主对话模型。

视频先通过 PyAV 规范化为标准 H.264 MP4，再上传到百炼临时文件服务，获取绑定当前 Chat 模型的 `oss://` 临时 URL。调用 `/chat/completions` 时自动携带 `X-DashScope-OssResourceResolve: enable`；临时 URL 与模型名、过期时间缓存到 `chat_attachments`，默认有效期 48 小时。

SSE 事件：

| 事件 | 数据结构 |
|---|---|
| `text_delta` | `{"delta": "..."}` |
| `citation` | `{"index": 1, "chunk_id": "...", "document_id": "...", "page_start": 1, "page_end": 2}` |
| `message_start` | `{"user_message_id": "...", "assistant_message_id": "..."}` |
| `block` | `{"block": {"type": "hint|quick_check|mastery_update|warning", ...}}` |
| `error` | `{"detail": "..."}` |
| `done` | `{"conversation_id": "...", "message_id": "..."}` |

助手消息持久化 `blocks` 数组，至少包含 `text`、`markdown`、`hint`、`quick_check`、
`citation`、`mastery_update` 和 `warning`。Hint 请求本身不降低掌握度；
Quick Check 由服务端校验答案并通过 `LearningEvent -> StudentKnowledgeState`
更新掌握度，客户端不得自行计算。

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

`v0.0.208` 起，普通课程聊天不再依据 RAG 命中结果自动推断知识点并生成 Hint/Quick Check。只有请求显式携带有效 `knowledge_point_id`、问题与知识点实质相关，且检索来源与知识点属于同一章节时，后端才继续知识点问答卡片；其他情况保持普通课程问答。

## 5. 教学规则与学习分析

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/teaching-policy` | 课程成员 | 读取教学规则 |
| PUT | `/courses/{course_id}/teaching-policy` | 课程教师 | 更新教学规则 |
| POST | `/courses/{course_id}/learning-events` | 课程教师 | 记录学习事件 |
| GET | `/courses/{course_id}/students/{student_id}/mastery` | 本人或课程教师 | 查询知识点状态 |
| POST | `/courses/{course_id}/announcements` | 课程教师 | 创建或发布课程公告 |
| PATCH | `/courses/{course_id}/announcements/{announcement_id}` | 课程教师 | 修改公告并发布或撤回 |
| GET | `/courses/{course_id}/announcements` | 课程成员 | 公告分页、草稿可见性和已读状态 |
| POST | `/courses/{course_id}/announcements/{announcement_id}/read` | 课程成员 | 标记公告已读 |
| GET | `/courses/{course_id}/students/{student_id}/learning-events` | 本人或课程教师 | 学生学习事件分页、筛选和学习前后掌握度 |
| GET | `/courses/{course_id}/students/{student_id}/progress` | 本人或课程教师 | 当前章节、知识点、整体进度和章节完成规则 |
| GET | `/courses/{course_id}/students/{student_id}/wrong-questions` | 本人或课程教师 | 错题聚合、错误次数和复习状态 |
| GET | `/courses/{course_id}/students/{student_id}/wrong-questions/{question_id}` | 本人或课程教师 | 错题原文、选项、解析和最近错误尝试 |
| GET | `/courses/{course_id}/knowledge-points/{knowledge_point_id}/quick-checks?count=3` | 课程成员 | 按知识点获取巩固题并复用既有作答接口 |
| GET | `/courses/{course_id}/student-resources` | 课程成员 | 学生只读课程资料和可用状态 |
| GET | `/courses/{course_id}/knowledge-points/{knowledge_point_id}/sources` | 课程成员 | 知识点的教材、页码、Chunk 和引用原文 |
| GET | `/courses/{course_id}/students/{student_id}/knowledge-points/{knowledge_point_id}/conversations` | 本人或课程教师 | 由 LearningEvent 证据关联的知识点会话 |
| GET | `/courses/{course_id}/teachers` | 课程成员 | 学生的只读授课教师信息 |
| GET | `/courses/{course_id}/students/{student_id}/plan-tasks` | 本人或课程教师 | 当前学生的已发布计划任务和完成证据 |
| GET | `/courses/{course_id}/students/{student_id}/knowledge-points/{knowledge_point_id}/misconceptions` | 本人或课程教师 | 有 LearningEvent 证据的学生错因，样本不足明确标记 |

## 6. Dashboard

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/courses/{course_id}/dashboard` | 课程教师 | 课程聚合指标 |
| GET | `/dashboard/overview?courseId={courseId}` | 课程教师 | 教师首页一次性聚合读取 |
| POST | `/courses/{course_id}/ai-analysis` | 课程教师 | 创建基于持久化学习证据的 AI 分析，默认异步返回 `202` |
| GET | `/courses/{course_id}/ai-analysis` | 课程教师 | 查询课程 AI 分析记录 |
| GET | `/courses/{course_id}/ai-analysis/{analysis_id}` | 课程教师 | 查询分析状态、结果、证据链和 `progress` |
| GET | `/courses/{course_id}/ai-analysis/{analysis_id}/progress` | 课程教师 | 轮询五阶段、百分比、心跳和错误 |
| POST | `/courses/{course_id}/ai-analysis/{analysis_id}/reanalyze` | 课程教师 | 基于已完成分析创建异步二次分析 |
| POST | `/courses/{course_id}/ai-analysis/{analysis_id}/strategy` | 课程教师 | 将证据充分的分析建议转为 `suggested` 策略 |
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

回收站覆盖普通资源、章节、知识点、习题和外部资源。永久删除必须显式传 `permanent=true`，并返回受影响引用数量。图谱节点和边全部来自数据库，不使用前端模拟关系。知识关系按兼容白名单映射：`prerequisite_of`/`prerequisite` 输出 `prerequisite`，`related_to`/`related`/`applied_in` 和未知值确定性输出 `related`。

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

## 10. 教师端 P1 编辑契约

### 10.1 Course

`Course` 新增可选字段 `course_type`、`target_audience`、`expected_student_count` 和只读 `archived_at`。现有 `term` 作为学期字段，请求和响应同时兼容 `semester` 别名。

课程状态扩展为 `draft`、`published`、`archived`。归档不物理删除课程、成员、资源、对话或 LearningEvent；归档课程不可发布或通过课程码加入，恢复后回到 `draft`。课程码固定为 8 位大写字母或数字；验收 Seed 使用 `ACC00001` 至 `ACC99999` 格式，历史 `ACCxxx` 数据由迁移自动补零。

### 10.2 Teacher Profile 与 Password

教师资料响应包含 `id`、`email`、`display_name`、`role`、`school_name`、`department`、`employee_no`、`title`、`teaching_fields` 和时间字段。请求可使用 `teacher_no` 作为 `employee_no` 别名；`teaching_fields` 使用字符串数组并去重。

修改密码请求为 `current_password` 和 `new_password`。新密码至少 8 位且同时包含字母和数字；成功后更新 `password_changed_at`，重置失败计数并撤销该用户未撤销的旧 Refresh Session。开发身份头本身不提供正式密码登录，密码哈希验证由认证服务保留给后续正式登录接口。

### 10.3 Resource Metadata

资源元数据字段包括 `display_name`（兼容请求别名 `title`）、`summary`、`keywords`、`author`、`publisher` 和 `copyright`。PATCH 只更新元数据，不改变原文件、`storage_key`、页面、Chunk、Embedding、Citation 或解析状态。

### 10.4 手机号验证码

`POST /auth/sms/send` 接受中国大陆手机号 `phone`，调用阿里云号码认证服务 `Dypnsapi` 的 `SendSmsVerifyCode`；`POST /auth/sms/verify` 接受 `phone` 和 `code`，调用 `CheckSmsVerifyCode`。只有 `VerifyResult == PASS` 才视为验证成功，`Success == true` 和 `Code == OK` 本身不代表验证码正确。

验证成功后返回 `verification_token`，有效期 5 分钟，包含手机号、用途、jti 和过期时间。注册或手机号登录接口后续必须消费该票据，不得信任客户端自行提交的 `verified: true`。验证码由阿里云生成和管理，ECHO 不保存验证码明文。
- `POST /auth/sms/verify` 必须显式传入 `purpose`：`register`、`password_reset` 或 `login`，不得省略或使用通用用途。注册只接受 `register`，重置只接受 `password_reset`，票据消费后不可跨用途复用。

短信错误码包括 `SMS_TOO_FREQUENT`、`SMS_CODE_INVALID_OR_EXPIRED`、`SMS_PROVIDER_NOT_CONFIGURED`、`SMS_AUTH_FAILED`、`SMS_BILLING_UNAVAILABLE`、`SMS_SEND_FAILED`、`SMS_TIMEOUT` 和 `SMS_SERVICE_UNAVAILABLE`。响应不得包含 AccessKey、完整手机号、验证码、BizId 或 SDK traceback。

### 10.5 正式手机号认证

`User` 新增可空且唯一的 `phone` 字段；手机号注册使用内部保留邮箱占位，后续支持绑定真实邮箱。验证票据的 `jti` 会写入 `phone_verification_claims`，消费时采用原子更新，保证一次性使用。`purpose` 为必填，注册只接受 `register`，重置只接受 `password_reset`，短信登录只接受 `login`。

`POST /auth/register/sms` 请求包含 `phone`、`verification_token`、`display_name`、`password`，可选 `email`、`role` 和 `device_name`。成功后返回 `user`、`session_id`、`access_token`、`refresh_token`、`token_type`、`expires_in_seconds` 和 `refresh_expires_at`。

`POST /auth/login/sms` 请求包含 `phone`、`verification_token` 和可选 `device_name`。服务端只接受 `purpose=login` 的一次性票据，原子消费成功后按规范化手机号查找已有用户并创建正式 `AuthSession`。未注册返回 `404 AUTH_PHONE_NOT_REGISTERED`，票据错误或过期返回 `400 AUTH_VERIFICATION_TOKEN_INVALID`，账号停用返回 `403 AUTH_ACCOUNT_DISABLED`；请求中的额外 `verified` 字段会被拒绝。

`POST /auth/login/password` 支持 `email` 或 `phone` 二选一，请求还要包含 `password`。错误码包括 `AUTH_ACCOUNT_NOT_FOUND`、`AUTH_INVALID_PASSWORD`、`AUTH_ACCOUNT_LOCKED` 和 `AUTH_ACCOUNT_DISABLED`；连续 5 次失败锁定 15 分钟。

`POST /auth/password/reset` 请求包含 `phone`、`verification_token` 和 `new_password`。成功后更新 Argon2id 密码、重置失败登录状态并撤销旧 Refresh Session。`POST /auth/refresh` 轮换 Refresh Token；`POST /auth/logout` 幂等撤销 Refresh Session。受保护接口同时接受 `Authorization: Bearer <access_token>`，开发环境仍保留 `X-User-Id` 兼容入口。

### 10.6 AI 二次分析

AI 二次分析使用 `ai_analyses`、`ai_analysis_evidence` 和 `ai_analysis_results` 持久化分析记录、证据链和结构化结果。分析输入支持课程、知识点、学生范围、时间窗口和教师关注点；二次分析通过 `previous_analysis_id` 保留前序分析，不覆盖原记录。

阶段进度与幂等记录同时持久化到 `ai_analysis_stage_events`，因此该能力当前涉及四张表，而不是三张。

证据来源包括 LearningEvent、MasterySnapshot、QuickCheckAttempt、Conversation/Message、ReviewFlag、MessageCitation、KnowledgeChunk 和前序分析结果。模型返回的每条 fact 必须引用当前分析中真实存在的 evidence_id；无效引用会被过滤。证据少于 2 条、模型明确证据不足或没有任何带证据的事实引用时，结果固定返回 `insufficient_evidence=true`，不能生成无依据的教学策略。

`POST /courses/{course_id}/ai-analysis` 和 `POST /courses/{course_id}/ai-analysis/{analysis_id}/reanalyze` 默认异步执行：立即持久化 `analyzing` 记录并返回 `202`，同一 `client_request_id` 重试返回同一记录。兼容 `"async": false` 的同步调用。`GET /courses/{course_id}/ai-analysis/{analysis_id}/progress` 返回固定五阶段 `collecting_previous_analysis`、`querying_evidence`、`expanding_knowledge_graph`、`analyzing_student_impact`、`generating_recommendation`，百分比依次为 10、30、50、70、90，完成时 100 且阶段百分比只能单调前进。后台任务每 5 秒更新 `heartbeat_at`，失败保留最后阶段和错误，证据不足仍正常完成。

`POST /courses/{course_id}/ai-analysis/{analysis_id}/strategy` 只在证据充分时可用，创建的 TeachingStrategy 状态固定为 `suggested`，必须由教师后续采纳、修改和发布。完整请求和响应见 [AI二次分析接口_v1.md](./api/AI二次分析接口_v1.md)。


### 10.7 保留的 P2

- 资源文件替换、课程 Deep Copy、教学日历、服务器 CPU/RAM/Disk/Network/日志监控。
- 独立计划任务 POST 与拖拽排序；现有任务编辑仍使用 `PATCH /plan-tasks/{task_id}`。
- 独立 Suggestion 实体和 `ignored` flag；策略忽略继续使用 `TeachingStrategyStatus.dismissed`。
- 会话级 LearningEvent 的 `reviewId` 筛选；Conversation/Message 已有持久化关联，后续单独扩展筛选契约。

## 11. 学生端只读学习闭环

学生接口统一使用课程成员或本人/课程教师权限。LearningEvent 分页使用服务端游标，支持 `eventType`、`knowledgePointId`、`from`、`to`；课程进度只根据真实 Chapter、KnowledgePoint、LearningEvent 和 StudentKnowledgeState 计算，章节完成固定为“所有知识点均有学习证据且掌握度不低于 80”。

错题由 QuickCheckAttempt 的 `correct=false` 聚合，正确尝试晚于最近错误时标记 `resolved`。巩固题按知识点关联的 QuestionItem 返回现有 QuickCheckBlock，学生仍通过 `/quick-checks/{question_id}/attempts` 提交。

学生资源只读接口合并未删除的 Document 和 ExternalResource；知识点来源来自同章节有效 KnowledgeChunk。知识点相关会话只使用 LearningEvent 中同时存在 `knowledge_point_id` 与 `conversation_id` 的证据，不使用文本关键词猜测。

计划任务只返回 `active` 或 `paused` 计划中面向当前学生的任务，任务目标按全班、计划目标或任务目标继承判断，完成证据来自该学生对应的 LearningEvent。

错因接口返回个人 LearningEvent 聚合证据；窗口内少于 2 条时 `insufficient_evidence=true`，不建立无证据的 misconception 元数据。

课程公告使用 `course_announcements` 和 `course_announcement_reads`；教师可保存草稿，并通过 PATCH 修改、发布或撤回，学生只读取已发布公告并持久化已读状态。

## 12. 接口冻结规则

- 已登记的方法、路径和枚举值视为稳定契约。
- 新功能只能新增可选字段、新枚举值或新路径。
- 不得无迁移地改名或删除现有字段。
- 破坏性变更必须提升版本并同步本文档与 `INDEX.md`。
- 前端不得依赖未登记字段。 
