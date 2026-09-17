import type { Chapter, CourseDocument, KnowledgePoint, KnowledgePointAnalytics } from "@echo/shared-types";

export type KnowledgeBaseTab =
  | "resources"
  | "graph"
  | "textbooks"
  | "examples"
  | "external"
  | "recycle";

export type ResourceDetailTab =
  | "parse"
  | "overview"
  | "chapters"
  | "points"
  | "index"
  | "citations"
  | "related";

export type KnowledgePointTab =
  | "overview"
  | "related"
  | "students"
  | "exercises"
  | "suggestions"
  | "analysis";

export type KnowledgeEntrySource =
  | "knowledge"
  | "course"
  | "dashboard"
  | "student"
  | "conversation"
  | "ai-review"
  | "source";

export interface KnowledgeResourceView {
  document: CourseDocument;
  chapters: Chapter[];
  knowledgePoints: KnowledgePoint[];
  knowledgePointCount: number;
  kind: string;
  kindTone: "info" | "neutral" | "warning" | "success";
  statusLabel: string;
  statusTone: "info" | "neutral" | "warning" | "success" | "danger";
}

export interface KnowledgePointContext {
  point: KnowledgePoint;
  chapter: Chapter;
  chapters: Chapter[];
  courseId: string;
  courseName: string;
  sourceDocument: CourseDocument | null;
  analytics: KnowledgePointAnalytics | null;
  relatedPoints: KnowledgePoint[];
  previousPoint: KnowledgePoint | null;
  nextPoint: KnowledgePoint | null;
}

export interface SourceEvidence {
  chunk_id: string;
  document_id: string;
  page_start: number;
  page_end: number;
  content: string;
  distance: number;
}

export interface KnowledgePageParams {
  from?: string;
  courseId?: string;
  resourceId?: string;
  page?: string;
  chunkId?: string;
  knowledgePointId?: string;
  messageId?: string;
  tab?: string;
  studentId?: string;
}
