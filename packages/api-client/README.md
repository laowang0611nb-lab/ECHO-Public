# @echo/api-client

教师 Web 和学生移动端共用的 REST/SSE 客户端包。业务页面不得直接拼接后端地址或调用 `fetch`，应通过 `createApiClient` 暴露的方法访问后端。

## Entry

- `src/index.ts`：客户端工厂、请求封装、错误类型和全部 API 方法。

## Runtime Behaviour

- `createApiClient({ baseUrl, getAccessToken, ... })` 创建客户端。
- 有 Access Token 时发送 `Authorization: Bearer`；开发环境没有 Token 时才使用 `X-User-Id`。
- 收到 `401` 时，可按当前会话刷新 Access Token 并重试一次原请求。
- 普通请求有超时；SSE 建连与后续长流分开处理。
- `ApiClientError` 暴露状态码和错误体，`ApiClientTimeoutError` 表示请求超时。
- 附件上传和 PDF 文件使用 FormData/Blob；消息流消费 SSE 事件。

## 方法域

- 身份、头像、通知、课程、成员。
- 文档、解析、Chunk、Embedding、知识结构、知识点和知识图谱。
- 会话、消息、SSE、Hint、Quick Check 和聊天附件。
- Dashboard、学习事件、掌握度、趋势、错因和学生资源。
- AI 二次分析、审核、回答版本和重生成。
- 教学策略、执行计划、周计划、任务和效果。
- 资源回收站、习题和外部资源。

新增方法时必须同步更新 `docs/api/接口索引.md`；后端存在但客户端尚未提供的方法，应明确标注为“未纳入客户端”，不要由页面私自行请求。

## Check

```powershell
pnpm --filter @echo/api-client typecheck
```
