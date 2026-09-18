export type ExecutionPlanTab = "overview" | "weeks" | "tasks" | "events" | "effect";

export const executionPlanTabs: Array<{ value: ExecutionPlanTab; label: string }> = [
  { value: "overview", label: "计划概览" },
  { value: "weeks", label: "周计划" },
  { value: "tasks", label: "教学任务" },
  { value: "events", label: "学习事件" },
  { value: "effect", label: "效果评估" },
];

export function normalizeExecutionPlanTab(value?: string): ExecutionPlanTab {
  return executionPlanTabs.some((tab) => tab.value === value)
    ? (value as ExecutionPlanTab)
    : "overview";
}
