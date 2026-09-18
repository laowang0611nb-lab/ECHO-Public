import type {
  ExecutionPlanAction,
  ExecutionPlanCreateRequest,
  ExecutionPlanDetail,
  ExecutionPlanPage,
  ExecutionPlanStatus,
  ExecutionPlanUpdateRequest,
  LearningEventType,
  PlanEffect,
  PlanLearningEventPage,
  PlanTaskItem,
  PlanTaskPage,
  PlanTaskStatus,
  PlanTaskUpdateRequest,
  WeeklyPlanGenerateRequest,
  WeeklyPlanGeneration,
} from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const executionPlanQueryKeys = {
  list: (userId: string, courseId: string, strategyId?: string | null, status?: ExecutionPlanStatus) =>
    ["teacher", "execution-plans", "list", userId, courseId, strategyId ?? "all", status ?? "all"] as const,
  detail: (userId: string, planId: string) =>
    ["teacher", "execution-plans", "detail", userId, planId] as const,
  tasks: (userId: string, planId: string) =>
    ["teacher", "execution-plans", "tasks", userId, planId] as const,
  events: (userId: string, planId: string, filters: string) =>
    ["teacher", "execution-plans", "events", userId, planId, filters] as const,
  effect: (userId: string, planId: string) =>
    ["teacher", "execution-plans", "effect", userId, planId] as const,
};

export function useExecutionPlans(
  courseId: string | null,
  options?: { strategyId?: string; status?: ExecutionPlanStatus; limit?: number },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<ExecutionPlanPage>({
    queryKey: executionPlanQueryKeys.list(userId ?? "anonymous", courseId ?? "none", options?.strategyId, options?.status),
    queryFn: () => apiClient.listExecutionPlans(userId!, courseId!, { ...options, limit: options?.limit ?? 100 }),
    enabled: Boolean(userId && courseId),
    staleTime: 15_000,
  });
}

export function useExecutionPlan(planId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<ExecutionPlanDetail>({
    queryKey: executionPlanQueryKeys.detail(userId ?? "anonymous", planId ?? "none"),
    queryFn: () => apiClient.getExecutionPlan(userId!, planId!),
    enabled: Boolean(userId && planId),
    staleTime: 15_000,
  });
}

export function usePlanTasks(planId: string | null, options?: { status?: PlanTaskStatus; week?: number }) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<PlanTaskPage>({
    queryKey: [...executionPlanQueryKeys.tasks(userId ?? "anonymous", planId ?? "none"), options?.status ?? "all", options?.week ?? 0],
    queryFn: () => apiClient.listPlanTasks(userId!, planId!, { ...options, limit: 100 }),
    enabled: Boolean(userId && planId),
    staleTime: 15_000,
  });
}

export function usePlanLearningEvents(
  planId: string | null,
  options?: {
    studentId?: string;
    taskId?: string;
    knowledgePointId?: string;
    eventType?: LearningEventType;
  },
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const filterKey = JSON.stringify(options ?? {});
  return useQuery<PlanLearningEventPage>({
    queryKey: executionPlanQueryKeys.events(userId ?? "anonymous", planId ?? "none", filterKey),
    queryFn: () => apiClient.listPlanLearningEvents(userId!, planId!, { ...options, limit: 100 }),
    enabled: Boolean(userId && planId),
    staleTime: 15_000,
  });
}

export function usePlanEffect(planId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<PlanEffect>({
    queryKey: executionPlanQueryKeys.effect(userId ?? "anonymous", planId ?? "none"),
    queryFn: () => apiClient.getExecutionPlanEffect(userId!, planId!),
    enabled: Boolean(userId && planId),
    staleTime: 30_000,
  });
}

export function useCreateExecutionPlan(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: (payload: ExecutionPlanCreateRequest) =>
      apiClient.createExecutionPlan(userId!, courseId!, payload),
    onSuccess: (plan) => invalidatePlan(queryClient, userId, courseId, plan.id),
  });
}

export function useUpdateExecutionPlan() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: ExecutionPlanUpdateRequest }) =>
      apiClient.updateExecutionPlan(userId!, planId, payload),
    onSuccess: (plan) => invalidatePlan(queryClient, userId, plan.course.id, plan.id),
  });
}

export function useExecutionPlanAction() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ planId, action }: { planId: string; action: ExecutionPlanAction }) =>
      apiClient.actOnExecutionPlan(userId!, planId, action),
    onSuccess: (plan) => invalidatePlan(queryClient, userId, plan.course.id, plan.id),
  });
}

export function useGenerateWeeklyPlan() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: WeeklyPlanGenerateRequest }) =>
      apiClient.generateExecutionPlanWeeklyPlan(userId!, planId, payload),
    onSuccess: (generation: WeeklyPlanGeneration, variables) => {
      void generation;
      void queryClient.invalidateQueries({ queryKey: executionPlanQueryKeys.detail(userId ?? "anonymous", variables.planId) });
    },
  });
}

export function useUpdatePlanTask() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation({
    mutationFn: ({ taskId, payload }: { planId: string; taskId: string; payload: PlanTaskUpdateRequest }) =>
      apiClient.updatePlanTask(userId!, taskId, payload),
    onSuccess: (task: PlanTaskItem, variables) => {
      void task;
      void queryClient.invalidateQueries({ queryKey: executionPlanQueryKeys.tasks(userId ?? "anonymous", variables.planId) });
      void queryClient.invalidateQueries({ queryKey: executionPlanQueryKeys.detail(userId ?? "anonymous", variables.planId) });
    },
  });
}

function invalidatePlan(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  courseId: string | null,
  planId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["teacher", "execution-plans", "list", userId ?? "anonymous", courseId ?? "none"] });
  void queryClient.invalidateQueries({ queryKey: executionPlanQueryKeys.detail(userId ?? "anonymous", planId) });
}
