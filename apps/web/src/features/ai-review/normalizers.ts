import type { ReviewQueueFilters, ReviewReasonFilter, ReviewSeverityFilter, ReviewSort, ReviewStatusFilter } from "@/features/ai-review/types";

export function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeReviewStatus(value: string | undefined): ReviewStatusFilter {
  return value === "open" || value === "confirmed_correct" || value === "marked_incorrect" || value === "dismissed"
    ? value
    : "all";
}

export function normalizeReviewReason(value: string | undefined): ReviewReasonFilter {
  return value === "missing_course_basis" ||
    value === "outside_material_heavy" ||
    value === "repeated_follow_up" ||
    value === "student_not_resolved" ||
    value === "teacher_rule_violation"
    ? value
    : "all";
}

export function normalizeReviewSeverity(value: string | undefined): ReviewSeverityFilter {
  return value === "high" || value === "medium" || value === "low" ? value : "all";
}

export function normalizeReviewSort(value: string | undefined): ReviewSort {
  return value === "newest" || value === "severity" ? value : "priority";
}

export function buildReviewFilters(searchParams: {
  q?: string | string[];
  status?: string | string[];
  reason?: string | string[];
  severity?: string | string[];
  sort?: string | string[];
}): ReviewQueueFilters {
  return {
    search: firstQueryValue(searchParams.q)?.trim() ?? "",
    status: normalizeReviewStatus(firstQueryValue(searchParams.status)),
    reason: normalizeReviewReason(firstQueryValue(searchParams.reason)),
    severity: normalizeReviewSeverity(firstQueryValue(searchParams.severity)),
    sort: normalizeReviewSort(firstQueryValue(searchParams.sort)),
  };
}
