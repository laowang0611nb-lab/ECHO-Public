import type { CourseDashboard, KnowledgePointAnalytics } from "@echo/shared-types";

import type { GraphPointRecord, GraphRiskLevel } from "./graph-types";

export function riskMapFromDashboard(
  points: GraphPointRecord[],
  dashboard: CourseDashboard | undefined,
): Map<string, GraphRiskLevel> {
  const pointIds = new Set(points.map((point) => point.id));
  const baseline: GraphRiskLevel = dashboard ? "normal" : "unknown";
  const map = new Map<string, GraphRiskLevel>(
    points.map((point) => [point.id, baseline]),
  );
  for (const item of dashboard?.high_risk_knowledge_points ?? []) {
    if (pointIds.has(item.knowledge_point_id)) {
      map.set(item.knowledge_point_id, "high");
    }
  }
  return map;
}

export function derivePointRisk(
  analytics: KnowledgePointAnalytics | null | undefined,
  current: GraphRiskLevel | undefined,
): GraphRiskLevel {
  if (current === "high") {
    return "high";
  }
  if (!analytics || analytics.average_mastery === null || analytics.students.length === 0) {
    return "unknown";
  }
  const mastery = analytics.average_mastery;
  const affected = analytics.affected_students;
  if (mastery < 55 || affected >= 8) {
    return "high";
  }
  if (mastery < 65 || affected >= 5) {
    return "medium";
  }
  if (mastery < 75 || affected >= 3) {
    return "elevated";
  }
  return "normal";
}

export function riskRuleDescription(risk: GraphRiskLevel, analytics: KnowledgePointAnalytics | null | undefined) {
  if (risk === "high") {
    return "来自课程看板的高风险知识点记录。";
  }
  if (!analytics || analytics.average_mastery === null) {
    return "当前没有足够的真实学情数据。";
  }
  if (risk === "medium") {
    return "按平均掌握度或薄弱学生数量进入中风险区间。";
  }
  if (risk === "elevated") {
    return "按平均掌握度或薄弱学生数量进入关注区间。";
  }
  return "当前平均掌握度和薄弱学生数量均处于正常区间。";
}

export function dashboardHighRisk(courseDashboard: CourseDashboard | undefined) {
  return courseDashboard?.high_risk_knowledge_points ?? [];
}
