import type { Chapter, ChapterAnalytics, LearningEvidence, MasteryState, ReviewFlag } from "@echo/shared-types";

import type {
  ChapterMasteryItem,
  ConversationEvidenceGroup,
  StudentAnalyticsItem,
  StudentAnalyticsSummary,
  StudentLearningStatus,
} from "@/features/students/types";

export function masteryStatus(score: number | null): StudentLearningStatus {
  if (score === null) return "no_data";
  if (score >= 80) return "stable";
  if (score >= 65) return "basic";
  if (score >= 50) return "attention";
  return "risk";
}

export function statusLabel(status: StudentLearningStatus) {
  if (status === "stable") return "稳定掌握";
  if (status === "basic") return "基本掌握";
  if (status === "attention") return "需要关注";
  if (status === "risk") return "重点关注";
  return "暂无证据";
}

export function statusTone(status: StudentLearningStatus) {
  if (status === "stable") return "success" as const;
  if (status === "basic") return "info" as const;
  if (status === "attention") return "warning" as const;
  if (status === "risk") return "danger" as const;
  return "neutral" as const;
}

export function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    question_asked: "向 AI 提问",
    hint_requested: "请求提示",
    quiz_correct: "快速验证正确",
    quiz_wrong: "快速验证错误",
    concept_confusion: "概念困惑",
    repeated_error: "重复错误",
    resolved: "问题已解决",
    teacher_adjustment: "教师修正",
  };
  return labels[eventType] ?? eventType;
}

export function isWithinDays(value: string, days: number) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

export function buildStudentAnalyticsItem({
  member,
  detail,
  chapters,
}: {
  member: StudentAnalyticsItem["member"];
  detail: StudentAnalyticsItem["detail"];
  chapters: Chapter[];
}): StudentAnalyticsItem {
  const mastery = detail?.average_mastery ?? null;
  const pointNames = new Map(chapters.flatMap((chapter) => chapter.knowledge_points.map((point) => [point.id, point.name])));
  const weakKnowledgePoints = (detail?.mastery_states ?? [])
    .filter((state) => state.score < 60)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((state) => ({
      id: state.knowledge_point_id,
      name: pointNames.get(state.knowledge_point_id) ?? "未命名知识点",
      score: state.score,
    }));
  const evidence = detail?.recent_evidence ?? [];
  const latestEvidence = evidence[0] ?? null;
  const status = masteryStatus(mastery);
  const activeRecently = evidence.some((item) => isWithinDays(item.created_at, 7));
  const riskReason =
    status === "risk"
      ? "有证据显示多个知识点掌握偏低"
      : status === "attention"
        ? weakKnowledgePoints[0]?.name
          ? `需加强：${weakKnowledgePoints[0].name}`
          : "当前掌握状态需要关注"
        : !activeRecently && evidence.length > 0
          ? "最近 7 天没有学习证据"
          : null;
  return {
    member,
    detail,
    mastery,
    status,
    weakKnowledgePoints,
    latestEvidence,
    evidenceCount: evidence.length,
    activeRecently,
    riskReason,
  };
}

export function summarizeStudents(items: StudentAnalyticsItem[]): StudentAnalyticsSummary {
  const masteryValues = items
    .map((item) => item.mastery)
    .filter((value): value is number => value !== null);
  const distribution = [
    { label: "掌握良好", min: 80, max: 101, tone: "bg-primary" },
    { label: "基本掌握", min: 65, max: 80, tone: "bg-emerald-500" },
    { label: "需要加强", min: 50, max: 65, tone: "bg-orange-400" },
    { label: "重点关注", min: 0, max: 50, tone: "bg-rose-300" },
  ].map((bucket) => ({
    label: bucket.label,
    value: items.filter(
      (item) => item.mastery !== null && item.mastery >= bucket.min && item.mastery < bucket.max,
    ).length,
    tone: bucket.tone,
  }));
  return {
    studentCount: items.length,
    averageMastery: masteryValues.length
      ? masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length
      : null,
    activeCount: items.filter((item) => item.activeRecently).length,
    attentionCount: items.filter((item) => item.status === "attention" || item.status === "risk").length,
    masteryDistribution: distribution,
  };
}

export function buildChapterMastery(
  chapters: Chapter[],
  states: MasteryState[],
  classAnalytics: ChapterAnalytics[],
): ChapterMasteryItem[] {
  const scoreByPoint = new Map(states.map((state) => [state.knowledge_point_id, state.score]));
  return chapters
    .map((chapter) => {
      const scores = chapter.knowledge_points
        .map((point) => scoreByPoint.get(point.id))
        .filter((score): score is number => score !== undefined);
      const classItem = classAnalytics.find((item) => item.chapter_id === chapter.id);
      return {
        chapterId: chapter.id,
        title: chapter.title,
        orderIndex: chapter.order_index,
        score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
        pointCount: chapter.knowledge_points.length,
        classAverage: classItem?.average_mastery ?? null,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function buildWeakPoints(states: MasteryState[], chapters: Chapter[]) {
  const names = new Map(chapters.flatMap((chapter) => chapter.knowledge_points.map((point) => [point.id, point.name])));
  return states
    .filter((state) => state.score < 60)
    .sort((a, b) => a.score - b.score)
    .map((state) => ({ ...state, name: names.get(state.knowledge_point_id) ?? "未命名知识点" }));
}

export function groupConversationEvidence(flags: ReviewFlag[]): ConversationEvidenceGroup[] {
  const grouped = new Map<string, ReviewFlag[]>();
  for (const flag of flags) {
    const items = grouped.get(flag.conversation_id) ?? [];
    items.push(flag);
    grouped.set(flag.conversation_id, items);
  }
  return [...grouped.entries()]
    .map(([conversationId, items]) => {
      const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const status = items.some((item) => item.status === "open")
        ? "pending"
        : items.some((item) => item.status === "marked_incorrect")
          ? "rejected"
          : "reviewed";
      return {
        conversationId,
        title: sorted[0]?.question || sorted[0]?.answer.slice(0, 24) || "对话记录",
        updatedAt: sorted.at(-1)?.created_at ?? "",
        flags: sorted,
        messageIds: sorted.map((item) => item.message_id),
        status: status as ConversationEvidenceGroup["status"],
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function eventCategoryCounts(items: LearningEvidence[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.event_type] = (counts[item.event_type] ?? 0) + 1;
    return counts;
  }, {});
}
export function buildEvidenceTrend(items: StudentAnalyticsItem[], days = 7) {
  const today = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return { key, count: 0, students: new Set<string>() };
  });
  for (const item of items) {
    for (const event of item.detail?.recent_evidence ?? []) {
      const bucket = buckets.find((entry) => entry.key === event.created_at.slice(0, 10));
      if (bucket) {
        bucket.count += 1;
        bucket.students.add(item.member.user_id);
      }
    }
  }
  return buckets.map((bucket) => ({
    date: bucket.key,
    interaction_count: bucket.count,
    active_student_count: bucket.students.size,
  }));
}
