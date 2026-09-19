import type { Chapter, MasteryState } from "@echo/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiClient } from "@/lib/api-client";

export interface StudentLearningOverview {
  chapters: Chapter[];
  mastery: MasteryState[];
  loading: boolean;
  error: Error | null;
  averageMastery: number | null;
  reload: () => void;
}

export function useStudentLearningOverview(
  userId: string,
  courseId: string | null,
): StudentLearningOverview {
  const queryClient = useQueryClient();
  const chaptersQuery = useQuery({
    queryKey: ["student-chapters", courseId],
    queryFn: () => apiClient.listChapters(userId, courseId ?? ""),
    enabled: Boolean(userId && courseId),
  });

  const masteryQuery = useQuery({
    queryKey: ["student-mastery", courseId, userId],
    queryFn: () => apiClient.getStudentMastery(userId, courseId ?? "", userId),
    enabled: Boolean(userId && courseId),
  });

  const chapters = chaptersQuery.data ?? [];
  const mastery = masteryQuery.data ?? [];
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["student-chapters", courseId] });
    void queryClient.invalidateQueries({ queryKey: ["student-mastery", courseId, userId] });
  }, [courseId, queryClient, userId]);
  const averageMastery =
    mastery.length > 0
      ? Math.round(mastery.reduce((sum, item) => sum + item.score, 0) / mastery.length)
      : null;

  return {
    chapters,
    mastery,
    loading: chaptersQuery.isLoading || masteryQuery.isLoading,
    error:
      chaptersQuery.error instanceof Error
        ? chaptersQuery.error
        : masteryQuery.error instanceof Error
          ? masteryQuery.error
          : null,
    averageMastery,
    reload,
  };
}
