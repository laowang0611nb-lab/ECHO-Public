import type { TeachingStrategyStatus } from "@echo/shared-types";

export function canCreateExecutionPlan(status: TeachingStrategyStatus) {
  return status === "accepted" || status === "planned" || status === "active" || status === "paused";
}

export function teachingStrategyStatusLabel(status: TeachingStrategyStatus) {
  return {
    suggested: "AI 建议",
    accepted: "已采纳",
    planned: "已计划",
    active: "已启用",
    paused: "已暂停",
    completed: "已完成",
    dismissed: "已忽略",
  }[status];
}
