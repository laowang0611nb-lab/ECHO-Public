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

const insightSummaryTranslations: Record<string, string> = {
  "No immediate teaching risks detected in the last seven days.": "过去七天未发现需要立即处理的教学风险。",
};

export function localizeInsightSummary(summary: string) {
  const normalized = summary.trim();
  const attentionSummary = normalized.match(
    /^(\d+) knowledge points need attention and (\d+) AI answers await review\.$/,
  );
  if (attentionSummary) {
    return `${attentionSummary[1]} 个知识点需要关注，${attentionSummary[2]} 条 AI 回答等待审核。`;
  }
  return insightSummaryTranslations[normalized] ?? summary;
}
