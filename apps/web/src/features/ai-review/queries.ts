import type { ReviewDecisionRequest, ReviewFlag, ReviewSeverity, ReviewStatus } from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const aiReviewQueryKeys = {
  queue: (userId: string, courseId: string, status?: ReviewStatus, severity?: ReviewSeverity) =>
    ["teacher", "ai-review", "queue", userId, courseId, status ?? "all", severity ?? "all"] as const,
  flag: (userId: string, courseId: string, reviewId: string) =>
    ["teacher", "ai-review", "flag", userId, courseId, reviewId] as const,
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
    },
  });
}
