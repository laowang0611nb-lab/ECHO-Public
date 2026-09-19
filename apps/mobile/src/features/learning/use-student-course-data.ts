import type {
  Chapter,
  Conversation,
  Course,
  KnowledgePoint,
  LearningEventType,
  MasteryState,
  StudentCourseProgress,
  StudentLearningEventItem,
  StudentPlanTaskItem,
  StudentResourceItem,
  StudentTeacherSummary,
} from "@echo/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { apiClient } from "@/lib/api-client";

import {
  learningEventDescription,
  learningEventTitle,
} from "./learning-event-view-model";

export const studentCourseQueryKeys = {
  course: (userId: string, courseId: string) =>
    ["student-course", userId, courseId] as const,
  chapters: (userId: string, courseId: string) =>
    ["student-chapters", userId, courseId] as const,
  mastery: (userId: string, courseId: string) =>
    ["student-mastery", userId, courseId] as const,
  conversations: (userId: string, courseId: string) =>
    ["student-conversations", userId, courseId] as const,
  progress: (userId: string, courseId: string) =>
    ["student-course-progress", userId, courseId] as const,
  teachers: (userId: string, courseId: string) =>
    ["student-course-teachers", userId, courseId] as const,
  planTasks: (userId: string, courseId: string) =>
    ["student-plan-tasks", userId, courseId] as const,
  recentLearningEvents: (userId: string, courseId: string) =>
    ["student-learning-events", userId, courseId, "recent"] as const,
  resources: (userId: string, courseId: string) =>
    ["student-course-resources", userId, courseId] as const,
};

export type StudentChapterStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export interface StudentChapterSummary {
  chapter: Chapter;
  averageMastery: number | null;
  knowledgePointCount: number;
  masteryEvidenceCount: number;
  startedKnowledgePointCount: number;
  masteredKnowledgePointCount: number;
  progressPercent: number;
  status: StudentChapterStatus;
  updatedAt: string | null;
  completionBasis: string | null;
}

export interface StudentContinueTarget {
  chapterId: string;
  knowledgePointId: string | null;
  title: string;
  subtitle: string;
}

export interface StudentActivityItem {
  id: string;
  kind: "learning" | "conversation" | "mastery";
  eventType: LearningEventType | null;
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
  progress: StudentCourseProgress | null;
  teachers: StudentTeacherSummary[];
  planTasks: StudentPlanTaskItem[];
  recentLearningEvents: StudentLearningEventItem[];
  resources: StudentResourceItem[];
  resourcesLoading: boolean;
  resourcesError: Error | null;
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
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function firstError(errors: unknown[]): Error | null {
  return errors.find((error): error is Error => error instanceof Error) ?? null;
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
  const conversationsKey = studentCourseQueryKeys.conversations(
    userId,
    courseId ?? "",
  );
  const progressKey = studentCourseQueryKeys.progress(userId, courseId ?? "");
  const teachersKey = studentCourseQueryKeys.teachers(userId, courseId ?? "");
  const planTasksKey = studentCourseQueryKeys.planTasks(userId, courseId ?? "");
  const recentEventsKey = studentCourseQueryKeys.recentLearningEvents(
    userId,
    courseId ?? "",
  );
  const resourcesKey = studentCourseQueryKeys.resources(userId, courseId ?? "");

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
  const progressQuery = useQuery({
    queryKey: progressKey,
    queryFn: () =>
      apiClient.getStudentCourseProgress(userId, courseId ?? "", userId),
    enabled,
  });
  const teachersQuery = useQuery({
    queryKey: teachersKey,
    queryFn: () => apiClient.getCourseTeachers(userId, courseId ?? ""),
    enabled,
  });
  const planTasksQuery = useQuery({
    queryKey: planTasksKey,
    queryFn: () => apiClient.getStudentPlanTasks(userId, courseId ?? "", userId),
    enabled,
  });
  const recentEventsQuery = useQuery({
    queryKey: recentEventsKey,
    queryFn: () =>
      apiClient.getStudentLearningEvents(userId, courseId ?? "", userId, {
        limit: 8,
      }),
    enabled,
  });
  const resourcesQuery = useQuery({
    queryKey: resourcesKey,
    queryFn: () => apiClient.getStudentCourseResources(userId, courseId ?? ""),
    enabled,
  });

  const chapters = useMemo(
    () =>
      [...(chaptersQuery.data ?? [])].sort(
        (left, right) =>
          left.order_index - right.order_index ||
          left.id.localeCompare(right.id),
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
  const progressByChapterId = useMemo(
    () =>
      new Map(
        (progressQuery.data?.chapters ?? []).map((item) => [
          item.chapter_id,
          item,
        ]),
      ),
    [progressQuery.data?.chapters],
  );

  const chapterSummaries = useMemo<StudentChapterSummary[]>(
    () =>
      chapters.map((chapter) => {
        const states = chapter.knowledge_points
          .map((point) => masteryByPointId.get(point.id))
          .filter((state): state is MasteryState => Boolean(state));
        const progress = progressByChapterId.get(chapter.id);
        const updatedAt =
          progress?.last_learning_at ??
          states
            .map((state) => state.updated_at)
            .sort((left, right) => right.localeCompare(left))[0] ??
          null;
        return {
          chapter,
          averageMastery:
            progress?.average_mastery ??
            average(states.map((state) => state.score)),
          knowledgePointCount:
            progress?.knowledge_point_count ?? chapter.knowledge_points.length,
          masteryEvidenceCount:
            progress?.started_knowledge_point_count ?? states.length,
          startedKnowledgePointCount:
            progress?.started_knowledge_point_count ?? states.length,
          masteredKnowledgePointCount:
            progress?.mastered_knowledge_point_count ??
            states.filter((state) => state.score >= 80).length,
          progressPercent: progress?.progress_percent ?? 0,
          status:
            progress?.status ??
            (states.length > 0 ? "in_progress" : "not_started"),
          updatedAt,
          completionBasis: progress?.completion_basis ?? null,
        };
      }),
    [chapters, masteryByPointId, progressByChapterId],
  );

  const progressAverages = (progressQuery.data?.chapters ?? [])
    .map((chapter) => chapter.average_mastery)
    .filter((value): value is number => value !== null);
  const averageMastery = useMemo(
    () =>
      average(
        progressAverages.length
          ? progressAverages
          : masteryStates.map((state) => state.score),
      ),
    [masteryStates, progressAverages],
  );
  const touchedChapterCount = chapterSummaries.filter(
    (item) => item.status !== "not_started",
  ).length;

  const continueTarget = useMemo<StudentContinueTarget | null>(() => {
    const currentPointId = progressQuery.data?.current_knowledge_point_id;
    if (currentPointId) {
      const chapter = chapters.find((item) =>
        item.knowledge_points.some((point) => point.id === currentPointId),
      );
      const point = knowledgePointsById.get(currentPointId);
      if (chapter && point) {
        return {
          chapterId: chapter.id,
          knowledgePointId: point.id,
          title: chapter.title,
          subtitle: `从 ${point.name} 继续`,
        };
      }
    }

    const currentChapterId = progressQuery.data?.current_chapter_id;
    if (currentChapterId) {
      const chapter = chapters.find((item) => item.id === currentChapterId);
      if (chapter) {
        return {
          chapterId: chapter.id,
          knowledgePointId: chapter.knowledge_points[0]?.id ?? null,
          title: chapter.title,
          subtitle: "从当前章节继续",
        };
      }
    }

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
  }, [
    chapters,
    knowledgePointsById,
    masteryStates,
    progressQuery.data?.current_chapter_id,
    progressQuery.data?.current_knowledge_point_id,
  ]);

  const recentActivities = useMemo<StudentActivityItem[]>(() => {
    const eventItems: StudentActivityItem[] = (
      recentEventsQuery.data?.items ?? []
    ).map((event) => ({
      id: `learning-${event.id}`,
      kind: "learning",
      eventType: event.event_type,
      title: learningEventTitle(event),
      description: learningEventDescription(event),
      createdAt: event.created_at,
      conversationId: event.conversation_id,
      knowledgePointId: event.knowledge_point_id,
    }));
    if (eventItems.length) return eventItems;

    const conversationItems: StudentActivityItem[] = conversations.map(
      (conversation) => ({
        id: `conversation-${conversation.id}`,
        kind: "conversation",
        eventType: null,
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
        eventType: null,
        title: point?.name ?? "知识点学习状态",
        description: `当前学习状态 ${Math.round(state.score)}%`,
        createdAt: state.updated_at,
        conversationId: null,
        knowledgePointId: state.knowledge_point_id,
      };
    });
    return [...conversationItems, ...masteryItems]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8);
  }, [
    conversations,
    knowledgePointsById,
    masteryStates,
    recentEventsQuery.data?.items,
  ]);

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: courseKey }),
      queryClient.invalidateQueries({ queryKey: chaptersKey }),
      queryClient.invalidateQueries({ queryKey: masteryKey }),
      queryClient.invalidateQueries({ queryKey: conversationsKey }),
      queryClient.invalidateQueries({ queryKey: progressKey }),
      queryClient.invalidateQueries({ queryKey: teachersKey }),
      queryClient.invalidateQueries({ queryKey: planTasksKey }),
      queryClient.invalidateQueries({ queryKey: recentEventsKey }),
      queryClient.invalidateQueries({ queryKey: resourcesKey }),
    ]);
  }, [
    chaptersKey,
    conversationsKey,
    courseKey,
    masteryKey,
    planTasksKey,
    progressKey,
    queryClient,
    recentEventsKey,
    resourcesKey,
    teachersKey,
  ]);

  return {
    course: courseQuery.data ?? null,
    chapters,
    masteryStates,
    conversations,
    knowledgePointsById,
    chapterSummaries,
    progress: progressQuery.data ?? null,
    teachers: teachersQuery.data?.teachers ?? [],
    planTasks: planTasksQuery.data?.items ?? [],
    recentLearningEvents: recentEventsQuery.data?.items ?? [],
    resources: resourcesQuery.data?.items ?? [],
    resourcesLoading: resourcesQuery.isLoading,
    resourcesError:
      resourcesQuery.error instanceof Error ? resourcesQuery.error : null,
    averageMastery,
    touchedChapterCount,
    continueTarget,
    recentActivities,
    loading:
      courseQuery.isLoading ||
      chaptersQuery.isLoading ||
      masteryQuery.isLoading ||
      progressQuery.isLoading,
    error: firstError([
      courseQuery.error,
      chaptersQuery.error,
      masteryQuery.error,
      progressQuery.error,
      teachersQuery.error,
      planTasksQuery.error,
      recentEventsQuery.error,
      resourcesQuery.error,
    ]),
    reload,
  };
}
