import type { DemoDatasetStatus, LearningEventCreateRequest } from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const demoQueryKeys = {
  status: (userId: string) => ["teacher", "demo", "status", userId] as const,
};

export function useDemoStatus() {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<DemoDatasetStatus>({
    queryKey: demoQueryKeys.status(userId ?? "anonymous"),
    queryFn: () => apiClient.getDemoStatus(userId!),
    enabled: Boolean(userId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useResetDemoData() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: () => apiClient.resetDemoData(userId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher"] });
    },
  });
}

export function useSimulateDemoLearningEvent(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: (payload: LearningEventCreateRequest) =>
      apiClient.createLearningEvent(userId!, courseId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher"] });
    },
  });
}
