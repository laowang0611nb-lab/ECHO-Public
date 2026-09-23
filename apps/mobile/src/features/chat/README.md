# Chat Feature

真实学生 AI 对话模块。

- `use-chat.ts`：Conversation 隔离、消息状态、SSE 消费、中止/续写、草稿、Hint、Quick Check 和离线重试。
- `chat-shell.tsx`：Header、Conversation Drawer、Composer 和自动滚动入口。
- `chat-message.tsx`：Markdown、Citation、Hint、QuickCheck、MasteryUpdate、QuizResultSheet 和消息菜单。
- `chat-attachment-draft.ts`：图片、音频和视频附件的本地草稿模型与临时标识。

多模态附件最多 4 个；上传成功后使用完整 `ChatAttachment` 随消息发送，历史图片通过 Bearer Token 读取受保护文件接口。

所有网络请求通过 `packages/api-client`，页面不直接 `fetch`。
