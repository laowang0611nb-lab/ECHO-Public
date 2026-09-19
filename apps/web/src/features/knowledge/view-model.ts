import type { Chapter, Course, CourseDocument } from "@echo/shared-types";

import type { KnowledgeResourceView } from "@/features/knowledge/types";

export function inferResourceKind(document: CourseDocument) {
  const labels: Record<CourseDocument["resource_type"], string> = {
    textbook: "教材文档",
    outline: "教学大纲",
    question_bank: "题库",
    code_example: "代码示例",
    lab: "实验资料",
    external_link: "外部链接",
  };
  if (document.resource_type && document.resource_type in labels) {
    return labels[document.resource_type];
  }
  const name = document.original_name.toLowerCase();
  if (name.includes("大纲")) return "教学大纲";
  if (name.includes("题") || name.includes("exam") || name.includes("quiz")) return "题库";
  if (name.includes("案例") || name.includes("case")) return "案例";
  if (name.includes("课件") || name.includes("slide") || name.includes("ppt")) return "课件";
  return "教材文档";
}

export function resourceStatus(document: CourseDocument) {
  const labels = {
    uploaded: "待解析",
    parsing: "解析中",
    ready: "已解析",
    failed: "解析失败",
  } as const;
  const tones = {
    uploaded: "warning",
    parsing: "info",
    ready: "success",
    failed: "danger",
  } as const;
  return { label: labels[document.status], tone: tones[document.status] };
}

export function buildResourceView(document: CourseDocument, chapters: Chapter[]): KnowledgeResourceView {
  const documentChapters = chapters.filter((chapter) => chapter.document_id === document.id);
  const knowledgePoints = documentChapters.flatMap((chapter) => chapter.knowledge_points);
  const status = resourceStatus(document);

  return {
    document,
    chapters: documentChapters,
    knowledgePoints,
    knowledgePointCount: knowledgePoints.length,
    kind: inferResourceKind(document),
    kindTone: "info",
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

export function summarizeKnowledgeBase(resources: KnowledgeResourceView[]) {
  return {
    total: resources.length,
    ready: resources.filter((resource) => resource.document.status === "ready").length,
    processing: resources.filter((resource) => resource.document.status === "parsing").length,
    pending: resources.filter((resource) => resource.document.status === "uploaded").length,
    failed: resources.filter((resource) => resource.document.status === "failed").length,
    chapters: resources.reduce((total, resource) => total + resource.chapters.length, 0),
    knowledgePoints: resources.reduce((total, resource) => total + resource.knowledgePointCount, 0),
  };
}

export function resourcePageCount(document: CourseDocument) {
  return document.page_count ?? 0;
}

export function buildPointHref(
  pointId: string,
  options: { from?: string; courseId?: string; resourceId?: string; tab?: string; studentId?: string; reviewId?: string; conversationId?: string; messageId?: string } = {},
) {
  const params = new URLSearchParams();
  params.set("from", options.from || "knowledge");
  if (options.courseId) params.set("courseId", options.courseId);
  if (options.resourceId) params.set("resourceId", options.resourceId);
  if (options.tab) params.set("tab", options.tab);
  if (options.studentId) params.set("studentId", options.studentId);
  if (options.reviewId) params.set("reviewId", options.reviewId);
  if (options.conversationId) params.set("conversationId", options.conversationId);
  if (options.messageId) params.set("messageId", options.messageId);
  return `/knowledge/points/${pointId}?${params.toString()}`;
}

export function buildResourceHref(
  resourceId: string,
  options: { from?: string; courseId?: string; tab?: string } = {},
) {
  const params = new URLSearchParams();
  params.set("from", options.from || "knowledge");
  if (options.courseId) params.set("courseId", options.courseId);
  if (options.tab) params.set("tab", options.tab);
  return `/knowledge/resources/${resourceId}?${params.toString()}`;
}

export function buildSourceHref(
  resourceId: string,
  options: {
    from?: string;
    courseId?: string;
    knowledgePointId?: string;
    page?: number;
    chunkId?: string;
    conversationId?: string;
    messageId?: string;
    reviewId?: string;
  } = {},
) {
  const params = new URLSearchParams();
  params.set("from", options.from || "resource");
  if (options.courseId) params.set("courseId", options.courseId);
  if (options.reviewId) params.set("reviewId", options.reviewId);
  if (options.knowledgePointId) params.set("knowledgePointId", options.knowledgePointId);
  if (options.page) params.set("page", String(options.page));
  if (options.chunkId) params.set("chunkId", options.chunkId);
  if (options.conversationId) params.set("conversationId", options.conversationId);
  if (options.messageId) params.set("messageId", options.messageId);
  return `/knowledge/resources/${resourceId}/source?${params.toString()}`;
}

export function resourceTitle(course: Course | null, resources: KnowledgeResourceView[]) {
  const ready = resources.filter((resource) => resource.document.status === "ready").length;
  return course ? `${course.name} · ${ready}/${resources.length} 已解析` : "未选择课程";
}
