import type {
  Chapter,
  ChapterAnalytics,
  Conversation,
  ErrorPatternReport,
  ReviewFlag,
  MasteryTrend,
  StudentLearningDetail,
  TeacherMessage,
} from "@echo/shared-types";
import { useQueries, useQuery } from "@tanstack/react-query";

import { buildConversationEvidenceGroups, buildStudentAnalyticsItem, summarizeStudents } from "@/features/students/view-model";
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
  studentConversations: (userId: string, courseId: string, studentId: string) =>
    ["teacher", "students", "conversations", userId, courseId, studentId] as const,
  conversationEvidence: (userId: string, courseId: string, studentId: string) =>
    ["teacher", "students", "conversation-evidence", userId, courseId, studentId] as const,
  conversationMessages: (userId: string, courseId: string, conversationId: string) =>
    ["teacher", "students", "conversation-messages", userId, courseId, conversationId] as const,
  masteryTrend: (userId: string, courseId: string, studentId: string, days: number) =>
    ["teacher", "students", "mastery-trend", userId, courseId, studentId, days] as const,
  errorPatterns: (userId: string, courseId: string, studentId: string, days: number) =>
    ["teacher", "students", "error-patterns", userId, courseId, studentId, days] as const,
};

export function useStudentAnalytics(
  courseId: string | null,
  options?: { includeDetails?: boolean },
) {
  const includeDetails = options?.includeDetails ?? true;
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
    queries: includeDetails ? students.map((student) => ({
      queryKey: studentQueryKeys.detail(userId ?? "anonymous", courseId ?? "none", student.user_id),
      queryFn: () => apiClient.getStudentLearningDetail(userId!, courseId!, student.user_id),
      enabled,
      staleTime: 30_000,
    })) : [],
  });

  const items = students.map((student, index) =>
    buildStudentAnalyticsItem({
      member: student,
      detail: includeDetails ? detailQueries[index]?.data ?? null : null,
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
      (includeDetails && detailQueries.some((query) => query.isPending)),
    isError:
      membersQuery.isError ||
      chaptersQuery.isError ||
      analyticsQuery.isError ||
      (includeDetails && detailQueries.some((query) => query.isError)),
    refetch: () => {
      void membersQuery.refetch();
      void chaptersQuery.refetch();
      void analyticsQuery.refetch();
      void reviewFlagsQuery.refetch();
      detailQueries.forEach((query) => void query.refetch());
    },
  };
}

export function useStudentDetail(
  studentId: string,
  preferredCourseId?: string | null,
) {
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

  const matches = memberQueries.flatMap((query, index) => {
    const member = query.data?.find(
      (item) => item.user_id === studentId && item.role === "student",
    );
    if (!member) {
      return [];
    }
    return [{
      course: courses[index],
      member,
      students: (query.data ?? []).filter((item) => item.role === "student"),
    }];
  });
  const match =
    matches.find((item) => item.course.id === preferredCourseId) ??
    matches[0] ??
    null;

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
  const studentConversationsQuery = useQuery({
    queryKey: studentQueryKeys.studentConversations(userId ?? "anonymous", match?.course.id ?? "none", studentId),
    queryFn: () => apiClient.listStudentConversations(userId!, match!.course.id, studentId),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });

  const reviewFlags = (reviewFlagsQuery.data ?? []).filter((flag) => flag.student_id === studentId);
  const studentConversations = (studentConversationsQuery.data ?? []) as Conversation[];
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
    studentConversations,
    conversations: buildConversationEvidenceGroups(studentConversations, reviewFlags),
    isLoading:
      memberQueries.some((query) => query.isPending) ||
      (Boolean(match) &&
        (detailQuery.isPending || chaptersQuery.isPending || chapterAnalyticsQuery.isPending || reviewFlagsQuery.isPending || studentConversationsQuery.isPending)),
    isError:
      memberQueries.some((query) => query.isError) ||
      detailQuery.isError ||
      chaptersQuery.isError ||
      chapterAnalyticsQuery.isError ||
      reviewFlagsQuery.isError ||
      studentConversationsQuery.isError,
    refetch: () => {
      memberQueries.forEach((query) => void query.refetch());
      void detailQuery.refetch();
      void chaptersQuery.refetch();
      void chapterAnalyticsQuery.refetch();
      void reviewFlagsQuery.refetch();
      void studentConversationsQuery.refetch();
    },
  };
}

export function useStudentMasteryTrend(courseId: string | null, studentId: string | null, days = 90) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<MasteryTrend>({
    queryKey: studentQueryKeys.masteryTrend(userId ?? "anonymous", courseId ?? "none", studentId ?? "none", days),
    queryFn: () => apiClient.getStudentMasteryTrend(userId!, courseId!, studentId!, days),
    enabled: Boolean(userId && courseId && studentId),
    staleTime: 30_000,
  });
}

export function useStudentErrorPatterns(courseId: string | null, studentId: string | null, days = 90) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<ErrorPatternReport>({
    queryKey: studentQueryKeys.errorPatterns(userId ?? "anonymous", courseId ?? "none", studentId ?? "none", days),
    queryFn: () => apiClient.getStudentErrorPatterns(userId!, courseId!, studentId!, days),
    enabled: Boolean(userId && courseId && studentId),
    staleTime: 30_000,
  });
}

export function useTeacherConversationMessages(
  courseId: string | null,
  conversationId: string | null,
) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery({
    queryKey: studentQueryKeys.conversationMessages(
      userId ?? "anonymous",
      courseId ?? "none",
      conversationId ?? "none",
    ),
    queryFn: () =>
      apiClient.listTeacherConversationMessages(userId!, courseId!, conversationId!),
    enabled: Boolean(userId && courseId && conversationId),
    staleTime: 30_000,
  });
}

export type StudentAnalyticsData = ReturnType<typeof useStudentAnalytics>;
export type TeacherConversationMessagesData = ReturnType<typeof useTeacherConversationMessages>;
export type TeacherConversationMessage = TeacherMessage;
export type StudentDetailData = ReturnType<typeof useStudentDetail>;
export type StudentDetailRecord = StudentLearningDetail;
