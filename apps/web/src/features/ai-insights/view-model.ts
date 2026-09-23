import type {
  DashboardLearningDifficulty,
  DashboardTeacherAction,
  ReviewFlagSummary,
  ReviewReason,
  TeacherDashboardOverview,
} from "@echo/shared-types";

import { reviewReasonLabels } from "@/features/ai-review/view-model";

export type AiTeachingTone = "blue" | "emerald" | "amber" | "rose" | "violet" | "neutral";

export interface AiEvidenceNode {
  id: "conversations" | "quizzes" | "events" | "citations" | "mastery";
  label: string;
  value: string;
  description: string;
  href?: string;
}

export interface AiAnalysisOutcome {
  id: "knowledge-point" | "student-scope" | "error-pattern" | "strategy";
  label: string;
  value: string;
  description: string;
  tone: AiTeachingTone;
  href?: string;
  insufficient: boolean;
}

export interface AiFocusItem {
  id: string;
  title: string;
  description: string;
  evidence: string;
  href: string;
  tone: AiTeachingTone;
}

export interface AiEvidenceReason {
  id: string;
  label: string;
  value: string;
  description: string;
  href: string;
}

interface StudentEvidenceLike {
  activeRecently: boolean;
  status: string;
  weakKnowledgePoints: Array<{ id: string; name: string; score: number }>;
  detail: { recent_evidence: Array<{ event_type: string }> } | null;
}

export interface AiTeachingModel {
  evidenceNodes: AiEvidenceNode[];
  outcomes: AiAnalysisOutcome[];
  focusItems: AiFocusItem[];
  evidenceReasons: AiEvidenceReason[];
  topDifficulty: DashboardLearningDifficulty | null;
  inactiveStudentCount: number;
  highRiskReviews: number;
  pendingReviews: number;
}

export function buildAiTeachingModel({
  courseId,
  overview,
  students,
  reviewSummary,
  readyResources,
  totalResources,
  pendingResources,
  failedResources,
}: {
  courseId: string;
  overview: TeacherDashboardOverview;
  students: StudentEvidenceLike[];
  reviewSummary: ReviewFlagSummary | null;
  readyResources: number;
  totalResources: number;
  pendingResources: number;
  failedResources: number;
}): AiTeachingModel {
  const difficultyMap = new Map(
    overview.learning_difficulties.map((item) => [item.knowledge_point_id, item]),
  );
  for (const student of students) {
    for (const point of student.weakKnowledgePoints) {
      if (!difficultyMap.has(point.id)) {
        difficultyMap.set(point.id, {
          knowledge_point_id: point.id,
          name: point.name,
          average_score: point.score,
          affected_students: 1,
        });
      }
    }
  }

  const difficulties = [...difficultyMap.values()].sort(
    (left, right) => left.average_score - right.average_score,
  );
  const topDifficulty = difficulties[0] ?? null;
  const inactiveStudentCount = students.filter((student) => !student.activeRecently).length;
  const quizCount = students.reduce(
    (total, student) =>
      total +
      (student.detail?.recent_evidence.filter((event) => event.event_type.startsWith("quiz_")).length ?? 0),
    0,
  );
  const learningEventCount = students.reduce(
    (total, student) => total + (student.detail?.recent_evidence.length ?? 0),
    0,
  );
  const pendingReviews = reviewSummary?.pending ?? 0;
  const highRiskReviews = reviewSummary?.high_risk ?? 0;
  const topReviewReason = topReason(reviewSummary);
  const topAction = overview.teacher_actions[0] ?? null;
  const actionPresentation = topAction ? presentAction(topAction, courseId) : null;

  const evidenceNodes: AiEvidenceNode[] = [
    {
      id: "conversations",
      label: "学生对话",
      value: `${overview.stats.weekly_interaction_count} 次`,
      description: "过去七天的课程学习交互",
      href: `/students?courseId=${courseId}&tab=behavior`,
    },
    {
      id: "quizzes",
      label: "测验结果",
      value: `${quizCount} 条`,
      description: "最近学习证据中的 Quick Check 结果",
      href: `/students?courseId=${courseId}`,
    },
    {
      id: "events",
      label: "LearningEvent",
      value: `${learningEventCount} 条`,
      description: "可追溯的学习行为事件",
      href: `/students?courseId=${courseId}&tab=behavior`,
    },
    {
      id: "citations",
      label: "教材引用",
      value: `${readyResources}/${totalResources} 份`,
      description: "已解析并可供回答引用的资料",
      href: `/knowledge?courseId=${courseId}&tab=resources`,
    },
    {
      id: "mastery",
      label: "掌握度",
      value: overview.stats.average_mastery === null ? "暂无" : `${Math.round(overview.stats.average_mastery)}%`,
      description: "有状态知识点的当前平均值",
      href: `/knowledge?courseId=${courseId}&tab=graph`,
    },
  ];

  const outcomes: AiAnalysisOutcome[] = [
    topDifficulty
      ? {
          id: "knowledge-point",
          label: "薄弱知识点归因",
          value: topDifficulty.name,
          description: `${topDifficulty.affected_students} 名学生受影响，平均掌握度 ${Math.round(topDifficulty.average_score)}%。`,
          tone: "amber",
          href: `/knowledge/points/${topDifficulty.knowledge_point_id}?from=insights&courseId=${courseId}`,
          insufficient: false,
        }
      : insufficientOutcome("knowledge-point", "薄弱知识点归因"),
    {
      id: "student-scope",
      label: "影响学生范围",
      value: `${inactiveStudentCount} 名低活跃`,
      description: `当前课程共 ${overview.stats.student_count} 名学生，${overview.stats.active_student_count} 名近期活跃。`,
      tone: inactiveStudentCount ? "violet" : "emerald",
      href: `/students?courseId=${courseId}&tab=students`,
      insufficient: students.length === 0,
    },
    topReviewReason
      ? {
          id: "error-pattern",
          label: "错误 / 风险聚类",
          value: reviewReasonLabels[topReviewReason.reason],
          description: `${topReviewReason.count} 条 AI 回答风险记录归入该原因，需要教师结合引用复核。`,
          tone: "rose",
          href: `/ai-review?courseId=${courseId}&reason=${topReviewReason.reason}`,
          insufficient: false,
        }
      : insufficientOutcome("error-pattern", "错误 / 风险聚类"),
    topDifficulty || actionPresentation
      ? {
          id: "strategy",
          label: "教学策略建议",
          value: actionPresentation?.title ?? `针对「${topDifficulty?.name}」生成策略`,
          description: actionPresentation?.description ?? "把薄弱知识点带入正式策略生成流程，由教师决定是否采纳。",
          tone: "blue",
          href: actionPresentation?.href ?? `/teaching-strategies?courseId=${courseId}&knowledgePointId=${topDifficulty!.knowledge_point_id}`,
          insufficient: false,
        }
      : insufficientOutcome("strategy", "教学策略建议"),
  ];

  const focusItems: AiFocusItem[] = [];
  if (topDifficulty) {
    focusItems.push({
      id: `knowledge-${topDifficulty.knowledge_point_id}`,
      title: topDifficulty.name,
      description: "当前最薄弱的可追溯知识点。",
      evidence: `${topDifficulty.affected_students} 名学生，平均掌握度 ${Math.round(topDifficulty.average_score)}%`,
      href: `/knowledge/points/${topDifficulty.knowledge_point_id}?from=insights&courseId=${courseId}`,
      tone: "amber",
    });
  }
  if (pendingReviews) {
    focusItems.push({
      id: "review",
      title: "AI 回答等待教师判断",
      description: "风险来自真实 ReviewFlag，不代表模型已经自动定论。",
      evidence: `${pendingReviews} 条待审核，其中 ${highRiskReviews} 条高风险`,
      href: `/ai-review?courseId=${courseId}&status=open`,
      tone: "rose",
    });
  }
  if (inactiveStudentCount) {
    focusItems.push({
      id: "inactive",
      title: "部分学生近期缺少学习证据",
      description: "需要结合课堂安排判断是否需要干预。",
      evidence: `${inactiveStudentCount} 名学生最近七天无学习证据`,
      href: `/students?courseId=${courseId}&tab=students&activity=inactive`,
      tone: "violet",
    });
  }
  if (pendingResources || failedResources) {
    focusItems.push({
      id: "resources",
      title: "教学资源处理链条未完成",
      description: "资源未就绪会影响检索覆盖与回答引用。",
      evidence: `${pendingResources} 份待处理，${failedResources} 份失败`,
      href: `/knowledge?courseId=${courseId}&tab=resources`,
      tone: "blue",
    });
  }

  const evidenceReasons: AiEvidenceReason[] = [
    {
      id: "conversation",
      label: "学生对话与追问",
      value: `${overview.stats.weekly_interaction_count} 次`,
      description: "来自最近七天的课程交互统计。",
      href: `/students?courseId=${courseId}`,
    },
    {
      id: "quick-check",
      label: "Quick Check",
      value: `${quizCount} 条`,
      description: "来自学生学习证据中的正确/错误验证记录。",
      href: `/students?courseId=${courseId}`,
    },
    {
      id: "learning-event",
      label: "LearningEvent",
      value: `${learningEventCount} 条`,
      description: "用于解释学习行为、错误和解决状态。",
      href: `/students?courseId=${courseId}&tab=behavior`,
    },
    {
      id: "citations",
      label: "教材引用",
      value: `${readyResources} 份可用资源`,
      description: "回答中的教材依据必须回链到真实文档与 Chunk。",
      href: `/knowledge?courseId=${courseId}&tab=resources`,
    },
    {
      id: "mastery",
      label: "掌握度变化",
      value: overview.stats.average_mastery === null ? "暂无证据" : `${Math.round(overview.stats.average_mastery)}%`,
      description: "当前只展示有状态知识点的聚合值，不推断因果关系。",
      href: `/knowledge?courseId=${courseId}&tab=graph`,
    },
  ];

  return {
    evidenceNodes,
    outcomes,
    focusItems,
    evidenceReasons,
    topDifficulty,
    inactiveStudentCount,
    highRiskReviews,
    pendingReviews,
  };
}

function topReason(reviewSummary: ReviewFlagSummary | null) {
  const entries = Object.entries(reviewSummary?.reasons ?? {}) as Array<[ReviewReason, number]>;
  const top = entries.sort((left, right) => right[1] - left[1])[0];
  return top ? { reason: top[0], count: top[1] } : null;
}

function insufficientOutcome(
  id: AiAnalysisOutcome["id"],
  label: string,
): AiAnalysisOutcome {
  return {
    id,
    label,
    value: "证据不足",
    description: "当前没有足够证据形成可追溯结论，等待后端二次分析结果。",
    tone: "neutral",
    insufficient: true,
  };
}

function presentAction(action: DashboardTeacherAction, courseId: string) {
  if (action.action_type === "review_flags") {
    return {
      title: "处理待审核的 AI 回答",
      description: "进入审核工作台，结合引用、完整对话和风险原因作出教师决定。",
      href: `/ai-review?courseId=${courseId}&status=open`,
    };
  }
  if (action.action_type === "support_knowledge_point" && action.target_id) {
    return {
      title: "生成薄弱知识点策略",
      description: "将知识点证据带入正式教学策略流程，由教师决定是否采纳。",
      href: `/teaching-strategies?courseId=${courseId}&knowledgePointId=${action.target_id}`,
    };
  }
  return {
    title: "关注低活跃学生",
    description: "查看缺少近期学习证据的学生，并结合课堂观察安排后续支持。",
    href: `/students?courseId=${courseId}&tab=students&activity=inactive`,
  };
}
