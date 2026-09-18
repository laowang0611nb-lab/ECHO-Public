import type {
  PlanEffect,
  TeachingStrategyAction,
  TeachingStrategyCreateRequest,
  TeachingStrategyDetail,
  TeachingStrategyGenerateRequest,
  TeachingStrategyPage,
  TeachingStrategyPriority,
  TeachingStrategyStatus,
  TeachingStrategyType,
  TeachingStrategyUpdateRequest,
} from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const teachingStrategyQueryKeys = {
  list: (userId: string, courseId: string, filters: string) =>
    ["teacher", "teaching-strategies", "list", userId, courseId, filters] as const,
  detail: (userId: string, strategyId: string) =>
    ["teacher", "teaching-strategies", "detail", userId, strategyId] as const,
  versions: (userId: string, strategyId: string) =>
    ["teacher", "teaching-strategies", "versions", userId, strategyId] as const,
  effect: (userId: string, strategyId: string) =>
    ["teacher", "teaching-strategies", "effect", userId, strategyId] as const,
};

export function useTeachingStrategies(
  courseId: string | null,
  options?: {
    status?: TeachingStrategyStatus;
    type?: TeachingStrategyType;
    priority?: TeachingStrategyPriority;
    limit?: number;
  },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const filterKey = JSON.stringify(options ?? {});
  return useQuery<TeachingStrategyPage>({
    queryKey: teachingStrategyQueryKeys.list(userId ?? "anonymous", courseId ?? "none", filterKey),
    queryFn: () => apiClient.listTeachingStrategies(userId!, courseId!, { ...options, limit: options?.limit ?? 100 }),
    enabled: Boolean(userId && courseId),
    staleTime: 15_000,
  });
}

export function useTeachingStrategy(strategyId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<TeachingStrategyDetail>({
    queryKey: teachingStrategyQueryKeys.detail(userId ?? "anonymous", strategyId ?? "none"),
    queryFn: () => apiClient.getTeachingStrategy(userId!, strategyId!),
    enabled: Boolean(userId && strategyId),
    staleTime: 15_000,
  });
}

export function useTeachingStrategyEffect(strategyId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<PlanEffect>({
    queryKey: teachingStrategyQueryKeys.effect(userId ?? "anonymous", strategyId ?? "none"),
    queryFn: () => apiClient.getTeachingStrategyEffect(userId!, strategyId!),
    enabled: Boolean(userId && strategyId),
    staleTime: 30_000,
  });
}

export function useGenerateTeachingStrategy(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: (payload: TeachingStrategyGenerateRequest) =>
      apiClient.generateTeachingStrategy(userId!, courseId!, payload),
    onSuccess: () => invalidateTeachingStrategies(queryClient, userId, courseId),
  });
}

export function useCreateTeachingStrategy(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: (payload: TeachingStrategyCreateRequest) =>
      apiClient.createTeachingStrategy(userId!, courseId!, payload),
    onSuccess: () => invalidateTeachingStrategies(queryClient, userId, courseId),
  });
}

export function useUpdateTeachingStrategy(strategyId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: (payload: TeachingStrategyUpdateRequest) =>
      apiClient.updateTeachingStrategy(userId!, strategyId!, payload),
    onSuccess: (detail) => {
      queryClient.setQueryData(teachingStrategyQueryKeys.detail(userId!, detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "teaching-strategies"] });
    },
  });
}

export function useTeachingStrategyAction() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ strategyId, action }: { strategyId: string; action: TeachingStrategyAction }) =>
      apiClient.actOnTeachingStrategy(userId!, strategyId, action),
    onSuccess: (detail) => {
      queryClient.setQueryData(teachingStrategyQueryKeys.detail(userId!, detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "teaching-strategies"] });
    },
  });
}

function invalidateTeachingStrategies(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  courseId: string | null,
) {
  void queryClient.invalidateQueries({
    queryKey: ["teacher", "teaching-strategies", "list", userId ?? "anonymous", courseId ?? "none"],
  });
}
