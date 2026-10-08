# Learning Feature

学生课程学习数据层。当前包含 `use-learning-overview.ts`、`use-student-course-data.ts`、`use-student-learning-events.ts`、`use-knowledge-point-learning-data.ts` 和 `learning-event-view-model.ts`。

职责：课程/章节/知识点读取、学习事件分页、掌握度和进度展示、错题或巩固数据所需的学习证据。所有 API 通过共享 Client 访问，服务端状态由 TanStack Query 缓存。
