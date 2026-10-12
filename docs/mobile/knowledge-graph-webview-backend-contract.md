# 学生端知识图谱 WebView 后端授权接口

## 背景

学生端已通过 `apps/mobile/src/app/knowledge-graph.tsx` 使用 WebView 加载教师端真实知识图谱：

```text
/knowledge?courseId={courseId}&tab=graph&embed=1
```

学生端不会复制 G6 图谱代码，也不会把学生 token、密码或 cookie 写入 URL。当前缺口是：

- 学生身份不能直接访问教师知识图谱接口。
- 教师端 Web 使用自己的 `sessionStorage` 登录态，学生 App 的 SecureStore 无法跨端共享。
- 需要短时、一次性、只读、绑定课程的后端授权票据。

## 前端已使用的接口约定

### 1. 创建图谱嵌入票据

```http
POST /api/v1/courses/{course_id}/knowledge-graph/embed-session
Authorization: Bearer <student_access_token>
Content-Type: application/json
```

要求：

- 仅允许已登录的学生调用。
- 学生必须是该课程的 active member。
- 票据必须一次性使用、短时有效、绑定 `course_id` 和当前用户。
- 票据权限仅限 `knowledge_graph:read`，不能用于任何写操作。
- 不返回学生 access token，不记录票据明文日志。

成功响应：

```json
{
  "ticket": "opaque-random-ticket",
  "expires_in_seconds": 300
}
```

### 2. 教师端 Web 交换嵌入会话

```http
POST /api/v1/knowledge-graph/embed-sessions/exchange
Content-Type: application/json
```

请求：

```json
{
  "ticket": "opaque-random-ticket",
  "courseId": "course-uuid"
}
```

要求：

- 只接受票据本身，不需要学生 Bearer token。
- 校验票据未过期、未消费、课程匹配。
- 交换成功后立即消费票据，重复使用返回 404 或 410。
- 返回的嵌入 access token 仅允许读取当前课程的知识图谱和章节，不得获得教师写权限。

成功响应：

```json
{
  "access_token": "scoped-embed-access-token",
  "token_type": "Bearer",
  "expires_in_seconds": 300,
  "course_id": "course-uuid"
}
```

### 3. 读接口授权扩展

以下接口必须同时支持教师身份和课程只读嵌入身份：

```http
GET /api/v1/courses/{course_id}/knowledge-graph
GET /api/v1/courses/{course_id}/chapters
Authorization: Bearer <scoped-embed-access-token>
```

约束：

- 只读。
- 必须校验 token 的 `course_id` 与路径课程一致。
- 不得允许通过嵌入 token 调用文档上传、知识点编辑、关系生成、资源删除等写接口。
- 不得降低现有教师接口权限。

## 建议的后端实现要点

- 新增 `KnowledgeGraphEmbedSession` 或类似模型，只存票据哈希、用户、课程、过期时间、消费时间。
- 票据使用高熵随机值，数据库落库前做哈希。
- 嵌入 token 使用短时 JWT 或等价签名 token，claims 至少包含：
  - `sub`: 学生 user id
  - `course_id`
  - `scope`: `knowledge_graph:read`
  - `session_id`
  - `exp`
- 增加 Python 测试：
  - 学生成员可以创建票据。
  - 非课程成员不能创建票据。
  - 票据只能交换一次。
  - 过期票据不能交换。
  - 票据不能跨课程使用。
  - 嵌入 token 可以读取当前课程图谱和章节。
  - 嵌入 token 不能调用任意写接口。
  - 日志中不出现票据和 token。

## 给后端线程的修复提示词

```text
请为“学生端教师知识图谱 WebView 嵌入”补充后端短时只读授权接口。当前前端已完成，但学生 token 不能直接访问教师图谱接口，不能通过伪造登录态绕过。

请实现：

1. POST /api/v1/courses/{course_id}/knowledge-graph/embed-session
- 使用学生 Bearer token 认证。
- 校验当前用户是该课程 active member。
- 生成一次性、短时、绑定 course_id 和 user_id 的高熵票据。
- 票据只允许 knowledge_graph:read。
- 返回 {"ticket": "...", "expires_in_seconds": 300}。
- 数据库中只保存票据哈希，不保存明文。

2. POST /api/v1/knowledge-graph/embed-sessions/exchange
- 请求体包含 ticket 和 courseId。
- 校验票据未过期、未使用、课程匹配。
- 成功后立即消费票据，重复使用必须失败。
- 返回短时 scoped access token：
  {"access_token":"...","token_type":"Bearer","expires_in_seconds":300,"course_id":"..."}
- token claims 至少包含 sub、course_id、scope=knowledge_graph:read、session_id、exp。
- 不使用 URL 传递 token。

3. 扩展现有只读接口：
- GET /api/v1/courses/{course_id}/knowledge-graph
- GET /api/v1/courses/{course_id}/chapters
允许课程匹配的 knowledge_graph:read 嵌入 token 访问，但只读。
不得修改知识图谱数据逻辑、节点关系、风险规则、后端其他接口或数据库中的真实课程数据。

4. 安全要求：
- 不记录 ticket、access_token、cookie 或学生隐私到日志。
- 嵌入 token 不能调用任何写接口。
- token 课程必须与路径 course_id 一致。
- 非课程成员返回 403；未知课程返回 404；无效/过期/已消费票据返回 404 或 410。

5. 补测试并运行：
- 学生课程成员可创建票据。
- 非成员不能创建。
- 票据一次性、过期失败、跨课程失败。
- 嵌入 token 可读当前课程图谱与章节。
- 嵌入 token 不能写。
- 现有教师权限不回归。
- OpenAPI 和共享契约如有需要同步更新。

完成后报告：变更文件、接口示例、测试命令和结果、commit/tag、以及学生端联调所需的服务重启说明。
```

后端状态：已于 `v0.0.234` / API `0.0.233` 实现，Alembic head 为 `b1c2d3e4f5a6`。详细契约见 [`../../api/学生知识图谱嵌入接口.md`](../../api/学生知识图谱嵌入接口.md)。
