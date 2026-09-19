import type {
  Chapter,
  Conversation,
  Course,
  KnowledgePoint,
  MasteryState,
} from "@echo/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { apiClient } from "@/lib/api-client";

export const studentCourseQueryKeys = {
  course: (userId: string, courseId: string) =>
    ["student-course", userId, courseId] as const,
  chapters: (userId: string, courseId: string) =>
    ["student-chapters", userId, courseId] as const,
  mastery: (userId: string, courseId: string) =>
    ["student-mastery", userId, courseId] as const,
  conversations: (userId: string, courseId: string) =>
    ["student-conversations", userId, courseId] as const,
};

export type StudentChapterStatus = "learning" | "not_started";

export interface StudentChapterSummary {
  chapter: Chapter;
  averageMastery: number | null;
  knowledgePointCount: number;
  masteryEvidenceCount: number;
  status: StudentChapterStatus;
  updatedAt: string | null;
}

export interface StudentContinueTarget {
  chapterId: string;
  knowledgePointId: string | null;
  title: string;
  subtitle: string;
}

export interface StudentActivityItem {
  id: string;
  kind: "conversation" | "mastery";
  title: string;
  description: string;
  createdAt: string;
  conversationId: string | null;
  knowledgePointId: string | null;
}

export interface StudentCourseData {
  course: Course | null;
  chapters: Chapter[];
  masteryStates: MasteryState[];
  conversations: Conversation[];
  knowledgePointsById: Map<string, KnowledgePoint>;
  chapterSummaries: StudentChapterSummary[];
  averageMastery: number | null;
  touchedChapterCount: number;
  continueTarget: StudentContinueTarget | null;
  recentActivities: StudentActivityItem[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function useStudentCourseData(
  userId: string,
  courseId: string | null,
): StudentCourseData {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && courseId);
  const courseKey = studentCourseQueryKeys.course(userId, courseId ?? "");
  const chaptersKey = studentCourseQueryKeys.chapters(userId, courseId ?? "");
  const masteryKey = studentCourseQueryKeys.mastery(userId, courseId ?? "");
  const conversationsKey = studentCourseQueryKeys.conversations(userId, courseId ?? "");

  const courseQuery = useQuery({
    queryKey: courseKey,
    queryFn: () => apiClient.getCourse(userId, courseId ?? ""),
    enabled,
  });
  const chaptersQuery = useQuery({
    queryKey: chaptersKey,
    queryFn: () => apiClient.listChapters(userId, courseId ?? ""),
    enabled,
  });
  const masteryQuery = useQuery({
    queryKey: masteryKey,
    queryFn: () => apiClient.getStudentMastery(userId, courseId ?? "", userId),
    enabled,
  });
  const conversationsQuery = useQuery({
    queryKey: conversationsKey,
    queryFn: () => apiClient.listConversations(userId, courseId ?? ""),
    enabled,
  });

  const chapters = useMemo(
    () =>
      [...(chaptersQuery.data ?? [])].sort(
        (left, right) =>
          left.order_index - right.order_index || left.id.localeCompare(right.id),
      ),
    [chaptersQuery.data],
  );
  const masteryStates = useMemo(
    () => masteryQuery.data ?? [],
    [masteryQuery.data],
  );
  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const knowledgePointsById = useMemo(() => {
    const map = new Map<string, KnowledgePoint>();
    for (const chapter of chapters) {
      for (const point of chapter.knowledge_points) {
        map.set(point.id, point);
      }
    }
    return map;
  }, [chapters]);
  const masteryByPointId = useMemo(
    () => new Map(masteryStates.map((state) => [state.knowledge_point_id, state])),
    [masteryStates],
  );

  const chapterSummaries = useMemo<StudentChapterSummary[]>(
    () =>
      chapters.map((chapter) => {
        const states = chapter.knowledge_points
          .map((point) => masteryByPointId.get(point.id))
          .filter((state): state is MasteryState => Boolean(state));
        const updatedAt =
          states
            .map((state) => state.updated_at)
            .sort((left, right) => right.localeCompare(left))[0] ?? null;
        return {
          chapter,
          averageMastery: average(states.map((state) => state.score)),
          knowledgePointCount: chapter.knowledge_points.length,
          masteryEvidenceCount: states.length,
          status: states.length > 0 ? "learning" : "not_started",
          updatedAt,
        };
      }),
    [chapters, masteryByPointId],
  );

  const averageMastery = useMemo(
    () => average(masteryStates.map((state) => state.score)),
    [masteryStates],
  );
  const touchedChapterCount = chapterSummaries.filter(
    (item) => item.masteryEvidenceCount > 0,
  ).length;

  const continueTarget = useMemo<StudentContinueTarget | null>(() => {
    const latestState = [...masteryStates].sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    )[0];
    if (latestState) {
      const chapter = chapters.find((item) =>
        item.knowledge_points.some(
          (point) => point.id === latestState.knowledge_point_id,
        ),
      );
      const point = knowledgePointsById.get(latestState.knowledge_point_id);
      if (chapter && point) {
        return {
          chapterId: chapter.id,
          knowledgePointId: point.id,
          title: chapter.title,
          subtitle: `从 ${point.name} 继续`,
        };
      }
    }
    const firstChapter = chapters.find(
      (chapter) => chapter.knowledge_points.length > 0,
    );
    if (!firstChapter) return null;
    return {
      chapterId: firstChapter.id,
      knowledgePointId: firstChapter.knowledge_points[0]?.id ?? null,
      title: firstChapter.title,
      subtitle: "从本章第一个知识点开始",
    };
  }, [chapters, knowledgePointsById, masteryStates]);

  const recentActivities = useMemo<StudentActivityItem[]>(() => {
    const conversationItems: StudentActivityItem[] = conversations.map(
      (conversation) => ({
        id: `conversation-${conversation.id}`,
        kind: "conversation",
        title: conversation.title || "AI 学习对话",
        description: "与 ECHO 进行了一次课程对话",
        createdAt: conversation.updated_at,
        conversationId: conversation.id,
        knowledgePointId: null,
      }),
    );
    const masteryItems: StudentActivityItem[] = masteryStates.map((state) => {
      const point = knowledgePointsById.get(state.knowledge_point_id);
      return {
        id: `mastery-${state.id}`,
        kind: "mastery",
        title: point?.name ?? "知识点学习状态",
        description: `当前学习状态 ${Math.round(state.score)}%`,
        createdAt: state.updated_at,
        conversationId: null,
        knowledgePointId: state.knowledge_point_id,
      };
    });
    return [...conversationItems, ...masteryItems]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12);
  }, [conversations, knowledgePointsById, masteryStates]);

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKey }),
      queryClient.invalidateQueries({ queryKey: chaptersKey }),
      queryClient.invalidateQueries({ queryKey: masteryKey }),
      queryClient.invalidateQueries({ queryKey: conversationsKey }),
    ]);
  }, [chaptersKey, conversationsKey, courseKey, masteryKey, queryClient]);

  return {
    course: courseQuery.data ?? null,
    chapters,
    masteryStates,
    conversations,
    knowledgePointsById,
    chapterSummaries,
    averageMastery,
    touchedChapterCount,
    continueTarget,
    recentActivities,
    loading:
      courseQuery.isLoading ||
      chaptersQuery.isLoading ||
      masteryQuery.isLoading,
    error:
      courseQuery.error instanceof Error
        ? courseQuery.error
        : chaptersQuery.error instanceof Error
          ? chaptersQuery.error
          : masteryQuery.error instanceof Error
            ? masteryQuery.error
            : null,
    reload,
  };
}
