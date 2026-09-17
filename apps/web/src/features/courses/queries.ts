import type { ChapterAnalytics, Course, CourseDashboard } from "@echo/shared-types";
import { useQueries } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const courseQueryKeys = {
  dashboard: (userId: string, courseId: string) => ["teacher", "course", courseId, "dashboard", userId] as const,
  chapters: (userId: string, courseId: string) => ["teacher", "course", courseId, "chapters", userId] as const,
};

export interface CourseManagementItem {
  course: Course;
  dashboard: CourseDashboard | null;
  chapters: ChapterAnalytics[];
  health: "draft" | "unknown" | "risk" | "attention" | "healthy";
  masteryValue: number | null;
  currentChapter: ChapterAnalytics | null;
  isProgressFallback: true;
}

export function useCourseManagementData() {
  const { user } = useTeacherSession();
  const workspace = useCourseWorkspace();
  const userId = user?.id;

  const dashboardQueries = useQueries({
    queries: workspace.courses.map((course) => ({
      queryKey: courseQueryKeys.dashboard(userId ?? "anonymous", course.id),
      queryFn: () => apiClient.getCourseDashboard(userId!, course.id),
      enabled: Boolean(userId),
      staleTime: 30_000,
    })),
  });

  const chapterQueries = useQueries({
    queries: workspace.courses.map((course) => ({
      queryKey: courseQueryKeys.chapters(userId ?? "anonymous", course.id),
      queryFn: () => apiClient.getChapterAnalytics(userId!, course.id),
      enabled: Boolean(userId),
      staleTime: 30_000,
    })),
  });

  const items: CourseManagementItem[] = workspace.courses.map((course, index) => {
    const dashboard = dashboardQueries[index]?.data ?? null;
    const chapters = chapterQueries[index]?.data ?? [];
    const masteryValue = dashboard?.average_mastery ?? null;
    const health: CourseManagementItem["health"] =
      course.status === "draft"
        ? "draft"
        : masteryValue === null
          ? "unknown"
          : masteryValue < 50
            ? "risk"
            : masteryValue < 70
              ? "attention"
              : "healthy";
    const currentChapter =
      chapters.find((chapter) => (chapter.average_mastery ?? 100) < 60) ?? chapters.at(-1) ?? null;

    return { course, dashboard, chapters, health, masteryValue, currentChapter, isProgressFallback: true };
  });

  const queryPending =
    workspace.isLoading ||
    dashboardQueries.some((query) => query.isPending) ||
    chapterQueries.some((query) => query.isPending);
  const queryError =
    workspace.isError || dashboardQueries.some((query) => query.isError) || chapterQueries.some((query) => query.isError);

  return {
    ...workspace,
    items,
    isLoading: queryPending,
    isError: queryError,
    refetch: () => {
      workspace.refetch();
      dashboardQueries.forEach((query) => void query.refetch());
      chapterQueries.forEach((query) => void query.refetch());
    },
  };
}

export function summarizeCourses(items: CourseManagementItem[]) {
  const studentCount = items.reduce((total, item) => total + (item.dashboard?.student_count ?? 0), 0);
  const masteryValues = items
    .map((item) => item.masteryValue)
    .filter((value): value is number => value !== null);
  const averageMastery = masteryValues.length
    ? masteryValues.reduce((total, value) => total + value, 0) / masteryValues.length
    : null;
  const attentionCount = items.filter((item) => item.health === "risk" || item.health === "attention").length;

  return { studentCount, averageMastery, attentionCount };
}
