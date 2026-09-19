import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiClient } from "@/lib/api-client";

export const knowledgePointQueryKeys = {
  events: (userId: string, courseId: string, pointId: string) =>
    ["knowledge-point-learning-events", userId, courseId, pointId] as const,
  sources: (userId: string, courseId: string, pointId: string) =>
    ["knowledge-point-sources", userId, courseId, pointId] as const,
  conversations: (userId: string, courseId: string, pointId: string) =>
    ["knowledge-point-conversations", userId, courseId, pointId] as const,
  misconceptions: (userId: string, courseId: string, pointId: string) =>
    ["knowledge-point-misconceptions", userId, courseId, pointId] as const,
};

export function useKnowledgePointLearningData(
  userId: string,
  courseId: string | null,
  knowledgePointId: string | null,
) {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && courseId && knowledgePointId);
  const eventsKey = knowledgePointQueryKeys.events(
    userId,
    courseId ?? "",
    knowledgePointId ?? "",
  );
  const sourcesKey = knowledgePointQueryKeys.sources(
    userId,
    courseId ?? "",
    knowledgePointId ?? "",
  );
  const conversationsKey = knowledgePointQueryKeys.conversations(
    userId,
    courseId ?? "",
    knowledgePointId ?? "",
  );
  const misconceptionsKey = knowledgePointQueryKeys.misconceptions(
    userId,
    courseId ?? "",
    knowledgePointId ?? "",
  );

  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: () =>
      apiClient.getStudentLearningEvents(
        userId,
        courseId ?? "",
        userId,
        {
          limit: 20,
          knowledgePointId: knowledgePointId ?? "",
        },
      ),
    enabled,
  });
  const sourcesQuery = useQuery({
    queryKey: sourcesKey,
    queryFn: () =>
      apiClient.getKnowledgePointSources(
        userId,
        courseId ?? "",
        knowledgePointId ?? "",
      ),
    enabled,
  });
  const conversationsQuery = useQuery({
    queryKey: conversationsKey,
    queryFn: () =>
      apiClient.getStudentRelatedConversations(
        userId,
        courseId ?? "",
        userId,
        knowledgePointId ?? "",
      ),
    enabled,
  });
  const misconceptionsQuery = useQuery({
    queryKey: misconceptionsKey,
    queryFn: () =>
      apiClient.getStudentMisconceptions(
        userId,
        courseId ?? "",
        userId,
        knowledgePointId ?? "",
        30,
      ),
    enabled,
  });

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: eventsKey }),
      queryClient.invalidateQueries({ queryKey: sourcesKey }),
      queryClient.invalidateQueries({ queryKey: conversationsKey }),
      queryClient.invalidateQueries({ queryKey: misconceptionsKey }),
    ]);
  }, [conversationsKey, eventsKey, misconceptionsKey, queryClient, sourcesKey]);

  return {
    events: eventsQuery.data?.items ?? [],
    eventsLoading: eventsQuery.isLoading,
    eventsError: eventsQuery.error instanceof Error ? eventsQuery.error : null,
    sources: sourcesQuery.data?.items ?? [],
    sourcesLoading: sourcesQuery.isLoading,
    sourcesError: sourcesQuery.error instanceof Error ? sourcesQuery.error : null,
    conversations: conversationsQuery.data?.items ?? [],
    conversationsLoading: conversationsQuery.isLoading,
    conversationsError:
      conversationsQuery.error instanceof Error
        ? conversationsQuery.error
        : null,
    misconceptions: misconceptionsQuery.data ?? null,
    misconceptionsLoading: misconceptionsQuery.isLoading,
    misconceptionsError:
      misconceptionsQuery.error instanceof Error
        ? misconceptionsQuery.error
        : null,
    reload,
  };
}
