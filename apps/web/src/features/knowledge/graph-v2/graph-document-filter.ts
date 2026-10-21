import type { Chapter, KnowledgeGraph, KnowledgeGraphNode } from "@echo/shared-types";

export interface CourseGraphFilter {
  resourceId: string | null;
  chapterId: string | null;
}

export interface ResolvedCourseGraphFilter extends CourseGraphFilter {
  invalidResourceId: boolean;
  invalidChapterId: boolean;
}

export interface FilteredCourseGraph {
  graph: KnowledgeGraph;
  chapters: Chapter[];
  selectedChapterIds: ReadonlySet<string>;
  selectedPointIds: ReadonlySet<string>;
}

export function resolveCourseGraphFilter(
  chapters: Chapter[],
  raw: CourseGraphFilter,
  availableResourceIds: ReadonlySet<string> = new Set(),
): ResolvedCourseGraphFilter {
  if (raw.chapterId) {
    const chapter = chapters.find((item) => item.id === raw.chapterId);
    if (chapter) {
      return {
        resourceId: chapter.document_id,
        chapterId: chapter.id,
        invalidResourceId: Boolean(
          raw.resourceId && raw.resourceId !== chapter.document_id,
        ),
        invalidChapterId: false,
      };
    }
    return {
      resourceId: null,
      chapterId: null,
      invalidResourceId: false,
      invalidChapterId: true,
    };
  }

  if (raw.resourceId) {
    const resourceExists =
      availableResourceIds.has(raw.resourceId) ||
      chapters.some((chapter) => chapter.document_id === raw.resourceId);
    return {
      resourceId: resourceExists ? raw.resourceId : null,
      chapterId: null,
      invalidResourceId: !resourceExists,
      invalidChapterId: false,
    };
  }

  return {
    resourceId: null,
    chapterId: null,
    invalidResourceId: false,
    invalidChapterId: false,
  };
}

export function pointMatchesCourseGraphFilter(
  pointId: string | null,
  chapters: Chapter[],
  filter: CourseGraphFilter,
) {
  if (!pointId) {
    return true;
  }
  const chapter = chapters.find((item) =>
    item.knowledge_points.some((point) => point.id === pointId),
  );
  if (!chapter) {
    return false;
  }
  if (filter.chapterId) {
    return chapter.id === filter.chapterId;
  }
  if (filter.resourceId) {
    return chapter.document_id === filter.resourceId;
  }
  return true;
}

function isKnowledgePointNode(
  node: KnowledgeGraphNode,
): node is KnowledgeGraphNode & { type: "knowledge_point" } {
  return node.type === "knowledge_point";
}

function nodeDocumentId(node: KnowledgeGraphNode) {
  const metadataDocumentId = node.metadata.document_id;
  return typeof metadataDocumentId === "string" ? metadataDocumentId : null;
}

export function filterCourseKnowledgeGraph(
  graph: KnowledgeGraph,
  chapters: Chapter[],
  filter: CourseGraphFilter,
): FilteredCourseGraph {
  if (!filter.resourceId && !filter.chapterId) {
    return {
      graph,
      chapters,
      selectedChapterIds: new Set(chapters.map((chapter) => chapter.id)),
      selectedPointIds: new Set(graph.nodes.filter(isKnowledgePointNode).map((node) => node.id)),
    };
  }

  const selectedChapters = chapters.filter((chapter) => {
    if (filter.chapterId) {
      return chapter.id === filter.chapterId;
    }
    return chapter.document_id === filter.resourceId;
  });
  const selectedChapterIds = new Set(
    selectedChapters.map((chapter) => chapter.id),
  );
  const selectedDocumentIds = new Set(
    selectedChapters.map((chapter) => chapter.document_id),
  );
  if (filter.resourceId) {
    selectedDocumentIds.add(filter.resourceId);
  }
  const selectedNodes = new Map<string, KnowledgeGraphNode>();

  for (const node of graph.nodes) {
    if (node.type === "course") {
      selectedNodes.set(node.id, node);
      continue;
    }
    if (node.type === "chapter" && selectedChapterIds.has(node.id)) {
      selectedNodes.set(node.id, node);
      continue;
    }
    if (
      node.type === "knowledge_point" &&
      node.parent_id &&
      selectedChapterIds.has(node.parent_id)
    ) {
      selectedNodes.set(node.id, node);
      continue;
    }
    if (
      node.type === "resource" &&
      (selectedDocumentIds.has(node.id) ||
        selectedDocumentIds.has(nodeDocumentId(node) ?? ""))
    ) {
      selectedNodes.set(node.id, node);
    }
  }

  const selectedPointIds = new Set(
    [...selectedNodes.values()]
      .filter(isKnowledgePointNode)
      .map((node) => node.id),
  );
  const nodes = graph.nodes.filter((node) => selectedNodes.has(node.id));
  const edges = graph.edges.filter(
    (edge) =>
      selectedNodes.has(edge.source) && selectedNodes.has(edge.target),
  );

  return {
    graph: {
      ...graph,
      nodes,
      edges,
    },
    chapters: selectedChapters,
    selectedChapterIds,
    selectedPointIds,
  };
}
