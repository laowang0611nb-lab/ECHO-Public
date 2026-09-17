import { ApiClientError } from "@echo/api-client";
import type { TeachingPolicy } from "@echo/shared-types";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const courseDetailQueryKeys = {
  overview: (userId: string, courseId: string) =>
    ["teacher", "course", courseId, "detail-overview", userId] as const,
  chapters: (userId: string, courseId: string) =>
    ["teacher", "course", courseId, "structure", userId] as const,
  members: (userId: string, courseId: string) =>
    ["teacher", "course", courseId, "members", userId] as const,
  documents: (userId: string, courseId: string) =>
    ["teacher", "course", courseId, "documents", userId] as const,
  policy: (userId: string, courseId: string) =>
    ["teacher", "course", courseId, "teaching-policy", userId] as const,
};

export function useCourseDetailData(courseId: string) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const enabled = Boolean(userId && courseId);

  const overviewQuery = useQuery({
    queryKey: courseDetailQueryKeys.overview(userId ?? "anonymous", courseId),
    queryFn: () => apiClient.getDashboardOverview(userId!, courseId),
    enabled,
    staleTime: 30_000,
  });

  const chaptersQuery = useQuery({
    queryKey: courseDetailQueryKeys.chapters(userId ?? "anonymous", courseId),
    queryFn: () => apiClient.listChapters(userId!, courseId),
    enabled,
    staleTime: 30_000,
  });

  const membersQuery = useQuery({
    queryKey: courseDetailQueryKeys.members(userId ?? "anonymous", courseId),
    queryFn: () => apiClient.listCourseMembers(userId!, courseId),
    enabled,
    staleTime: 30_000,
  });

  const documentsQuery = useQuery({
    queryKey: courseDetailQueryKeys.documents(userId ?? "anonymous", courseId),
    queryFn: () => apiClient.listCourseDocuments(userId!, courseId),
    enabled,
    staleTime: 30_000,
  });

  const policyQuery = useQuery({
    queryKey: courseDetailQueryKeys.policy(userId ?? "anonymous", courseId),
    queryFn: async (): Promise<TeachingPolicy | null> => {
      try {
        return await apiClient.getTeachingPolicy(userId!, courseId);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
  });

  const queries = [overviewQuery, chaptersQuery, membersQuery, documentsQuery, policyQuery];

  return {
    overview: overviewQuery.data ?? null,
    chapters: chaptersQuery.data ?? [],
    members: membersQuery.data ?? [],
    documents: documentsQuery.data ?? [],
    policy: policyQuery.data ?? null,
    isLoading: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
    refetch: () => {
      queries.forEach((query) => void query.refetch());
    },
  };
}

export type CourseDetailData = ReturnType<typeof useCourseDetailData>;
