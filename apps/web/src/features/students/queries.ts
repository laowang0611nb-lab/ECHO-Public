import type { Chapter, ChapterAnalytics, Course, CourseMember, ReviewFlag, StudentLearningDetail } from "@echo/shared-types";
import { useQueries, useQuery } from "@tanstack/react-query";

import { buildStudentAnalyticsItem, groupConversationEvidence, summarizeStudents } from "@/features/students/view-model";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const studentQueryKeys = {
  members: (userId: string, courseId: string) => ["teacher", "students", "members", userId, courseId] as const,
  detail: (userId: string, courseId: string, studentId: string) =>
    ["teacher", "students", "detail", userId, courseId, studentId] as const,
  chapters: (userId: string, courseId: string) => ["teacher", "students", "chapters", userId, courseId] as const,
  chapterAnalytics: (userId: string, courseId: string) =>
    ["teacher", "students", "chapter-analytics", userId, courseId] as const,
  reviewFlags: (userId: string, courseId: string) => ["teacher", "students", "review-flags", userId, courseId] as const,
  conversationEvidence: (userId: string, courseId: string, studentId: string) =>
    ["teacher", "students", "conversation-evidence", userId, courseId, studentId] as const,
};

export function useStudentAnalytics(courseId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const enabled = Boolean(userId && courseId);

  const membersQuery = useQuery({
    queryKey: studentQueryKeys.members(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.listCourseMembers(userId!, courseId!),
    enabled,
    staleTime: 30_000,
  });
  const chaptersQuery = useQuery({
    queryKey: studentQueryKeys.chapters(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.listChapters(userId!, courseId!),
    enabled,
    staleTime: 30_000,
  });
  const analyticsQuery = useQuery({
    queryKey: studentQueryKeys.chapterAnalytics(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.getChapterAnalytics(userId!, courseId!),
    enabled,
    staleTime: 30_000,
  });
  const reviewFlagsQuery = useQuery({
    queryKey: studentQueryKeys.reviewFlags(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.listReviewFlags(userId!, courseId!, { limit: 100 }),
    enabled,
    staleTime: 30_000,
  });

  const students = (membersQuery.data ?? []).filter((member) => member.role === "student");
  const detailQueries = useQueries({
    queries: students.map((student) => ({
      queryKey: studentQueryKeys.detail(userId ?? "anonymous", courseId ?? "none", student.user_id),
      queryFn: () => apiClient.getStudentLearningDetail(userId!, courseId!, student.user_id),
      enabled,
      staleTime: 30_000,
    })),
  });

  const items = students.map((student, index) =>
    buildStudentAnalyticsItem({
      member: student,
      detail: detailQueries[index]?.data ?? null,
      chapters: chaptersQuery.data ?? [],
    }),
  );

  return {
    items,
    students,
    chapters: chaptersQuery.data ?? [],
    chapterAnalytics: analyticsQuery.data ?? [],
    reviewFlags: reviewFlagsQuery.data ?? [],
    summary: summarizeStudents(items),
    isLoading:
      membersQuery.isPending ||
      chaptersQuery.isPending ||
      analyticsQuery.isPending ||
      detailQueries.some((query) => query.isPending),
    isError:
      membersQuery.isError ||
      chaptersQuery.isError ||
      analyticsQuery.isError ||
      detailQueries.some((query) => query.isError),
    refetch: () => {
      void membersQuery.refetch();
      void chaptersQuery.refetch();
      void analyticsQuery.refetch();
      void reviewFlagsQuery.refetch();
      detailQueries.forEach((query) => void query.refetch());
    },
  };
}

export function useStudentDetail(studentId: string) {
  const { user } = useTeacherSession();
  const { courses } = useCourseWorkspace();
  const userId = user?.id;
  const memberQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: studentQueryKeys.members(userId ?? "anonymous", course.id),
      queryFn: () => apiClient.listCourseMembers(userId!, course.id),
      enabled: Boolean(userId),
      staleTime: 30_000,
    })),
  });

  let match: { course: Course; member: CourseMember; students: CourseMember[] } | null = null;
  for (let index = 0; index < memberQueries.length; index += 1) {
    const member = memberQueries[index]?.data?.find((item) => item.user_id === studentId && item.role === "student");
    if (member) {
      match = {
        course: courses[index],
        member,
        students: (memberQueries[index]?.data ?? []).filter((item) => item.role === "student"),
      };
      break;
    }
  }

  const detailQuery = useQuery({
    queryKey: studentQueryKeys.detail(userId ?? "anonymous", match?.course.id ?? "none", studentId),
    queryFn: () => apiClient.getStudentLearningDetail(userId!, match!.course.id, studentId),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });
  const chaptersQuery = useQuery({
    queryKey: studentQueryKeys.chapters(userId ?? "anonymous", match?.course.id ?? "none"),
    queryFn: () => apiClient.listChapters(userId!, match!.course.id),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });
  const chapterAnalyticsQuery = useQuery({
    queryKey: studentQueryKeys.chapterAnalytics(userId ?? "anonymous", match?.course.id ?? "none"),
    queryFn: () => apiClient.getChapterAnalytics(userId!, match!.course.id),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });
  const reviewFlagsQuery = useQuery({
    queryKey: studentQueryKeys.conversationEvidence(userId ?? "anonymous", match?.course.id ?? "none", studentId),
    queryFn: () => apiClient.listReviewFlags(userId!, match!.course.id, { limit: 100 }),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });

  const reviewFlags = (reviewFlagsQuery.data ?? []).filter((flag) => flag.student_id === studentId);
  const studentIndex = match?.students.findIndex((item) => item.user_id === studentId) ?? -1;
  const previousStudent = studentIndex > 0 ? match?.students[studentIndex - 1] ?? null : null;
  const nextStudent = studentIndex >= 0 && match && studentIndex < match.students.length - 1 ? match.students[studentIndex + 1] : null;
  return {
    previousStudent,
    nextStudent,
    course: match?.course ?? null,
    member: match?.member ?? null,
    detail: detailQuery.data ?? null,
    chapters: (chaptersQuery.data ?? []) as Chapter[],
    chapterAnalytics: (chapterAnalyticsQuery.data ?? []) as ChapterAnalytics[],
    masteryStates: detailQuery.data?.mastery_states ?? [],
    recentEvidence: detailQuery.data?.recent_evidence ?? [],
    reviewFlags: reviewFlags as ReviewFlag[],
    conversations: groupConversationEvidence(reviewFlags),
    isLoading:
      memberQueries.some((query) => query.isPending) ||
      (Boolean(match) &&
        (detailQuery.isPending || chaptersQuery.isPending || chapterAnalyticsQuery.isPending || reviewFlagsQuery.isPending)),
    isError:
      memberQueries.some((query) => query.isError) ||
      detailQuery.isError ||
      chaptersQuery.isError ||
      chapterAnalyticsQuery.isError ||
      reviewFlagsQuery.isError,
    refetch: () => {
      memberQueries.forEach((query) => void query.refetch());
      void detailQuery.refetch();
      void chaptersQuery.refetch();
      void chapterAnalyticsQuery.refetch();
      void reviewFlagsQuery.refetch();
    },
  };
}

export type StudentAnalyticsData = ReturnType<typeof useStudentAnalytics>;
export type StudentDetailData = ReturnType<typeof useStudentDetail>;
export type StudentDetailRecord = StudentLearningDetail;
