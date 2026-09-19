import type { LearningEventType } from "@echo/shared-types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { apiClient } from "@/lib/api-client";

interface StudentLearningEventsOptions {
  eventType?: LearningEventType;
  knowledgePointId?: string;
}

export function useStudentLearningEvents(
  userId: string,
  courseId: string | null,
  options: StudentLearningEventsOptions = {},
) {
  const enabled = Boolean(userId && courseId);
  const query = useInfiniteQuery({
    queryKey: [
      "student-learning-events",
      userId,
      courseId ?? "",
      options.eventType ?? "all",
      options.knowledgePointId ?? "all",
    ],
    queryFn: ({ pageParam }) =>
      apiClient.getStudentLearningEvents(userId, courseId ?? "", userId, {
        cursor: pageParam,
        limit: 30,
        eventType: options.eventType,
        knowledgePointId: options.knowledgePointId,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled,
  });

  const events = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );

  return {
    events,
    total: query.data?.pages[0]?.total ?? 0,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    hasNextPage: query.hasNextPage,
    fetchingNextPage: query.isFetchingNextPage,
    reload: () => query.refetch(),
    loadMore: () => query.fetchNextPage(),
  };
}
