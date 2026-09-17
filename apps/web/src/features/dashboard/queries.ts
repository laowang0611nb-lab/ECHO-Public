import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";

export const dashboardQueryKeys = {
  overview: (userId: string, courseId: string) => ["teacher", "dashboard", "overview", userId, courseId] as const,
};

export function useTeacherDashboardOverview(userId: string | undefined, courseId: string | null) {
  return useQuery({
    queryKey: userId && courseId ? dashboardQueryKeys.overview(userId, courseId) : ["teacher", "dashboard", "overview", "idle"],
    queryFn: () => apiClient.getDashboardOverview(userId!, courseId!),
    enabled: Boolean(userId && courseId),
  });
}
