import type { Chapter, Course, CourseDocument, KnowledgePoint, KnowledgePointAnalytics } from "@echo/shared-types";
import { useQueries, useQuery } from "@tanstack/react-query";

import { buildResourceView } from "@/features/knowledge/view-model";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const knowledgeQueryKeys = {
  resources: (userId: string, courseId: string) => ["teacher", "knowledge", "resources", userId, courseId] as const,
  chapters: (userId: string, courseId: string) => ["teacher", "knowledge", "chapters", userId, courseId] as const,
  resourceLookup: (userId: string, resourceId: string) => ["teacher", "knowledge", "resource-lookup", userId, resourceId] as const,
  pointLookup: (userId: string, pointId: string) => ["teacher", "knowledge", "point-lookup", userId, pointId] as const,
  pointAnalytics: (userId: string, courseId: string, pointId: string) =>
    ["teacher", "knowledge", "point-analytics", userId, courseId, pointId] as const,
  sourceEvidence: (userId: string, courseId: string, documentId: string, query: string, chunkId?: string) =>
    ["teacher", "knowledge", "source-evidence", userId, courseId, documentId, query, chunkId ?? ""] as const,
};

export function useKnowledgeBaseData(courseId: string | null) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const enabled = Boolean(userId && courseId);

  const resourcesQuery = useQuery({
    queryKey: knowledgeQueryKeys.resources(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.listCourseDocuments(userId!, courseId!),
    enabled,
    staleTime: 30_000,
  });

  const chaptersQuery = useQuery({
    queryKey: knowledgeQueryKeys.chapters(userId ?? "anonymous", courseId ?? "none"),
    queryFn: () => apiClient.listChapters(userId!, courseId!),
    enabled,
    staleTime: 30_000,
  });

  const documents = resourcesQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];
  const resources = documents.map((document) => buildResourceView(document, chapters));

  return {
    resources,
    chapters,
    isLoading: resourcesQuery.isPending || chaptersQuery.isPending,
    isError: resourcesQuery.isError || chaptersQuery.isError,
    refetch: () => {
      void resourcesQuery.refetch();
      void chaptersQuery.refetch();
    },
  };
}

export function useKnowledgeResourceData(resourceId: string) {
  const { user } = useTeacherSession();
  const { courses } = useCourseWorkspace();
  const userId = user?.id;

  const resourceQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: knowledgeQueryKeys.resourceLookup(userId ?? "anonymous", `${resourceId}:${course.id}`),
      queryFn: () => apiClient.listCourseDocuments(userId!, course.id),
      enabled: Boolean(userId),
      staleTime: 30_000,
    })),
  });

  let match: { document: CourseDocument; course: Course } | null = null;
  for (let index = 0; index < resourceQueries.length; index += 1) {
    const document = resourceQueries[index]?.data?.find((item) => item.id === resourceId);
    if (document) {
      match = { document, course: courses[index] };
      break;
    }
  }

  const chaptersQuery = useQuery({
    queryKey: knowledgeQueryKeys.chapters(userId ?? "anonymous", match?.course.id ?? "none"),
    queryFn: () => apiClient.listChapters(userId!, match!.course.id),
    enabled: Boolean(userId && match?.course.id),
    staleTime: 30_000,
  });

  const chapters = chaptersQuery.data ?? [];
  const resource = match ? buildResourceView(match.document, chapters) : null;
  const allDocumentQueriesPending = resourceQueries.some((query) => query.isPending);

  return {
    course: match?.course ?? null,
    resource,
    chapters,
    isLoading: allDocumentQueriesPending || (Boolean(match) && chaptersQuery.isPending),
    isError: resourceQueries.some((query) => query.isError) || chaptersQuery.isError,
    refetch: () => {
      resourceQueries.forEach((query) => void query.refetch());
      void chaptersQuery.refetch();
    },
  };
}

export function useKnowledgePointData(pointId: string) {
  const { user } = useTeacherSession();
  const { courses } = useCourseWorkspace();
  const userId = user?.id;

  const chapterQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: knowledgeQueryKeys.pointLookup(userId ?? "anonymous", `${pointId}:${course.id}`),
      queryFn: () => apiClient.listChapters(userId!, course.id),
      enabled: Boolean(userId),
      staleTime: 30_000,
    })),
  });

  let match: { chapter: Chapter; chapters: Chapter[]; point: KnowledgePoint; course: Course } | null = null;
  for (let index = 0; index < chapterQueries.length; index += 1) {
    const chapters = chapterQueries[index]?.data ?? [];
    const chapter = chapters.find((item) => item.knowledge_points.some((point) => point.id === pointId));
    const point = chapter?.knowledge_points.find((item) => item.id === pointId);
    if (chapter && point) {
      match = { chapter, chapters, point, course: courses[index] };
      break;
    }
  }

  const analyticsQuery = useQuery({
    queryKey: knowledgeQueryKeys.pointAnalytics(userId ?? "anonymous", match?.course.id ?? "none", pointId),
    queryFn: () => apiClient.getKnowledgePointAnalytics(userId!, match!.course.id, pointId),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });

  const documentsQuery = useQuery({
    queryKey: knowledgeQueryKeys.resources(userId ?? "anonymous", match?.course.id ?? "none"),
    queryFn: () => apiClient.listCourseDocuments(userId!, match!.course.id),
    enabled: Boolean(userId && match),
    staleTime: 30_000,
  });

  const sourceDocument: CourseDocument | null =
    documentsQuery.data?.find((document) => document.id === match?.chapter.document_id) ?? null;

  const chapterPoints = match?.chapter.knowledge_points ?? [];
  const pointIndex = chapterPoints.findIndex((point) => point.id === pointId);
  const context = match ? {
    ...match,
    sourceDocument,
    analytics: analyticsQuery.data ?? null,
    relatedPoints: chapterPoints.filter((point) => point.id !== pointId).slice(0, 8),
    previousPoint: pointIndex > 0 ? chapterPoints[pointIndex - 1] : null,
    nextPoint: pointIndex >= 0 && pointIndex < chapterPoints.length - 1 ? chapterPoints[pointIndex + 1] : null,
  } : null;

  return {
    context,
    isLoading:
      chapterQueries.some((query) => query.isPending) ||
      (Boolean(match) && (analyticsQuery.isPending || documentsQuery.isPending)),
    isError:
      chapterQueries.some((query) => query.isError) || analyticsQuery.isError || documentsQuery.isError,
    refetch: () => {
      chapterQueries.forEach((query) => void query.refetch());
      void analyticsQuery.refetch();
      void documentsQuery.refetch();
    },
  };
}

export function useSourceEvidence({
  courseId,
  documentId,
  query,
  chunkId,
}: {
  courseId: string | null | undefined;
  documentId: string | null | undefined;
  query: string | null | undefined;
  chunkId?: string;
}) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  const sourceQuery = useQuery({
    queryKey: knowledgeQueryKeys.sourceEvidence(
      userId ?? "anonymous",
      courseId ?? "none",
      documentId ?? "none",
      query ?? "",
      chunkId,
    ),
    queryFn: () => apiClient.searchCourse(userId!, courseId!, { query: query!, limit: 12 }),
    enabled: Boolean(userId && courseId && documentId && query),
    staleTime: 30_000,
  });

  const sourceResults = sourceQuery.data?.filter((item) => item.document_id === documentId) ?? [];
  const evidence = sourceResults.find((item) => item.chunk_id === chunkId) ?? sourceResults[0] ?? null;

  return {
    evidence,
    results: sourceQuery.data ?? [],
    isLoading: sourceQuery.isPending,
    isError: sourceQuery.isError,
    refetch: () => void sourceQuery.refetch(),
  };
}

export type KnowledgeBaseData = ReturnType<typeof useKnowledgeBaseData>;
export type KnowledgeResourceData = ReturnType<typeof useKnowledgeResourceData>;
export type KnowledgePointData = ReturnType<typeof useKnowledgePointData>;
export type SourceEvidenceData = ReturnType<typeof useSourceEvidence>;

export type KnowledgeCourse = Course;
export type KnowledgeChapter = Chapter;
export type KnowledgePointRecord = KnowledgePoint;
export type KnowledgeAnalytics = KnowledgePointAnalytics;
