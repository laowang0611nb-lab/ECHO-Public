import type {
  ReviewContext,
  ReviewDecisionRequest,
  ReviewFlag,
  ReviewFlagQuery,
  ReviewFlagSummary,
  ReviewReason,
  ReviewRegeneration,
  ReviewRegenerationRequest,
  ReviewRegenerationStatus,
  ReviewSeverity,
  ReviewStatus,
} from "@echo/shared-types";
import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const aiReviewQueryKeys = {
  queue: (userId: string, courseId: string, status?: ReviewStatus, severity?: ReviewSeverity) =>
    ["teacher", "ai-review", "queue", userId, courseId, status ?? "all", severity ?? "all"] as const,
  query: (userId: string, courseId: string, filters: string) =>
    ["teacher", "ai-review", "query", userId, courseId, filters] as const,
  summary: (userId: string, courseId: string) =>
    ["teacher", "ai-review", "summary", userId, courseId] as const,
  flag: (userId: string, courseId: string, reviewId: string) =>
    ["teacher", "ai-review", "flag", userId, courseId, reviewId] as const,
  context: (userId: string, courseId: string, reviewId: string) =>
    ["teacher", "ai-review", "context", userId, courseId, reviewId] as const,
  regeneration: (userId: string, courseId: string, reviewId: string) =>
    ["teacher", "ai-review", "regeneration", userId, courseId, reviewId] as const,
};

export function useReviewQueue(
  courseId: string | null,
  options?: { status?: ReviewStatus; severity?: ReviewSeverity },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery({
    queryKey: aiReviewQueryKeys.queue(userId ?? "anonymous", courseId ?? "none", options?.status, options?.severity),
    queryFn: () => apiClient.listReviewFlags(userId!, courseId!, { ...options, limit: 100 }),
    enabled: Boolean(userId && courseId),
    staleTime: 15_000,
  });
}

export function useReviewQuery(
  courseId: string | null,
  options?: {
    status?: ReviewStatus;
    severity?: ReviewSeverity;
    reason?: ReviewReason;
    studentId?: string;
    knowledgePointId?: string;
    q?: string;
    sort?: "newest" | "oldest" | "priority" | "severity";
    cursor?: string;
    limit?: number;
  },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const filterKey = JSON.stringify(options ?? {});
  return useQuery<ReviewFlagQuery>({
    queryKey: aiReviewQueryKeys.query(userId ?? "anonymous", courseId ?? "none", filterKey),
    queryFn: () => apiClient.queryReviewFlags(userId!, courseId!, options),
    enabled: Boolean(userId && courseId),
    staleTime: 10_000,
  });
}

export function useReviewInfiniteQuery(
  courseId: string | null,
  options?: {
    status?: ReviewStatus;
    severity?: ReviewSeverity;
    reason?: ReviewReason;
    studentId?: string;
    knowledgePointId?: string;
    q?: string;
    sort?: "newest" | "oldest" | "priority" | "severity";
    limit?: number;
  },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const filterKey = JSON.stringify(options ?? {});
  return useInfiniteQuery<ReviewFlagQuery>({
    queryKey: aiReviewQueryKeys.query(userId ?? "anonymous", courseId ?? "none", filterKey),
    queryFn: ({ pageParam }) =>
      apiClient.queryReviewFlags(userId!, courseId!, {
        ...options,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: options?.limit ?? 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId && courseId),
    staleTime: 10_000,
  });
}
export function useReviewSummary(courseId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<ReviewFlagSummary>({
    queryKey: aiReviewQueryKeys.summary(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.getReviewSummary(userId!, courseId!),
    enabled: Boolean(userId && courseId),
    staleTime: 10_000,
  });
}

export function useReviewFlag(courseId: string | null, reviewId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery({
    queryKey: aiReviewQueryKeys.flag(userId ?? "anonymous", courseId ?? "none", reviewId ?? "none"),
    queryFn: () => apiClient.getReviewFlag(userId!, courseId!, reviewId!),
    enabled: Boolean(userId && courseId && reviewId),
    staleTime: 10_000,
  });
}

export function useReviewRegenerationStatus(courseId: string | null, reviewId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  const query = useQuery<ReviewRegenerationStatus>({
    queryKey: aiReviewQueryKeys.regeneration(userId ?? "anonymous", courseId ?? "none", reviewId ?? "none"),
    queryFn: () => apiClient.getReviewRegeneration(userId!, courseId!, reviewId!),
    enabled: Boolean(userId && courseId && reviewId),
    refetchInterval: (current) => current.state.data?.status === "generating" ? 2_000 : false,
  });

  useEffect(() => {
    const status = query.data?.status;
    if (status !== "completed" && status !== "failed") return;
    void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-review", "queue", userId ?? "anonymous", courseId ?? "none"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-review", "query", userId ?? "anonymous", courseId ?? "none"] });
    void queryClient.invalidateQueries({ queryKey: aiReviewQueryKeys.summary(userId ?? "anonymous", courseId ?? "none") });
    if (reviewId) void queryClient.invalidateQueries({ queryKey: aiReviewQueryKeys.flag(userId ?? "anonymous", courseId ?? "none", reviewId) });
  }, [courseId, query.data, queryClient, reviewId, userId]);

  return query;
}

export function useReviewContext(courseId: string | null, reviewId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<ReviewContext>({
    queryKey: aiReviewQueryKeys.context(userId ?? "anonymous", courseId ?? "none", reviewId ?? "none"),
    queryFn: () => apiClient.getReviewContext(userId!, courseId!, reviewId!),
    enabled: Boolean(userId && courseId && reviewId),
    staleTime: 10_000,
  });
}

export function useReviewDecision(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ flagId, payload }: { flagId: string; payload: ReviewDecisionRequest }) =>
      apiClient.reviewFlag(userId!, courseId!, flagId, payload),
    onSuccess: (updated: ReviewFlag) => {
      void queryClient.invalidateQueries({
        queryKey: ["teacher", "ai-review", "queue", userId ?? "anonymous", courseId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: aiReviewQueryKeys.flag(userId ?? "anonymous", courseId ?? "none", updated.id),
      });
      void queryClient.invalidateQueries({
        queryKey: ["teacher", "ai-review", "query", userId ?? "anonymous", courseId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: aiReviewQueryKeys.summary(userId ?? "anonymous", courseId ?? "none"),
      });
    },
  });
}

export function useReviewRegeneration(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ flagId, payload }: { flagId: string; payload: ReviewRegenerationRequest }) =>
      apiClient.regenerateReview(userId!, courseId!, flagId, payload),
    onSuccess: (result: ReviewRegeneration) => {
      queryClient.setQueryData<ReviewRegenerationStatus>(
        aiReviewQueryKeys.regeneration(userId ?? "anonymous", courseId ?? "none", result.review_id),
        {
          status: result.status,
          progress: result.status === "completed" ? 100 : 0,
          version: result.version,
          answer: result.answer,
          error: result.error,
          knowledgePointIds: result.knowledgePointIds,
          citations: result.citations,
        },
      );
      void queryClient.invalidateQueries({
        queryKey: ["teacher", "ai-review", "queue", userId ?? "anonymous", courseId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["teacher", "ai-review", "query", userId ?? "anonymous", courseId ?? "none"],
      });
      void queryClient.invalidateQueries({
        queryKey: aiReviewQueryKeys.summary(userId ?? "anonymous", courseId ?? "none"),
      });
      void queryClient.invalidateQueries({
        queryKey: aiReviewQueryKeys.flag(userId ?? "anonymous", courseId ?? "none", result.review_id),
      });
    },
  });
}
