# @echo/shared-types

跨端共享领域类型包。教师 Web 和学生移动端通过它消费后端请求、响应和主要领域枚举，避免在两个前端重复定义接口形状。

## Entry

- `src/index.ts`：唯一公开入口，`package.json` 的 `types` 和 `exports` 直接指向该文件。

## 覆盖范围

- 身份、认证、教师 Profile、通知和头像。
- 课程、成员、教材、章节、知识点和知识图谱。
- 会话、消息、Citation、Hint、Quick Check 和多模态附件。
- Dashboard、学习事件、掌握度、趋势和错因。
- AI 二次分析与证据不足字段。
- AI 审核、回答版本、重生成和审核历史。
- 教学策略、执行计划和周计划。
- 外部资源、习题和资源回收站。

## Boundary

- 页面私有 ViewModel、组件 Props 和本地 UI 状态不放在这里。
- 新增或删除共享字段前，先确认后端 Pydantic Schema、`docs/API契约.md` 和 `docs/api/接口索引.md` 的一致性。
- 当前包版本为 `0.0.4`，与仓库显示版本 `v0.0.209` 分开管理；仓库显示版本不代表 npm 包版本已同步提升。

## Check

```powershell
pnpm --filter @echo/shared-types typecheck
```
