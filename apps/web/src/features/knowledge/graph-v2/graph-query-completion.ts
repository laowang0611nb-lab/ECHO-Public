import type {
  Chapter,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@echo/shared-types";

export const MAX_GRAPH_POINT_COMPLETION_REQUESTS = 64;

export interface GraphPointCoverage {
  expected: number;
  returned: number;
  missing: number;
  missingPointIds: string[];
}

export function expectedCourseGraphPointIds(
  chapters: Chapter[],
  resourceId: string | null,
) {
  const selectedChapters = resourceId
    ? chapters.filter((chapter) => chapter.document_id === resourceId)
    : chapters;
  return new Set(
    selectedChapters.flatMap((chapter) =>
      chapter.knowledge_points.map((point) => point.id),
    ),
  );
}

export function graphPointCoverage(
  graph: KnowledgeGraph | undefined,
  chapters: Chapter[],
  resourceId: string | null,
): GraphPointCoverage {
  const expectedPointIds = expectedCourseGraphPointIds(chapters, resourceId);
  const returnedPointIds = new Set(
    (graph?.nodes ?? [])
      .filter((node) => node.type === "knowledge_point")
      .map((node) => node.id),
  );
  const missingPointIds = [...expectedPointIds].filter(
    (pointId) => !returnedPointIds.has(pointId),
  );
  return {
    expected: expectedPointIds.size,
    returned: expectedPointIds.size - missingPointIds.length,
    missing: missingPointIds.length,
    missingPointIds,
  };
}

export function mergeKnowledgeGraphs(
  base: KnowledgeGraph,
  supplements: Array<KnowledgeGraph | undefined>,
): KnowledgeGraph {
  const nodes = new Map<string, KnowledgeGraphNode>();
  const edges = new Map<string, KnowledgeGraphEdge>();

  for (const node of base.nodes) {
    nodes.set(node.id, node);
  }
  for (const edge of base.edges) {
    edges.set(edge.id, edge);
  }

  for (const supplement of supplements) {
    if (!supplement) continue;
    for (const node of supplement.nodes) {
      if (!nodes.has(node.id)) {
        nodes.set(node.id, node);
      }
    }
    for (const edge of supplement.edges) {
      if (!edges.has(edge.id)) {
        edges.set(edge.id, edge);
      }
    }
  }

  return {
    ...base,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}
