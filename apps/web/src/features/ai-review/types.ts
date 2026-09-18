import type {
  ReviewFlag,
  ReviewReason,
  ReviewSeverity,
  ReviewStatus,
} from "@echo/shared-types";

export type ReviewStatusFilter = ReviewStatus | "all";
export type ReviewReasonFilter = ReviewReason | "all";
export type ReviewSeverityFilter = ReviewSeverity | "all";
export type ReviewSort = "priority" | "newest" | "oldest" | "severity";

export interface ReviewQueueFilters {
  search: string;
  status: ReviewStatusFilter;
  reason: ReviewReasonFilter;
  severity: ReviewSeverityFilter;
  sort: ReviewSort;
}

export interface ReviewQueueSummary {
  total: number;
  pending: number;
  highRisk: number;
  missingBasis: number;
  unresolved: number;
  reviewed: number;
}

export interface ReviewQueueView {
  flags: ReviewFlag[];
  summary: ReviewQueueSummary;
}

export interface ReviewEvidenceLinks {
  knowledgePointIds: string[];
  citations: Array<{
    documentId: string;
    page: number;
    chunkId?: string;
  }>;
}
