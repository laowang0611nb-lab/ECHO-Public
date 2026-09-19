# Chat Feature

真实学生 AI 对话模块。

- `use-chat.ts`：Conversation 隔离、消息状态、SSE 消费、中止/续写、草稿、Hint、Quick Check 和离线重试。
- `chat-shell.tsx`：Header、Conversation Drawer、Composer 和自动滚动入口。
- `chat-message.tsx`：Markdown、Citation、Hint、QuickCheck、MasteryUpdate、QuizResultSheet 和消息菜单。

所有网络请求通过 `packages/api-client`，页面不直接 `fetch`。
