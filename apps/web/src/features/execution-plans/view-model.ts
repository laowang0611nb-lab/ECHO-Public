import type {
  ExecutionPlanStatus,
  LearningEventType,
  PlanLearningEventResult,
  PlanTaskItem,
  PlanTaskStatus,
  PlanTaskType,
  PlanTargetScope,
} from "@echo/shared-types";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function planStatusLabel(status: ExecutionPlanStatus) {
  const labels: Record<ExecutionPlanStatus, string> = {
    draft: "草稿",
    ready: "待执行",
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
  };
  return labels[status];
}

export function planStatusTone(status: ExecutionPlanStatus): StatusTone {
  if (status === "active") return "success";
  if (status === "paused") return "warning";
  if (status === "completed") return "info";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export function targetScopeLabel(scope: PlanTargetScope) {
  const labels: Record<PlanTargetScope, string> = {
    whole_class: "全班",
    student_group: "关注学生群体",
    custom_students: "自定义学生",
  };
  return labels[scope];
}

export function taskTypeLabel(type: PlanTaskType) {
  const labels: Record<PlanTaskType, string> = {
    supplementary_practice: "补充练习",
    resource_push: "资源推送",
    classroom_lecture: "课堂讲解",
    quick_check: "快速验证",
    individual_tutoring: "个别辅导",
    project_task: "项目任务",
  };
  return labels[type];
}

export function taskStatusLabel(status: PlanTaskStatus) {
  const labels: Record<PlanTaskStatus, string> = {
    not_started: "未开始",
    in_progress: "进行中",
    completed: "已完成",
    overdue: "已延期",
    cancelled: "已取消",
  };
  return labels[status];
}

export function taskStatusTone(status: PlanTaskStatus): StatusTone {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

export function eventTypeLabel(type: LearningEventType) {
  const labels: Record<LearningEventType, string> = {
    question_asked: "提出问题",
    hint_requested: "请求提示",
    quiz_correct: "练习正确",
    quiz_wrong: "练习错误",
    concept_confusion: "概念混淆",
    repeated_error: "重复错误",
    resolved: "问题解决",
    teacher_adjustment: "教师干预",
  };
  return labels[type];
}

export function eventResultLabel(result: PlanLearningEventResult) {
  const labels: Record<PlanLearningEventResult, string> = {
    correct: "正确",
    wrong: "错误",
    completed: "已完成",
    unresolved: "待解决",
  };
  return labels[result];
}

export function eventResultTone(result: PlanLearningEventResult): StatusTone {
  if (result === "correct" || result === "completed") return "success";
  if (result === "wrong") return "danger";
  return "warning";
}

export function taskCompletionPercentage(task: PlanTaskItem) {
  return task.completion.total
    ? Math.round((task.completion.completed / task.completion.total) * 100)
    : 0;
}

export function weekStatus(tasks: PlanTaskItem[], planStatus: ExecutionPlanStatus) {
  if (planStatus === "cancelled") return "cancelled" as const;
  if (!tasks.length) return "not_started" as const;
  if (tasks.every((task) => task.status === "completed" || task.status === "cancelled")) return "completed" as const;
  if (tasks.some((task) => task.status === "overdue")) return "overdue" as const;
  if (tasks.some((task) => task.status === "in_progress" || task.status === "completed")) return "in_progress" as const;
  return "not_started" as const;
}

export function formatDateTime(value: string) {
  return value.slice(0, 16).replace("T", " ");
}
