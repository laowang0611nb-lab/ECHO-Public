import type { TeacherDashboardOverview } from "@echo/shared-types";

export interface DashboardViewModel {
  knowledgePointCount: number;
  recentActivity: TeacherDashboardOverview["trend"];
  topDifficulty: TeacherDashboardOverview["learning_difficulties"][number] | null;
  attentionAction: TeacherDashboardOverview["teacher_actions"][number] | null;
  reviewAction: TeacherDashboardOverview["teacher_actions"][number] | null;
  supportAction: TeacherDashboardOverview["teacher_actions"][number] | null;
}

export function buildDashboardViewModel(overview: TeacherDashboardOverview): DashboardViewModel {
  return {
    knowledgePointCount: overview.chapter_mastery.reduce(
      (count, chapter) => count + chapter.knowledge_point_count,
      0,
    ),
    recentActivity: overview.trend.slice(-3).reverse(),
    topDifficulty: overview.learning_difficulties[0] ?? null,
    attentionAction:
      overview.teacher_actions.find((action) => action.action_type === "encourage_inactive_students") ?? null,
    reviewAction: overview.teacher_actions.find((action) => action.action_type === "review_flags") ?? null,
    supportAction:
      overview.teacher_actions.find((action) => action.action_type === "support_knowledge_point") ?? null,
  };
}

export function formatDashboardDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
