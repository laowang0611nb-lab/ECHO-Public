import type { ReviewFlag, ReviewReason, ReviewSeverity, ReviewStatus } from "@echo/shared-types";

import type { ReviewEvidenceLinks, ReviewQueueFilters, ReviewQueueSummary } from "@/features/ai-review/types";

export const reviewReasonLabels: Record<ReviewReason, string> = {
  missing_course_basis: "缺少课程依据",
  outside_material_heavy: "教材外内容偏多",
  repeated_follow_up: "连续追问未解决",
  student_not_resolved: "学生标记未解决",
  teacher_rule_violation: "可能违反教学规则",
};

export function reviewSeverityLabel(severity: ReviewSeverity) {
  if (severity === "high") return "高风险";
  if (severity === "medium") return "中风险";
  return "低风险";
}

export function reviewSeverityTone(severity: ReviewSeverity) {
  if (severity === "high") return "danger" as const;
  if (severity === "medium") return "warning" as const;
  return "neutral" as const;
}

export function reviewStatusLabel(status: ReviewStatus) {
  if (status === "open") return "待审核";
  if (status === "confirmed_correct") return "确认正确";
  if (status === "marked_incorrect") return "已标记错误";
  return "已忽略";
}

export function reviewStatusTone(status: ReviewStatus) {
  if (status === "open") return "warning" as const;
  if (status === "confirmed_correct") return "success" as const;
  if (status === "marked_incorrect") return "danger" as const;
  return "neutral" as const;
}

export function filterReviewFlags(flags: ReviewFlag[], filters: ReviewQueueFilters) {
  const keyword = filters.search.trim().toLowerCase();
  return flags.filter((flag) => {
    const matchesSearch =
      !keyword ||
      flag.student_display_name.toLowerCase().includes(keyword) ||
      (flag.question ?? "").toLowerCase().includes(keyword) ||
      flag.answer.toLowerCase().includes(keyword) ||
      reviewReasonLabels[flag.reason].toLowerCase().includes(keyword);
    const matchesStatus = filters.status === "all" || flag.status === filters.status;
    const matchesReason = filters.reason === "all" || flag.reason === filters.reason;
    const matchesSeverity = filters.severity === "all" || flag.severity === filters.severity;
    return matchesSearch && matchesStatus && matchesReason && matchesSeverity;
  });
}

export function sortReviewFlags(flags: ReviewFlag[], sort: ReviewQueueFilters["sort"]) {
  const priority = { high: 3, medium: 2, low: 1 } as const;
  return [...flags].sort((left, right) => {
    if (sort === "newest") return right.created_at.localeCompare(left.created_at);
    if (sort === "severity") {
      return priority[right.severity] - priority[left.severity] || right.created_at.localeCompare(left.created_at);
    }
    const statusWeight = (flag: ReviewFlag) => (flag.status === "open" ? 1 : 0);
    return (
      statusWeight(right) - statusWeight(left) ||
      priority[right.severity] - priority[left.severity] ||
      right.created_at.localeCompare(left.created_at)
    );
  });
}

export function summarizeReviewFlags(flags: ReviewFlag[]): ReviewQueueSummary {
  return {
    total: flags.length,
    pending: flags.filter((flag) => flag.status === "open").length,
    highRisk: flags.filter((flag) => flag.severity === "high").length,
    missingBasis: flags.filter((flag) => flag.reason === "missing_course_basis").length,
    unresolved: flags.filter((flag) => flag.reason === "student_not_resolved").length,
    reviewed: flags.filter((flag) => flag.status !== "open").length,
  };
}

export function extractFlagEvidence(flag: ReviewFlag): ReviewEvidenceLinks {
  const knowledgePointIds = Array.isArray(flag.details.knowledge_point_ids)
    ? flag.details.knowledge_point_ids.filter((value): value is string => typeof value === "string")
    : [];
  const citations = Array.isArray(flag.details.citations)
    ? flag.details.citations.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        if (typeof item.document_id !== "string" || typeof item.page_start !== "number") return [];
        return [{
          documentId: item.document_id,
          page: item.page_start,
          chunkId: typeof item.chunk_id === "string" ? item.chunk_id : undefined,
        }];
      })
    : [];
  return { knowledgePointIds, citations };
}

export function nextReviewId(flags: ReviewFlag[], currentId: string) {
  const currentIndex = flags.findIndex((flag) => flag.id === currentId);
  if (currentIndex < 0) return flags[0]?.id ?? null;
  return flags[currentIndex + 1]?.id ?? null;
}

export function buildReviewWorkspaceHref(
  reviewId: string,
  courseId: string,
  filters: ReviewQueueFilters,
) {
  const params = new URLSearchParams();
  params.set("reviewId", reviewId);
  params.set("courseId", courseId);
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.reason !== "all") params.set("reason", filters.reason);
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.sort !== "priority") params.set("sort", filters.sort);
  return `/ai-review/pending?${params.toString()}`;
}
