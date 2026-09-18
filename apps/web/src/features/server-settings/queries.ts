import type { HealthResponse, SystemStatusResponse } from "@echo/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const serverSettingsQueryKeys = {
  status: (userId: string) => ["teacher", "server-settings", "status", userId] as const,
  health: ["teacher", "server-settings", "health"] as const,
};

export function useSystemStatus() {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<SystemStatusResponse>({
    queryKey: serverSettingsQueryKeys.status(userId ?? "anonymous"),
    queryFn: () => apiClient.getSystemStatus(userId!),
    enabled: Boolean(userId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useServerHealth() {
  return useQuery<HealthResponse & { latencyMs: number }>({
    queryKey: serverSettingsQueryKeys.health,
    queryFn: async () => {
      const startedAt = performance.now();
      const health = await apiClient.health();
      return {
        ...health,
        latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      };
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useRefreshServerStatus() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["teacher", "server-settings", "status"] }),
      queryClient.invalidateQueries({ queryKey: serverSettingsQueryKeys.health }),
    ]);
  };
}
