import type { KnowledgeGraph } from "@echo/shared-types";

export type GraphSemanticRelation = "prerequisite" | "related";

export type GraphDisplayRelation = GraphSemanticRelation | "peripheral";

export interface GraphViewport {
  width: number;
  height: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface GraphChapterRecord {
  id: string;
  title: string;
  order: number;
}

export interface GraphPointRecord {
  id: string;
  label: string;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrder: number;
  orderIndex: number;
  semanticDegree: number;
}

export interface GraphSemanticEdge {
  id: string;
  source: string;
  target: string;
  type: GraphSemanticRelation;
  rawType: string;
  weight: number;
  evidenceCount: number;
}

export interface GraphAdjacency {
  neighborId: string;
  relation: GraphSemanticRelation;
  edgeId: string;
}

export interface GraphSourceModel {
  graph: KnowledgeGraph;
  points: GraphPointRecord[];
  pointById: ReadonlyMap<string, GraphPointRecord>;
  semanticEdges: GraphSemanticEdge[];
  adjacency: ReadonlyMap<string, GraphAdjacency[]>;
  chapters: GraphChapterRecord[];
  defaultFocusId: string | null;
}

export interface GraphDisplayNode extends GraphPointRecord {
  depth: number;
  displayParentId: string | null;
  displayRelation: GraphDisplayRelation | null;
  displayEdgeId: string | null;
  siblingIndex: number;
  branchId: string;
  baseAngle: number;
  radialBand: number;
  isFocus: boolean;
  isConnected: boolean;
}

export interface GraphDisplayEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphDisplayRelation;
  semanticEdgeId: string | null;
  isDisplayOnly: boolean;
}

export type GraphRiskLevel = "normal" | "elevated" | "medium" | "high" | "unknown";
export type KnowledgeGraphMode = "focused" | "focusing" | "free" | "paused";
export type KnowledgeGraphFilter = "all" | "high-risk";

export interface GraphPointRecord {
  chapterDocumentId: string | null;
  evidenceCount: number;
}

export interface GraphChapterRecord {
  documentId: string | null;
}

export interface GraphSourceModel {
  indexedChapters: GraphChapterRecord[];
}

export interface GraphDisplayNode {
  subtreeSize: number;
}

export interface GraphControllerCallbacks {
  onNodeHover: (id: string | null, client?: GraphPoint) => void;
  onModeChange?: (mode: KnowledgeGraphMode) => void;
}

export interface GraphControllerOptions {
  container: HTMLElement;
  source: GraphSourceModel;
  focusId: string;
  viewport: GraphViewport;
  riskById: ReadonlyMap<string, GraphRiskLevel>;
  reducedMotion: boolean;
  callbacks: GraphControllerCallbacks;
}

export interface GraphNodeMeta {
  kind: "knowledge-point";
  pointId: string;
  evidenceCount: number;
  risk: GraphRiskLevel;
}

export interface GraphEdgeMeta {
  kind: "display" | "semantic";
  weight: number;
  evidenceCount: number;
}

export interface GraphHoverState {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface CourseKnowledgeRiskSummary {
  knowledgePointId: string;
  name: string;
  averageScore: number;
  affectedStudents: number;
}

export interface GraphDisplayModel {
  focusId: string | null;
  nodes: GraphDisplayNode[];
  nodeById: ReadonlyMap<string, GraphDisplayNode>;
  edges: GraphDisplayEdge[];
  semanticEdges: GraphSemanticEdge[];
  representedCount: number;
  mainComponentSize: number;
  disconnectedCount: number;
  componentCount: number;
  hasSemanticEdges: boolean;
}

export interface GraphLayoutNode extends GraphDisplayNode {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface GraphLayoutModel {
  nodes: GraphLayoutNode[];
  nodeById: ReadonlyMap<string, GraphLayoutNode>;
  bounds: GraphBounds;
  viewport: GraphViewport;
  scale: number;
}

export interface GraphControllerCallbacks {
  onNodeClick: (id: string) => void;
  onBackgroundClick: () => void;
  onZoomChange?: (zoom: number) => void;
  onRenderError?: (error: unknown) => void;
}

export type GraphLabelLevel = "focus" | "medium" | "near";

export interface GraphNodeMeta {
  type: "knowledge_point";
  label: string;
  chapterId: string | null;
  chapterTitle: string | null;
  depth: number;
  semanticDegree: number;
  displayRelation: GraphDisplayRelation | null;
  isFocus: boolean;
  isConnected: boolean;
}

export interface GraphEdgeMeta {
  relation: GraphDisplayRelation;
  semanticEdgeId: string | null;
  isDisplayOnly: boolean;
}
