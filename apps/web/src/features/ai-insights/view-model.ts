import type {
  AIAnalysis,
  AIAnalysisEvidenceSource,
  AIAnalysisInsufficientCategory,
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
  tags?: string[];
  facts?: AiFactDetail[];
}

export interface AiFactDetail {
  id: string;
  text: string;
  sourceLabel: string;
  evidenceCount: number;
  href: string;
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
  realAnalysis: AIAnalysis | null;
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
    realAnalysis: null,
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

const evidenceSourceGroups: Record<AiEvidenceNode["id"], AIAnalysisEvidenceSource[]> = {
  conversations: ["conversation_message"],
  quizzes: ["quick_check_attempt"],
  events: ["learning_event", "review_flag"],
  citations: ["message_citation", "knowledge_chunk"],
  mastery: ["mastery_snapshot", "initial_analysis"],
};

const evidenceReasonSourceGroups: Record<string, AIAnalysisEvidenceSource[]> = {
  conversation: ["conversation_message"],
  "quick-check": ["quick_check_attempt"],
  "learning-event": ["learning_event", "review_flag"],
  citations: ["message_citation", "knowledge_chunk"],
  mastery: ["mastery_snapshot", "initial_analysis"],
};

const insufficientCategoryLabels: Record<AIAnalysisInsufficientCategory, string> = {
  no_evidence: "无可用证据",
  partial_coverage: "仅覆盖部分学生或知识点",
  conflicting_evidence: "证据相互冲突",
  missing_causal_evidence: "缺少因果链关键证据",
  model_uncertain: "模型无法确认结论",
};

const evidenceSourceLabels: Record<AIAnalysisEvidenceSource, string> = {
  initial_analysis: "前序分析",
  learning_event: "LearningEvent",
  mastery_snapshot: "掌握度快照",
  quick_check_attempt: "测验结果",
  conversation_message: "学生对话",
  review_flag: "审核证据",
  message_citation: "回答引用",
  knowledge_chunk: "教材片段",
};

function factEvidenceHref(courseId: string, sourceType: AIAnalysisEvidenceSource) {
  if (sourceType === "review_flag") return `/ai-review?courseId=${courseId}`;
  if (sourceType === "message_citation" || sourceType === "knowledge_chunk") return `/knowledge?courseId=${courseId}&tab=resources`;
  if (sourceType === "mastery_snapshot") return `/knowledge?courseId=${courseId}&tab=graph`;
  if (sourceType === "initial_analysis") return `/ai-insights?courseId=${courseId}`;
  return `/students?courseId=${courseId}&tab=behavior`;
}

export function applyAIAnalysisToTeachingModel(
  base: AiTeachingModel,
  analysis: AIAnalysis | null,
): AiTeachingModel {
  if (!analysis?.result) return { ...base, realAnalysis: analysis };
  const result = analysis.result;
  const evidenceById = new Map(analysis.evidence.map((item) => [item.id, item]));
  const factDetails: AiFactDetail[] = result.facts.map((fact, index) => {
    const sourceTypes = [...new Set(
      fact.evidence_ids
        .map((evidenceId) => evidenceById.get(evidenceId)?.source_type)
        .filter((sourceType): sourceType is AIAnalysisEvidenceSource => Boolean(sourceType)),
    )];
    const primarySource = sourceTypes[0] ?? "learning_event";
    return {
      id: `fact-${index}`,
      text: fact.fact,
      sourceLabel: sourceTypes.map((sourceType) => evidenceSourceLabels[sourceType]).join("、") || "关联证据",
      evidenceCount: fact.evidence_ids.length,
      href: factEvidenceHref(analysis.course_id, primarySource),
    };
  });
  const insufficientTags = result.insufficient_categories.map((category) => insufficientCategoryLabels[category]);
  const insufficientReason = result.insufficient_reason
    ?? (result.insufficient_evidence
      ? "该记录生成于修复前，未保存模型的不足原因。"
      : null);

  const evidenceNodes = base.evidenceNodes.map((node) => ({
    ...node,
    value: `${analysis.evidence.filter((item) => evidenceSourceGroups[node.id].includes(item.source_type)).length} 条`,
    description: analysis.evidence.length
      ? `本次分析已关联 ${analysis.evidence.length} 条持久化证据。`
      : node.description,
  }));

  const outcomes: AiAnalysisOutcome[] = result.insufficient_evidence
    ? [
        {
          id: "knowledge-point",
          label: "证据不足原因",
          value: insufficientReason ?? "未保存模型的不足原因",
          description: result.root_cause,
          tags: insufficientTags.length ? insufficientTags : undefined,
          tone: "neutral",
          insufficient: true,
        },
        {
          id: "student-scope",
          label: "影响学生范围",
          value: `${result.affected_student_ids.length} 名学生`,
          description: "当前范围来自分析记录，不扩展为无证据个体结论。",
          tone: "neutral",
          insufficient: true,
        },
        {
          id: "error-pattern",
          label: "已保存事实",
          value: `${result.facts.length} 条可追溯事实`,
          description: result.facts.length
            ? `本次记录包含 ${analysis.evidence.length} 条证据，以下事实均可回链。`
            : "本次记录没有形成可回链事实。",
          facts: factDetails,
          tone: "neutral",
          insufficient: true,
        },
        {
          id: "strategy",
          label: "教学策略建议",
          value: "暂不可生成",
          description: result.recommendation,
          tone: "neutral",
          insufficient: true,
        },
      ]
    : [
        {
          id: "knowledge-point",
          label: "结论与原因",
          value: result.conclusion,
          description: result.root_cause,
          tone: "amber",
          insufficient: false,
        },
        {
          id: "student-scope",
          label: "影响学生范围",
          value: `${result.affected_student_ids.length} 名学生`,
          description: analysis.student_ids.length
            ? `分析范围为 ${analysis.student_ids.length} 名指定学生。`
            : "分析范围覆盖当前课程全班学生。",
          tone: "violet",
          href: `/students?courseId=${analysis.course_id}&tab=students`,
          insufficient: false,
        },
        {
          id: "error-pattern",
          label: "可追溯事实",
          value: result.facts[0]?.fact ?? "暂无结构化事实",
          description: result.facts.length
            ? `${result.facts.length} 条事实均引用本次分析中的真实 evidence_id。`
            : "没有形成可追溯事实。",
          tone: "rose",
          insufficient: result.facts.length === 0,
        },
        {
          id: "strategy",
          label: "教学策略建议",
          value: result.recommendation,
          description: result.strategy_id
            ? "已生成建议状态的教学策略，仍需教师采纳和发布。"
            : "可转换为建议状态的教学策略，由教师继续决定。",
          tone: "blue",
          href: result.strategy_id ? `/teaching-strategies/${result.strategy_id}` : undefined,
          insufficient: false,
        },
      ];

  const evidenceReasons = base.evidenceReasons.map((reason) => {
    const sourceTypes = evidenceReasonSourceGroups[reason.id];
    if (!sourceTypes) return reason;
    const count = analysis.evidence.filter((item) => sourceTypes.includes(item.source_type)).length;
    return count ? { ...reason, value: `${count} 条` } : reason;
  });

  const analysisFocusItems: AiFocusItem[] = result.insufficient_evidence
    ? [
        {
          id: `analysis-${analysis.id}-evidence-gap`,
          title: "需要补充可追溯证据",
          description: result.recommendation,
          evidence: `${analysis.evidence.length} 条证据 · ${result.affected_student_ids.length} 名学生`,
          href: `/students?courseId=${analysis.course_id}&tab=behavior`,
          tone: "neutral",
        },
      ]
    : [];

  analysisFocusItems.push(
    ...outcomes
      .filter((outcome) => outcome.href && !outcome.insufficient)
      .map((outcome) => ({
        id: outcome.id,
        title: outcome.label,
        description: outcome.description,
        evidence: outcome.value,
        href: outcome.href!,
        tone: outcome.tone,
      })),
  );

  const focusItems = [...analysisFocusItems, ...base.focusItems]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 6);

  return { ...base, evidenceNodes, outcomes, evidenceReasons, focusItems, realAnalysis: analysis };
}
