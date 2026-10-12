import type { GraphPointRecord, GraphRiskLevel, GraphSemanticEdge, GraphSourceModel } from "@/features/knowledge/graph-v2/graph-types";

export const RELATIONS_PER_PAGE = 4;
export type FocusRelation = {
  point: GraphPointRecord;
  edges: GraphSemanticEdge[];
  incoming: boolean;
  outgoing: boolean;
  related: boolean;
  label: string;
};
export type NodeBox = { x: number; y: number; width: number; height: number };
export type BranchBox = NodeBox & { portX: number; portY: number; branch: string; direction: string; highlight: string };

export function isRisk(risk: GraphRiskLevel | undefined) {
  return risk === "high" || risk === "medium" || risk === "elevated";
}

/** Every row represents a real direct neighbor. Multiple real edges are retained. */
export function directRelations(source: GraphSourceModel, focusId: string): FocusRelation[] {
  const groups = new Map<string, GraphSemanticEdge[]>();
  for (const edge of source.semanticEdges) {
    if (edge.source !== focusId && edge.target !== focusId) continue;
    const neighborId = edge.source === focusId ? edge.target : edge.source;
    if (neighborId === focusId || !source.pointById.has(neighborId)) continue;
    const edges = groups.get(neighborId) ?? [];
    edges.push(edge);
    groups.set(neighborId, edges);
  }
  return [...groups].map(([id, edges]) => {
    const incoming = edges.some((edge) => edge.type === "prerequisite" && edge.target === focusId);
    const outgoing = edges.some((edge) => edge.type === "prerequisite" && edge.source === focusId);
    const related = edges.some((edge) => edge.type === "related");
    const labels = [incoming ? "前置知识" : "", outgoing ? "后续知识" : "", related ? "知识关联" : ""].filter(Boolean);
    return { point: source.pointById.get(id)!, edges, incoming, outgoing, related, label: labels.join(" · ") };
  }).sort((a, b) =>
    Number(b.incoming) - Number(a.incoming) || Number(b.outgoing) - Number(a.outgoing)
    || a.point.chapterOrder - b.point.chapterOrder || a.point.orderIndex - b.point.orderIndex
    || a.point.id.localeCompare(b.point.id, "zh-CN", { numeric: true }),
  );
}

/** Pixel geometry shared by SVG connectors and HTML nodes; no percentage/SVG mismatch. */
export function layoutBranches(width: number, height: number, count: number) {
  const middle = width / 2;
  const padding = 10;
  const rootWidth = Math.min(184, width - 40);
  const root: NodeBox = { x: middle - rootWidth / 2, y: 12, width: rootWidth, height: 56 };
  const bottom = root.y + root.height;
  const leafHeight = 52;
  const rows = Math.ceil(count / 2);
  const firstY = count <= 2 ? Math.min(height - 48, bottom + 68) : bottom + 50;
  const lastY = Math.max(firstY, height - padding - leafHeight / 2);
  const leafWidth = Math.min(166, (width - padding * 2 - 36) / 2);
  const leaves: BranchBox[] = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / 2);
    const cy = rows <= 1 ? firstY : firstY + row * (lastY - firstY) / (rows - 1);
    const single = count === 1;
    const left = i % 2 === 0;
    const x = single ? middle - leafWidth / 2 : left ? middle - 18 - leafWidth : middle + 18;
    const y = cy - leafHeight / 2;
    const portX = single ? middle : left ? x + leafWidth : x;
    const portY = single ? y : cy;
    const end = left ? -1 : 1;
    return {
      x, y, width: leafWidth, height: leafHeight, portX, portY,
      branch: single ? `M ${middle} ${bottom} V ${y}` : `M ${middle} ${cy} H ${portX}`,
      // Keep arrowheads clear of the junction and the node's connection port.
      direction: single ? `M ${middle} ${bottom + 5} V ${y - 4}` : `M ${middle + end * 5} ${cy} H ${portX - end * 4}`,
      highlight: single ? `M ${middle} ${bottom} V ${y}` : `M ${middle} ${bottom} V ${cy - 7} Q ${middle} ${cy} ${middle + end * 7} ${cy} H ${portX}`,
    };
  });
  const spine = count > 1 ? `M ${middle} ${bottom} V ${leaves[leaves.length - 1].portY}` : "";
  return { root, leaves, spine, middle };
}
