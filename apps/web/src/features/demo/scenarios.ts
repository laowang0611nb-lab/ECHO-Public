import type { DemoDatasetStatus } from "@echo/shared-types";

import type { DemoRouteContext } from "@/features/demo/demo-provider";

export interface DemoScenario {
  id: string;
  order: number;
  title: string;
  description: string;
  duration: string;
  href: string;
  context: DemoRouteContext;
}

export function buildDemoScenarios(status: DemoDatasetStatus | null | undefined): DemoScenario[] {
  const courseId = status?.course_id ?? undefined;
  const query = (values: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ demo: "1" });
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }
    return `?${params.toString()}`;
  };

  const strategyHref = status?.strategy_id
    ? `/teaching-strategies/${status.strategy_id}${query({ courseId, strategyId: status.strategy_id })}`
    : `/teaching-strategies${query({ courseId })}`;
  const reviewHref = status?.review_id
    ? `/ai-review/pending${query({ courseId, reviewId: status.review_id })}`
    : `/ai-review${query({ courseId })}`;
  const studentHref = status?.student_id
    ? `/students/${status.student_id}${query({ courseId, studentId: status.student_id })}`
    : `/students${query({ courseId })}`;
  const planHref = status?.plan_id
    ? `/execution-plans/${status.plan_id}${query({ courseId, planId: status.plan_id, tab: "effect" })}`
    : `/teaching-strategies${query({ courseId })}`;

  return [
    {
      id: "system-overview",
      order: 1,
      title: "系统总览",
      description: "展示教学 KPI、学习趋势、ECHO Insight 和待处理事项。",
      duration: "约 1 分钟",
      href: `/dashboard${query({ courseId })}`,
      context: { courseId },
    },
    {
      id: "create-course",
      order: 2,
      title: "创建课程",
      description: "进入正式五步课程向导，展示教材导入、AI 解析、教学策略和发布。",
      duration: "约 1 分钟",
      href: `/courses/new${query({ courseId })}`,
      context: { courseId },
    },
    {
      id: "strategy-and-plan",
      order: 3,
      title: "教学策略与执行计划",
      description: "从策略详情进入正式创建计划向导，再发布到执行计划详情。",
      duration: "约 1–2 分钟",
      href: strategyHref,
      context: { courseId, strategyId: status?.strategy_id ?? undefined },
    },
    {
      id: "ai-review",
      order: 4,
      title: "AI 回答审核",
      description: "进入真实审核工作台，检查问题、回答、引用、完整对话和教师决定。",
      duration: "约 1–2 分钟",
      href: reviewHref,
      context: {
        courseId,
        reviewId: status?.review_id ?? undefined,
        conversationId: status?.conversation_id ?? undefined,
        resourceId: status?.resource_id ?? undefined,
      },
    },
    {
      id: "student-evidence",
      order: 5,
      title: "学生学情与证据",
      description: "从学情总览进入学生详情，再追踪知识点、完整对话和教材来源。",
      duration: "约 1 分钟",
      href: studentHref,
      context: { courseId, studentId: status?.student_id ?? undefined },
    },
    {
      id: "effect-evaluation",
      order: 6,
      title: "教学效果评估",
      description: "展示执行计划、LearningEvent、任务结果，并回流到教学策略效果。",
      duration: "约 1 分钟",
      href: planHref,
      context: {
        courseId,
        planId: status?.plan_id ?? undefined,
        planTaskId: status?.plan_task_id ?? undefined,
        strategyId: status?.strategy_id ?? undefined,
      },
    },
  ];
}
