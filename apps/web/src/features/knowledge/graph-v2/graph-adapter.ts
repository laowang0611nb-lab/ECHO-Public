import type { Chapter, KnowledgeGraph, KnowledgeGraphEdge, KnowledgeGraphNode } from "@echo/shared-types";

import type {
  GraphAdjacency,
  GraphChapterRecord,
  GraphDisplayEdge,
  GraphDisplayModel,
  GraphDisplayNode,
  GraphDisplayRelation,
  GraphPointRecord,
  GraphSemanticEdge,
  GraphSemanticRelation,
  GraphSourceModel,
} from "./graph-types";

const EMPTY_RELATION_ALIASES: Record<string, GraphSemanticRelation> = {
  prerequisite: "prerequisite",
  prerequisite_of: "prerequisite",
  related: "related",
  related_to: "related",
  applied_in: "related",
};

function stableCompare(left: string, right: string) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(value: string, salt = 0) {
  return ((hashString(`${salt}:${value}`) % 10000) + 1) / 10001;
}

function normalizeRelation(rawRelation: unknown): GraphSemanticRelation {
  const raw = String(rawRelation || "").trim().toLowerCase();
  return EMPTY_RELATION_ALIASES[raw] ?? "related";
}

function isKnowledgePoint(node: KnowledgeGraphNode): node is KnowledgeGraphNode & { type: "knowledge_point" } {
  return node.type === "knowledge_point";
}

function isKnowledgePointEdge(
  edge: KnowledgeGraphEdge,
  pointIds: ReadonlySet<string>,
): edge is KnowledgeGraphEdge & { source: string; target: string } {
  const normalized = normalizeRelation(edge.type);
  return (
    (normalized === "prerequisite" || normalized === "related") &&
    pointIds.has(edge.source) &&
    pointIds.has(edge.target) &&
    edge.source !== edge.target
  );
}

function sortPointRecords(left: GraphPointRecord, right: GraphPointRecord) {
  return (
    left.chapterOrder - right.chapterOrder ||
    left.orderIndex - right.orderIndex ||
    stableCompare(left.label, right.label) ||
    stableCompare(left.id, right.id)
  );
}

function sortAdjacency(
  left: GraphAdjacency,
  right: GraphAdjacency,
  pointById: ReadonlyMap<string, GraphPointRecord>,
) {
  const leftPoint = pointById.get(left.neighborId);
  const rightPoint = pointById.get(right.neighborId);
  const leftRelation = left.relation === "prerequisite" ? 0 : 1;
  const rightRelation = right.relation === "prerequisite" ? 0 : 1;
  return (
    leftRelation - rightRelation ||
    (leftPoint?.chapterOrder ?? Number.MAX_SAFE_INTEGER) - (rightPoint?.chapterOrder ?? Number.MAX_SAFE_INTEGER) ||
    (leftPoint?.orderIndex ?? Number.MAX_SAFE_INTEGER) - (rightPoint?.orderIndex ?? Number.MAX_SAFE_INTEGER) ||
    stableCompare(leftPoint?.label ?? "", rightPoint?.label ?? "") ||
    stableCompare(left.neighborId, right.neighborId)
  );
}

function chapterRecordsFrom(chapters: Chapter[], graph: KnowledgeGraph) {
  const records: GraphChapterRecord[] = chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    order: chapter.order_index ?? index,
    documentId: chapter.document_id,
  }));
  const known = new Set(records.map((chapter) => chapter.id));
  for (const node of graph.nodes) {
    if (node.type !== "chapter" || known.has(node.id)) {
      continue;
    }
    records.push({
      id: node.id,
      title: node.label,
      order: records.length,
      documentId: typeof node.metadata.document_id === "string" ? node.metadata.document_id : null,
    });
  }
  return records.sort((left, right) => left.order - right.order || stableCompare(left.id, right.id));
}

function pointRecordsFrom(graph: KnowledgeGraph, chapters: Chapter[]) {
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const chapterRecords = chapterRecordsFrom(chapters, graph);
  const chapterRecordMap = new Map(chapterRecords.map((chapter) => [chapter.id, chapter]));
  const orderMap = new Map<string, { chapterOrder: number; orderIndex: number }>();
  chapters.forEach((chapter, chapterIndex) => {
    chapter.knowledge_points.forEach((point, pointIndex) => {
      orderMap.set(point.id, {
        chapterOrder: chapter.order_index ?? chapterIndex,
        orderIndex: point.order_index ?? pointIndex,
      });
    });
  });

  return graph.nodes
    .filter(isKnowledgePoint)
    .map((node, index): GraphPointRecord => {
      const chapter = node.parent_id ? chapterMap.get(node.parent_id) : undefined;
      const chapterRecord = node.parent_id ? chapterRecordMap.get(node.parent_id) : undefined;
      const order = orderMap.get(node.id);
      const graphOrder = graph.nodes.findIndex((candidate) => candidate.id === node.parent_id);
      return {
        id: node.id,
        label: node.label.trim() || node.id.slice(0, 8),
        chapterId: node.parent_id ?? chapter?.id ?? null,
        chapterTitle: chapter?.title ?? chapterRecord?.title ?? null,
        chapterOrder: order?.chapterOrder ?? chapterRecord?.order ?? (graphOrder >= 0 ? graphOrder : index),
        chapterDocumentId: chapter?.document_id ?? chapterRecord?.documentId ?? null,
        orderIndex: order?.orderIndex ?? (typeof node.metadata.order_index === "number" ? node.metadata.order_index : index),
        semanticDegree: 0,
        evidenceCount: 0,
      };
    })
    .sort(sortPointRecords);
}

function semanticEdgesFrom(graph: KnowledgeGraph, pointIds: ReadonlySet<string>) {
  const seen = new Set<string>();
  const edges: GraphSemanticEdge[] = [];
  for (const edge of graph.edges) {
    if (!isKnowledgePointEdge(edge, pointIds)) {
      continue;
    }
    const relation = normalizeRelation(edge.type);
    const signature = `${relation}:${edge.source}:${edge.target}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: relation,
      rawType: String(edge.type),
      weight: Number.isFinite(edge.weight) ? edge.weight : 1,
      evidenceCount: Number.isFinite(edge.evidence_count) ? edge.evidence_count : 0,
    });
  }
  return edges.sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target) ||
      left.id.localeCompare(right.id),
  );
}

function buildAdjacency(edges: GraphSemanticEdge[]) {
  const adjacency = new Map<string, GraphAdjacency[]>();
  for (const edge of edges) {
    const forward = adjacency.get(edge.source) ?? [];
    forward.push({ neighborId: edge.target, relation: edge.type, edgeId: edge.id });
    adjacency.set(edge.source, forward);

    const reverse = adjacency.get(edge.target) ?? [];
    reverse.push({ neighborId: edge.source, relation: edge.type, edgeId: edge.id });
    adjacency.set(edge.target, reverse);
  }
  return adjacency;
}

function computeSemanticMetrics(points: GraphPointRecord[], edges: GraphSemanticEdge[]) {
  const degree = new Map<string, number>();
  const evidence = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    evidence.set(edge.source, (evidence.get(edge.source) ?? 0) + edge.evidenceCount);
    evidence.set(edge.target, (evidence.get(edge.target) ?? 0) + edge.evidenceCount);
  }
  for (const point of points) {
    point.semanticDegree = degree.get(point.id) ?? 0;
    point.evidenceCount = evidence.get(point.id) ?? 0;
  }
}

function resolveDefaultFocus(points: GraphPointRecord[]) {
  if (!points.length) {
    return null;
  }
  return (
    [...points].sort(
      (left, right) =>
        right.semanticDegree - left.semanticDegree ||
        left.chapterOrder - right.chapterOrder ||
        left.orderIndex - right.orderIndex ||
        stableCompare(left.label, right.label) ||
        stableCompare(left.id, right.id),
    )[0]?.id ?? null
  );
}

export function buildGraphSource(graph: KnowledgeGraph, chapters: Chapter[] = []): GraphSourceModel {
  const points = pointRecordsFrom(graph, chapters);
  const pointById = new Map(points.map((point) => [point.id, point]));
  const semanticEdges = semanticEdgesFrom(graph, new Set(pointById.keys()));
  computeSemanticMetrics(points, semanticEdges);
  const adjacency = buildAdjacency(semanticEdges);
  const chapterMap = chapterRecordsFrom(chapters, graph);

  return {
    graph,
    points,
    pointById,
    semanticEdges,
    adjacency,
    chapters: chapterMap,
    indexedChapters: chapterMap,
    defaultFocusId: resolveDefaultFocus(points),
  };
}

function componentNodes(source: GraphSourceModel) {
  const unvisited = new Set(source.pointById.keys());
  const components: string[][] = [];
  while (unvisited.size) {
    const start = [...unvisited].sort(stableCompare)[0];
    const queue = [start];
    const component: string[] = [];
    unvisited.delete(start);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      const neighbors = [...(source.adjacency.get(current) ?? [])]
        .map((item) => item.neighborId)
        .filter((id) => unvisited.has(id))
        .sort(stableCompare);
      for (const neighbor of neighbors) {
        unvisited.delete(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function buildChildren(
  source: GraphSourceModel,
  focusId: string,
  fallbackRelations: Map<string, GraphDisplayRelation>,
) {
  const children = new Map<string, string[]>();
  const nodeById = new Map<string, GraphDisplayNode>();
  const visited = new Set<string>();
  const queue: string[] = [focusId];
  visited.add(focusId);

  const focusPoint = source.pointById.get(focusId);
  if (focusPoint) {
    nodeById.set(focusId, {
      ...focusPoint,
      depth: 0,
      displayParentId: null,
      displayRelation: null,
      displayEdgeId: null,
      siblingIndex: 0,
      subtreeSize: 1,
      branchId: "root",
      baseAngle: -Math.PI / 2,
      radialBand: 0,
      isFocus: true,
      isConnected: true,
    });
  }

  while (queue.length) {
    const currentId = queue.shift()!;
    const current = nodeById.get(currentId);
    if (!current) {
      continue;
    }
    const candidates = [...(source.adjacency.get(currentId) ?? [])].sort((left, right) =>
      sortAdjacency(left, right, source.pointById),
    );
    const unvisitedCandidates = candidates.filter((item) => !visited.has(item.neighborId));
    const chapterFirst = unvisitedCandidates.sort((left, right) => {
      const leftPoint = source.pointById.get(left.neighborId);
      const rightPoint = source.pointById.get(right.neighborId);
      const leftSameChapter = leftPoint?.chapterId === current.chapterId ? 0 : 1;
      const rightSameChapter = rightPoint?.chapterId === current.chapterId ? 0 : 1;
      const relationPriority = (relation: GraphSemanticRelation) => (relation === "prerequisite" ? 0 : 1);
      return (
        leftSameChapter - rightSameChapter ||
        relationPriority(left.relation) - relationPriority(right.relation) ||
        stableCompare(left.neighborId, right.neighborId)
      );
    });
    const selected = chapterFirst.length ? chapterFirst : unvisitedCandidates;
    for (const item of selected) {
      if (visited.has(item.neighborId)) {
        continue;
      }
      const point = source.pointById.get(item.neighborId);
      if (!point) {
        continue;
      }
      visited.add(item.neighborId);
      const relation: GraphDisplayRelation = fallbackRelations.get(item.neighborId) ?? item.relation;
      nodeById.set(item.neighborId, {
        ...point,
        depth: current.depth + 1,
        displayParentId: currentId,
        displayRelation: relation,
        displayEdgeId: null,
        siblingIndex: (children.get(currentId)?.length ?? 0),
        subtreeSize: 1,
        branchId: currentId === focusId ? item.neighborId : current.branchId,
        baseAngle: 0,
        radialBand: current.depth + 1,
        isFocus: false,
        isConnected: true,
      });
      const siblings = children.get(currentId) ?? [];
      siblings.push(item.neighborId);
      children.set(currentId, siblings);
      queue.push(item.neighborId);
    }
  }
  return { children, nodeById, visited };
}

function assignSubtreeSizes(children: Map<string, string[]>, nodes: Map<string, GraphDisplayNode>) {
  const visit = (id: string): number => {
    const childIds = children.get(id) ?? [];
    let size = 1;
    for (const childId of childIds) {
      size += visit(childId);
    }
    const node = nodes.get(id);
    if (node) {
      node.subtreeSize = size;
    }
    return size;
  };
  const roots = [...nodes.values()].filter((node) => node.displayParentId === null);
  for (const root of roots) {
    visit(root.id);
  }
}

function assignAngles(
  focusId: string,
  children: Map<string, string[]>,
  nodes: Map<string, GraphDisplayNode>,
) {
  const assign = (parentId: string, startAngle: number, endAngle: number) => {
    const childIds = children.get(parentId) ?? [];
    if (!childIds.length) {
      return;
    }
    const total = childIds.reduce((sum, childId) => sum + (nodes.get(childId)?.subtreeSize ?? 1), 0);
    let cursor = startAngle;
    for (const childId of childIds) {
      const child = nodes.get(childId);
      if (!child) {
        continue;
      }
      const span = ((endAngle - startAngle) * (child.subtreeSize || 1)) / total;
      const center = cursor + span / 2;
      child.baseAngle = center;
      assign(childId, cursor + span * 0.08, cursor + span * 0.92);
      cursor += span;
    }
  };
  assign(focusId, -Math.PI / 2, (Math.PI * 3) / 2);
}

export function buildGraphDisplay(source: GraphSourceModel, requestedFocusId?: string | null): GraphDisplayModel {
  const focusId = requestedFocusId && source.pointById.has(requestedFocusId)
    ? requestedFocusId
    : source.defaultFocusId;
  if (!focusId) {
    return {
      focusId: null,
      nodes: [],
      nodeById: new Map(),
      edges: [],
      semanticEdges: source.semanticEdges,
      representedCount: 0,
      mainComponentSize: 0,
      disconnectedCount: 0,
      componentCount: 0,
      hasSemanticEdges: false,
    };
  }

  const components = componentNodes(source);
  const mainComponent = components.find((component) => component.includes(focusId)) ?? [focusId];
  const fallbackRelations = new Map<string, GraphDisplayRelation>();
  for (const component of components) {
    if (component === mainComponent) {
      continue;
    }
    const root = [...component].sort((left, right) => {
      const leftPoint = source.pointById.get(left);
      const rightPoint = source.pointById.get(right);
      return (
        (rightPoint?.semanticDegree ?? 0) - (leftPoint?.semanticDegree ?? 0) ||
        (leftPoint && rightPoint ? sortPointRecords(leftPoint, rightPoint) : stableCompare(left, right))
      );
    })[0];
    fallbackRelations.set(root, "peripheral");
  }

  const { children, nodeById } = buildChildren(source, focusId, fallbackRelations);
  const detachedIds =
    source.graph.scope === "chapter"
      ? [...source.pointById.keys()]
          .filter((id) => !nodeById.has(id))
          .sort(stableCompare)
      : [];
  for (const rootId of detachedIds) {
    const point = source.pointById.get(rootId);
    if (!point) {
      continue;
    }
    const root: GraphDisplayNode = {
      ...point,
      depth: 1,
      displayParentId: focusId,
      displayRelation: "peripheral",
      displayEdgeId: null,
      siblingIndex: children.get(focusId)?.length ?? 0,
      subtreeSize: 1,
      branchId: rootId,
      baseAngle: 0,
      radialBand: 1,
      isFocus: false,
      isConnected: false,
    };
    nodeById.set(rootId, root);
    const siblings = children.get(focusId) ?? [];
    siblings.push(rootId);
    children.set(focusId, siblings);
  }

  assignSubtreeSizes(children, nodeById);
  assignAngles(focusId, children, nodeById);

  const edges: GraphDisplayEdge[] = [];
  for (const node of nodeById.values()) {
    if (!node.displayParentId) {
      continue;
    }
    const edgeId = `display:${node.displayParentId}:${node.id}`;
    node.displayEdgeId = edgeId;
    const semanticEdgeId = (source.adjacency.get(node.displayParentId) ?? []).find(
      (item) => item.neighborId === node.id,
    )?.edgeId ?? null;
    edges.push({
      id: edgeId,
      source: node.displayParentId,
      target: node.id,
      relation: node.displayRelation ?? "related",
      semanticEdgeId: node.displayRelation === "peripheral" ? null : semanticEdgeId,
      isDisplayOnly: node.displayRelation === "peripheral",
    });
  }

  const nodes = [...nodeById.values()].sort(
    (left, right) =>
      left.depth - right.depth ||
      left.baseAngle - right.baseAngle ||
      sortPointRecords(left, right),
  );

  return {
    focusId,
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    semanticEdges: source.semanticEdges,
    representedCount: nodes.length,
    mainComponentSize: mainComponent.length,
    disconnectedCount: nodes.filter((node) => !node.isConnected).length,
    componentCount: components.length,
    hasSemanticEdges: source.semanticEdges.length > 0,
  };
}

export function graphSeed(value: string, salt = 0) {
  return deterministicUnit(value, salt);
}

// Re-root the EXISTING display tree metadata (depth / parent / branch / focus)
// onto a new visual focus without choosing a new spanning tree, changing the
// undirected display-edge set, or touching any node position or angle.
export function rerootDisplayMetadata(
  display: GraphDisplayModel,
  requestedFocusId: string,
): GraphDisplayModel {
  const focusId = display.nodeById.has(requestedFocusId) ? requestedFocusId : display.focusId;
  if (!focusId || focusId === display.focusId) {
    return display;
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of display.edges) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push(edge.target);
    adjacency.set(edge.source, outgoing);
    const incoming = adjacency.get(edge.target) ?? [];
    incoming.push(edge.source);
    adjacency.set(edge.target, incoming);
  }
  const depth = new Map<string, number>([[focusId, 0]]);
  const parent = new Map<string, string | null>([[focusId, null]]);
  const branch = new Map<string, string>([[focusId, "root"]]);
  const children = new Map<string, string[]>();
  const queue: string[] = [focusId];
  while (queue.length) {
    const currentId = queue.shift()!;
    const neighbors = [...(adjacency.get(currentId) ?? [])].sort(stableCompare);
    const childIds = children.get(currentId) ?? [];
    for (const neighborId of neighbors) {
      if (depth.has(neighborId)) {
        continue;
      }
      depth.set(neighborId, (depth.get(currentId) ?? 0) + 1);
      parent.set(neighborId, currentId);
      branch.set(neighborId, currentId === focusId ? neighborId : branch.get(currentId) ?? neighborId);
      childIds.push(neighborId);
      queue.push(neighborId);
    }
    children.set(currentId, childIds);
  }
  const nodes = display.nodes.map((node) => {
    const nextDepth = depth.get(node.id);
    if (nextDepth === undefined) {
      return node;
    }
    return {
      ...node,
      depth: nextDepth,
      displayParentId: parent.get(node.id) ?? null,
      branchId: branch.get(node.id) ?? node.branchId,
      radialBand: nextDepth,
      siblingIndex: 0,
      subtreeSize: 1,
      baseAngle: 0,
      isFocus: node.id === focusId,
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const childIds of children.values()) {
    childIds.forEach((childId, index) => {
      const child = nodeById.get(childId);
      if (child) child.siblingIndex = index;
    });
  }
  assignSubtreeSizes(children, nodeById);
  assignAngles(focusId, children, nodeById);
  return {
    ...display,
    focusId,
    nodes,
    nodeById,
  };
}

export function graphClamp(value: number, min: number, max: number) {
  return clamp(value, min, max);
}
