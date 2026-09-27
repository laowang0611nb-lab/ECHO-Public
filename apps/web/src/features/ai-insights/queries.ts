import type {
  AIAnalysis,
  AIAnalysisCreateRequest,
  AIAnalysisPage,
  AIAnalysisProgressResponse,
  AIAnalysisReanalyzeRequest,
  AIAnalysisStrategyRequest,
  TeachingStrategyDetail,
} from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const aiAnalysisQueryKeys = {
  list: (userId: string, courseId: string, knowledgePointId?: string | null) =>
    ["teacher", "ai-analysis", "list", userId, courseId, knowledgePointId ?? "all"] as const,
  detail: (userId: string, courseId: string, analysisId: string) =>
    ["teacher", "ai-analysis", "detail", userId, courseId, analysisId] as const,
  progress: (userId: string, courseId: string, analysisId: string) =>
    ["teacher", "ai-analysis", "progress", userId, courseId, analysisId] as const,
};

export function useAIAnalysisList(
  courseId: string | null,
  knowledgePointId?: string | null,
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<AIAnalysisPage>({
    queryKey: aiAnalysisQueryKeys.list(userId ?? "anonymous", courseId ?? "none", knowledgePointId),
    queryFn: () =>
      apiClient.listAIAnalyses(userId!, courseId!, {
        knowledgePointId: knowledgePointId ?? undefined,
        limit: 20,
      }),
    enabled: Boolean(userId && courseId),
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "analyzing") ? 5_000 : false,
  });
}

export function useAIAnalysis(courseId: string | null, analysisId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<AIAnalysis>({
    queryKey: aiAnalysisQueryKeys.detail(userId ?? "anonymous", courseId ?? "none", analysisId ?? "none"),
    queryFn: () => apiClient.getAIAnalysis(userId!, courseId!, analysisId!),
    enabled: Boolean(userId && courseId && analysisId),
    staleTime: 5_000,
  });
}

export function useAIAnalysisProgress(
  courseId: string | null,
  analysisId: string | null,
  enabled = true,
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<AIAnalysisProgressResponse>({
    queryKey: aiAnalysisQueryKeys.progress(userId ?? "anonymous", courseId ?? "none", analysisId ?? "none"),
    queryFn: () => apiClient.getAIAnalysisProgress(userId!, courseId!, analysisId!),
    enabled: Boolean(enabled && userId && courseId && analysisId),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === "analyzing" ? 2_000 : false,
  });
}

export function useCreateAIAnalysis(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<AIAnalysis, Error, AIAnalysisCreateRequest>({
    mutationFn: (payload) => apiClient.createAIAnalysis(userId!, courseId!, payload),
    onSuccess: (analysis) => {
      queryClient.setQueryData(aiAnalysisQueryKeys.detail(userId!, courseId!, analysis.id), analysis);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-analysis", "list"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-analysis", "list"] });
    },
  });
}

export interface ReanalyzeAIAnalysisVariables {
  analysisId: string;
  payload?: AIAnalysisReanalyzeRequest;
}

export function useReanalyzeAIAnalysis(courseId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<AIAnalysis, Error, ReanalyzeAIAnalysisVariables>({
    mutationFn: ({ analysisId, payload }) =>
      apiClient.reanalyzeAIAnalysis(userId!, courseId!, analysisId, payload),
    onSuccess: (analysis) => {
      queryClient.setQueryData(aiAnalysisQueryKeys.detail(userId!, courseId!, analysis.id), analysis);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-analysis", "list"] });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-analysis", "list"] });
    },
  });
}

export function useCreateStrategyFromAIAnalysis(
  courseId: string | null,
  analysisId: string | null,
) {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<TeachingStrategyDetail, Error, AIAnalysisStrategyRequest | undefined>({
    mutationFn: (payload) =>
      apiClient.createStrategyFromAIAnalysis(userId!, courseId!, analysisId!, payload),
    onSuccess: (strategy) => {
      if (analysisId) {
        queryClient.setQueryData<AIAnalysis>(
          aiAnalysisQueryKeys.detail(userId!, courseId!, analysisId),
          (current) => current?.result
            ? { ...current, result: { ...current.result, strategy_id: strategy.id } }
            : current,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["teacher", "ai-analysis"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "teaching-strategies"] });
    },
  });
}
