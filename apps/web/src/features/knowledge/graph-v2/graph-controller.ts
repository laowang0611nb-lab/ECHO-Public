import {
  CanvasEvent,
  Graph,
  GraphEvent,
  NodeEvent,
  type EdgeData,
  type GraphData,
  type IElementEvent,
  type NodeData,
} from "@antv/g6";

import { buildGraphDisplay, graphClamp } from "./graph-adapter";
import { layoutGraph, orbitPositions } from "./graph-layout";
import { GRAPH_THEME, riskColor, riskHalo } from "./graph-theme";
import type {
  GraphControllerCallbacks,
  GraphControllerOptions,
  GraphDisplayModel,
  GraphEdgeMeta,
  GraphLayoutModel,
  GraphNodeMeta,
  GraphRiskLevel,
  GraphSourceModel,
  GraphViewport,
  KnowledgeGraphFilter,
  KnowledgeGraphMode,
} from "./graph-types";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ORBIT_PERIOD = 160_000;
const IDLE_RESUME_MS = 2_400;

function truncateLabel(label: string | null | undefined, max = 12) {
  if (!label) {
    return "";
  }
  const characters = Array.from(label);
  return characters.length > max ? `${characters.slice(0, max).join("")}…` : label;
}

function isNodeEvent(event: IElementEvent) {
  return event.targetType === "node" && Boolean(event.target?.id);
}

export class KnowledgeGraphController {
  private readonly container: HTMLElement;
  private readonly callbacks: GraphControllerCallbacks;
  private readonly reducedMotion: boolean;
  private graph: Graph | null = null;
  private source: GraphSourceModel;
  private focusId: string;
  private selectedId: string | null;
  private hoveredId: string | null = null;
  private riskById: ReadonlyMap<string, GraphRiskLevel>;
  private filter: KnowledgeGraphFilter = "all";
  private mode: KnowledgeGraphMode = "focused";
  private viewport: GraphViewport;
  private display: GraphDisplayModel;
  private layout: GraphLayoutModel;
  private orbitAngle = 0;
  private orbitFrame: number | null = null;
  private orbitLastTime = 0;
  private orbitLastPosition = 0;
  private orbitMoving = false;
  private interactionUntil = 0;
  private zoomNoticeAt = 0;
  private zoomCompensation = 1;
  private zoomCompensationTimer: ReturnType<typeof setTimeout> | null = null;
  private visualStateTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionGeneration = 0;
  private destroyed = false;
  private paused = false;
  private pendingResize = false;
  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      this.stopOrbit();
    } else if (this.mode === "focused" && !this.reducedMotion) {
      this.orbitLastTime = performance.now();
      this.startOrbit();
    }
  };

  constructor(options: GraphControllerOptions) {
    this.container = options.container;
    this.source = options.source;
    this.focusId = options.focusId;
    this.selectedId = options.focusId;
    this.riskById = options.riskById;
    this.reducedMotion = options.reducedMotion;
    this.callbacks = options.callbacks;
    this.viewport = options.viewport;
    this.display = this.buildDisplay();
    this.layout = layoutGraph(this.display, this.viewport);
  }

  mount() {
    if (this.graph || this.destroyed) {
      return;
    }
    this.display = this.buildDisplay();
    this.layout = layoutGraph(this.display, this.viewport);
    const data = this.graphData(this.layout, this.display);
    this.graph = new Graph({
      container: this.container,
      width: this.viewport.width,
      height: this.viewport.height,
      animation: {
        duration: this.reducedMotion ? 180 : 780,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      data,
      node: {
        type: "circle",
        style: (datum) => this.nodeStyleFromDatum(datum),
        state: {
          focus: {
            size: 24,
            lineWidth: 3,
            stroke: GRAPH_THEME.primaryStrong,
            halo: true,
            haloStroke: GRAPH_THEME.focusHalo,
            haloLineWidth: 20,
            haloOpacity: 0.74,
            labelFill: GRAPH_THEME.text,
            labelFontWeight: 700,
          },
          hovered: {
            size: 19,
            lineWidth: 2.4,
            stroke: GRAPH_THEME.primaryStrong,
            halo: true,
            haloStroke: GRAPH_THEME.primarySoft,
            haloLineWidth: 14,
            haloOpacity: 0.72,
            labelFill: GRAPH_THEME.text,
            labelFontWeight: 650,
          },
          related: {
            lineWidth: 1.6,
            stroke: GRAPH_THEME.primaryStrong,
          },
          "high-risk": {
            opacity: 1,
            lineWidth: 2.2,
            halo: true,
            haloStroke: riskHalo("high"),
            haloLineWidth: 12,
            haloOpacity: 0.5,
            labelFill: GRAPH_THEME.text,
          },
          dimmed: {
            opacity: 0.36,
            labelFill: GRAPH_THEME.textDim,
          },
          "filter-dimmed": {
            opacity: 0.14,
            fill: GRAPH_THEME.risk.unknown,
            stroke: GRAPH_THEME.risk.unknown,
            labelFill: GRAPH_THEME.textDim,
          },
          "filter-exempt": {
            opacity: 0.92,
          },
          "label-visible": {
            label: true,
          },
          "label-hidden": {
            label: false,
          },
        },
      },
      edge: {
        type: "line",
        style: (datum) => {
          const meta = datum.data as GraphEdgeMeta | undefined;
          return this.edgeDatumStyle(meta?.relation ?? "related", meta?.kind === "semantic");
        },
        state: {
          "edge-focus": {
            opacity: 0.92,
            lineWidth: 1.8,
            stroke: GRAPH_THEME.primaryStrong,
          },
          "edge-related": {
            opacity: 0.48,
            lineWidth: 1.25,
          },
          "edge-dim": {
            opacity: 0.2,
            lineWidth: 0.9,
          },
          "semantic-active": {
            opacity: 0.82,
            lineWidth: 1.7,
          },
          "semantic-hidden": {
            opacity: 0,
            lineWidth: 0,
          },
        },
      },
      behaviors: [
        {
          type: "drag-canvas",
          key: "graph-drag-canvas",
          onFinish: () => this.enterFreeView(),
        },
        {
          type: "zoom-canvas",
          key: "graph-zoom-canvas",
          animation: { duration: this.reducedMotion ? 80 : 180 },
          onFinish: () => this.enterFreeView(),
        },
      ],
    });

    this.graph.on(NodeEvent.CLICK, (event) => {
      const elementEvent = event as IElementEvent;
      if (isNodeEvent(elementEvent)) {
        this.callbacks.onNodeClick(String(elementEvent.target.id));
      }
    });
    this.graph.on(NodeEvent.POINTER_ENTER, (event) => {
      const elementEvent = event as IElementEvent;
      if (!isNodeEvent(elementEvent)) {
        return;
      }
      const id = String(elementEvent.target.id);
      this.hoveredId = id;
      this.touchInteraction();
      const point = elementEvent.client;
      this.callbacks.onNodeHover(id, point ? { x: point.x, y: point.y } : undefined);
      this.scheduleVisualState(0);
    });
    this.graph.on(NodeEvent.POINTER_LEAVE, () => {
      this.hoveredId = null;
      this.callbacks.onNodeHover(null);
      this.touchInteraction();
      this.scheduleVisualState(0);
    });
    this.graph.on(CanvasEvent.CLICK, (event) => {
      if ((event as IElementEvent).targetType === "canvas") {
        this.callbacks.onBackgroundClick();
      }
    });
    this.graph.on(CanvasEvent.POINTER_DOWN, () => this.touchInteraction());
    this.graph.on(CanvasEvent.POINTER_UP, () => this.touchInteraction());
    this.graph.on(GraphEvent.BEFORE_TRANSFORM, () => this.touchInteraction());
    this.graph.on(GraphEvent.AFTER_TRANSFORM, () => {
      const zoom = this.safeZoom();
      if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
        const bounded = graphClamp(zoom, MIN_ZOOM, MAX_ZOOM);
        const graph = this.graph;
        if (graph) {
          void graph.zoomTo(bounded, { duration: this.reducedMotion ? 60 : 140 }).catch((error) => this.reportRenderError(error));
        }
      }
      this.scheduleZoomCompensation();
      this.callbacks.onZoomChange?.(zoom);
    });

    void this.graph.render()
      .then(() => {
        if (this.destroyed) {
          return;
        }
        this.applyVisualState();
        return this.centerCamera(false);
      })
      .then(() => {
        if (!this.destroyed && !this.reducedMotion) {
          this.startOrbit();
        }
      })
      .catch((error: unknown) => {
        this.reportRenderError(error);
      });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private safeZoom() {
    try {
      return this.graph?.getZoom() ?? 1;
    } catch {
      return 1;
    }
  }

  private reportRenderError(error: unknown) {
    if (!this.destroyed) {
      this.callbacks.onRenderError?.(error);
    }
  }

  private isTransitionCurrent(generation: number) {
    return !this.destroyed && generation === this.transitionGeneration && this.graph !== null;
  }

  private buildDisplay(): GraphDisplayModel {
    return buildGraphDisplay(this.source, this.focusId);
  }

  private graphData(layout: GraphLayoutModel, display: GraphDisplayModel): GraphData {
    const zoom = this.safeZoom();
    const nodes: NodeData[] = layout.nodes.map((node) => {
      const risk = this.riskById.get(node.id) ?? "normal";
      const meta: GraphNodeMeta = {
        type: "knowledge_point",
        kind: "knowledge-point",
        pointId: node.id,
        label: node.label,
        chapterId: node.chapterId,
        chapterTitle: node.chapterTitle,
        depth: node.depth,
        semanticDegree: node.semanticDegree,
        evidenceCount: node.evidenceCount,
        displayRelation: node.displayRelation,
        isFocus: node.isFocus,
        isConnected: node.isConnected,
        risk,
      };
      return {
        id: node.id,
        type: "circle",
        data: meta as unknown as Record<string, unknown>,
        style: this.nodeDatumStyle(node, zoom),
      };
    });

    const displayEdges: EdgeData[] = display.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: {
        kind: "display",
        relation: edge.relation,
        semanticEdgeId: edge.semanticEdgeId,
        isDisplayOnly: edge.isDisplayOnly,
        weight: 1,
        evidenceCount: 0,
      } satisfies GraphEdgeMeta as unknown as Record<string, unknown>,
      style: this.edgeDatumStyle(edge.relation, false),
    }));

    const semanticEdges: EdgeData[] = this.source.semanticEdges.map((edge) => ({
      id: `semantic:${edge.id}`,
      source: edge.source,
      target: edge.target,
      data: {
        kind: "semantic",
        relation: edge.type,
        semanticEdgeId: edge.id,
        isDisplayOnly: false,
        weight: edge.weight,
        evidenceCount: edge.evidenceCount,
      } satisfies GraphEdgeMeta as unknown as Record<string, unknown>,
      style: this.edgeDatumStyle(edge.type, true),
    }));

    return { nodes, edges: [...displayEdges, ...semanticEdges] };
  }

  private nodeStyleFromDatum(datum: NodeData) {
    const meta = datum.data as GraphNodeMeta | undefined;
    return this.nodeDatumStyle(
      {
        id: meta?.pointId ?? String(datum.id),
        label: meta?.label ?? "",
        x: Number(datum.style?.x ?? 0),
        y: Number(datum.style?.y ?? 0),
        isFocus: Boolean(meta?.isFocus),
        depth: Number(meta?.depth ?? 0),
      },
      this.safeZoom(),
    );
  }

  private nodeDatumStyle(
    node: Pick<GraphLayoutModel["nodes"][number], "id" | "label" | "x" | "y" | "isFocus" | "depth">,
    zoom = 1,
  ) {
    const risk = this.riskById.get(node.id) ?? "normal";
    const baseSize = node.isFocus ? 22 : node.depth <= 1 ? 14 : node.depth <= 3 ? 11 : 9;
    const labelSize = (node.isFocus ? 15 : node.depth <= 1 ? 12.5 : 12) / zoom;
    const labelWidth = (node.isFocus ? 132 : node.depth <= 1 ? 112 : 96) / zoom;
    return {
      x: node.x,
      y: node.y,
      size: baseSize,
      fill: riskColor(risk),
      stroke: risk === "normal" ? GRAPH_THEME.primaryStrong : riskColor(risk),
      lineWidth: node.isFocus ? 2.6 : 1.2,
      opacity: 1,
      halo: node.isFocus || risk === "high",
      haloStroke: node.isFocus ? GRAPH_THEME.focusHalo : riskHalo(risk),
      haloLineWidth: node.isFocus ? 18 : 10,
      haloOpacity: node.isFocus ? 0.72 : 0.38,
      label: true,
      labelText: truncateLabel(node.label),
      labelPlacement: "bottom" as const,
      labelOffsetY: (node.isFocus ? 18 : 12) / zoom,
      labelFill: node.isFocus ? GRAPH_THEME.text : GRAPH_THEME.textMuted,
      labelFontSize: labelSize,
      labelFontWeight: node.isFocus ? 700 : 540,
      labelWordWrap: true,
      labelMaxWidth: labelWidth,
      labelBackground: node.isFocus,
      labelBackgroundFill: GRAPH_THEME.surfaceStrong,
      labelBackgroundOpacity: 0.76,
      labelPadding: node.isFocus ? [5, 8] : 0,
      cursor: "pointer" as const,
    };
  }

  private edgeDatumStyle(
    relation: GraphDisplayModel["edges"][number]["relation"],
    showDirection = false,
  ) {
    const prerequisite = relation === "prerequisite";
    const peripheral = relation === "peripheral";
    return {
      stroke: prerequisite ? GRAPH_THEME.edgePrerequisite : GRAPH_THEME.edgeRelated,
      lineWidth: prerequisite ? 1.5 : 1,
      opacity: peripheral ? 0.22 : 0.46,
      lineDash: relation === "related" || peripheral ? [5, 6] : [],
      // Display-tree direction is layout-only; semantic reveal edges keep the real direction.
      endArrow: prerequisite && showDirection,
      endArrowSize: prerequisite && showDirection ? 7 : 0,
      cursor: "default" as const,
    };
  }

  setFocus(id: string, force = false) {
    if (!force && id === this.focusId) {
      return;
    }
    if (!this.source.pointById.has(id) || !this.graph) {
      return;
    }
    this.focusId = id;
    this.selectedId = id;
    this.createFocusTransition();
  }

  private createFocusTransition() {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    const generation = ++this.transitionGeneration;
    const previousPositions = new Map<string, [number, number]>();
    for (const node of this.layout.nodes) {
      previousPositions.set(node.id, [node.x, node.y]);
    }
    this.setMode("focusing");
    this.stopOrbit();
    this.display = this.buildDisplay();
    this.layout = layoutGraph(this.display, this.viewport);
    const startNodes = this.layout.nodes.map((node) => {
      const previous = previousPositions.get(node.id) ?? [0, 0];
      return { ...node, x: previous[0], y: previous[1] };
    });
    const targets: Record<string, [number, number]> = {};
    for (const node of this.layout.nodes) {
      targets[node.id] = [node.x, node.y];
    }
    // Render the new tree at the old positions first, then glide every node to its new slot.
    graph.setOptions({ animation: false });
    graph.setData(this.graphData({ ...this.layout, nodes: startNodes }, this.display));
    this.orbitAngle = 0;
    void graph.draw()
      .then(() => {
        if (!this.isTransitionCurrent(generation)) {
          return;
        }
        graph.setOptions({
          animation: { duration: this.reducedMotion ? 160 : 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        });
        const morph = graph.translateElementTo(targets, true).catch((error: unknown) => this.reportRenderError(error));
        return Promise.all([morph, this.centerCamera(true)]);
      })
      .then(() => {
        if (!this.isTransitionCurrent(generation)) {
          return;
        }
        this.applyVisualState(false);
        graph.setOptions({
          animation: { duration: this.reducedMotion ? 180 : 780, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        });
        this.setMode("focused");
        this.interactionUntil = performance.now() + IDLE_RESUME_MS;
        if (!this.reducedMotion) {
          this.startOrbit();
        }
      })
      .catch((error: unknown) => {
        if (!this.isTransitionCurrent(generation)) {
          return;
        }
        this.reportRenderError(error);
        this.setMode("focused");
      });
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.scheduleVisualState(0);
  }

  setRiskMap(riskById: ReadonlyMap<string, GraphRiskLevel>) {
    this.riskById = riskById;
    if (!this.graph) {
      return;
    }
    this.refreshNodeStyles();
    this.applyVisualState();
  }

  setFilter(filter: KnowledgeGraphFilter) {
    this.filter = filter;
    this.applyVisualState();
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    if (paused) {
      this.stopOrbit();
      if (this.visualStateTimer) {
        clearTimeout(this.visualStateTimer);
        this.visualStateTimer = null;
      }
      if (this.zoomCompensationTimer) {
        clearTimeout(this.zoomCompensationTimer);
        this.zoomCompensationTimer = null;
      }
      return;
    }
    if (this.pendingResize) {
      this.pendingResize = false;
      this.applyResize();
    }
    if (this.mode === "focused" && !this.reducedMotion) {
      this.orbitLastTime = performance.now();
      this.startOrbit();
    }
  }

  resize(viewport: GraphViewport) {
    this.viewport = viewport;
    if (!this.graph) {
      return;
    }
    if (this.paused) {
      this.pendingResize = true;
      return;
    }
    this.applyResize();
  }

  private applyResize() {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    const viewport = this.viewport;
    graph.resize(viewport.width, viewport.height);
    this.display = this.buildDisplay();
    this.layout = layoutGraph(this.display, viewport);
    graph.setData(this.graphData(this.layout, this.display));
    this.scaleLabelsForZoom(this.safeZoom());
    void graph.draw()
      .then(() => {
        if (this.destroyed) {
          return;
        }
        if (this.mode === "focused") {
          return this.centerCamera(false);
        }
      })
      .then(() => {
        if (!this.destroyed) {
          this.applyVisualState();
        }
      })
      .catch((error: unknown) => {
        this.reportRenderError(error);
      });
  }

  resetView() {
    if (!this.graph) {
      return;
    }
    this.orbitAngle = 0;
    this.setMode("focused");
    this.setFocus(this.focusId, true);
  }

  async fitView() {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    try {
      this.orbitAngle = 0;
      this.stopOrbit();
      this.setMode("focused");
      this.display = this.buildDisplay();
      this.layout = layoutGraph(this.display, this.viewport);
      graph.setData(this.graphData(this.layout, this.display));
      await graph.draw();
      if (this.destroyed || this.graph !== graph) {
        return;
      }
      this.applyVisualState();
      const { width, height } = this.viewport;
      const sideReserve = width >= 1024 ? 360 : 64;
      const fitWidth = Math.max(240, width - sideReserve);
      const fitHeight = Math.max(240, height - 160);
      const targetZoom = graphClamp(
        Math.min(
          fitWidth / Math.max(this.layout.bounds.width, 1),
          fitHeight / Math.max(this.layout.bounds.height, 1),
        ),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const animation = { duration: this.reducedMotion ? 160 : 620 };
      await graph.zoomTo(targetZoom, animation);
      if (this.destroyed || this.graph !== graph) {
        return;
      }
      await this.centerOnFocus(width >= 1024 ? 0.43 : 0.5, 0.5, animation);
      if (this.destroyed || this.graph !== graph) {
        return;
      }
      this.zoomCompensation = targetZoom;
      this.callbacks.onZoomChange?.(targetZoom);
      this.interactionUntil = performance.now() + IDLE_RESUME_MS;
      if (!this.reducedMotion && this.mode === "focused") {
        this.startOrbit();
      }
    } catch (error: unknown) {
      this.reportRenderError(error);
    }
  }

  private async centerCamera(animate: boolean): Promise<void> {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    const zoom = this.safeZoom();
    const targetZoom = zoom < 0.88 ? 0.96 : graphClamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const animation = animate ? { duration: this.reducedMotion ? 160 : 520 } : false;
    if (targetZoom !== zoom) {
      await graph.zoomTo(targetZoom, animation);
      if (this.destroyed || this.graph !== graph) {
        return;
      }
    }
    const { width } = this.viewport;
    await this.centerOnFocus(width >= 1024 ? 0.43 : 0.5, 0.52, animation);
  }

  private async centerOnFocus(anchorX: number, anchorY: number, animation: boolean | { duration: number }): Promise<void> {
    const graph = this.graph;
    if (!graph) {
      return;
    }
    const { width, height } = this.viewport;
    const [currentX, currentY] = graph.getViewportByCanvas([0, 0]);
    await graph.translateBy([width * anchorX - currentX, height * anchorY - currentY], animation);
  }

  private applyVisualState(animated = true) {
    if (!this.graph) {
      return;
    }
    const zoom = this.safeZoom();
    const activeId = this.hoveredId ?? this.focusId;
    const neighborIds = new Set([
      ...(this.source.adjacency.get(activeId) ?? []).map((item) => item.neighborId),
      ...this.layout.nodes
        .filter((node) => node.displayParentId === activeId || node.id === this.layout.nodeById.get(activeId)?.displayParentId)
        .map((node) => node.id),
    ]);
    const nodeStates: Record<string, string[]> = {};
    const edgeStates: Record<string, string[]> = {};
    for (const node of this.layout.nodes) {
      const risk = this.riskById.get(node.id) ?? "normal";
      const highRiskFiltered = this.filter === "high-risk" && risk !== "high";
      const labelVisible =
        node.id === this.focusId ||
        node.id === this.hoveredId ||
        risk === "high" ||
        (zoom >= 1.22 && (node.depth <= 4 || node.semanticDegree >= 3)) ||
        (zoom >= 1.45 && node.isConnected) ||
        (zoom >= 0.9 && (node.depth <= 2 || node.semanticDegree >= 5));
      const states: string[] = [labelVisible ? "label-visible" : "label-hidden"];
      if (node.id === this.focusId) {
        states.push(highRiskFiltered ? "filter-exempt" : "focus");
      } else if (node.id === this.hoveredId) {
        states.push("hovered");
      } else if (highRiskFiltered) {
        states.push("filter-dimmed");
      } else if (this.filter === "high-risk" && risk === "high") {
        states.push("high-risk");
      } else if (neighborIds.has(node.id)) {
        states.push("related");
      } else {
        states.push("dimmed");
      }
      nodeStates[node.id] = states;
    }
    for (const edge of this.display.edges) {
      const focusEdge = edge.source === this.focusId || edge.target === this.focusId;
      const hoverEdge = this.hoveredId !== null && (edge.source === this.hoveredId || edge.target === this.hoveredId);
      const relatedEdge = neighborIds.has(edge.source) && neighborIds.has(edge.target);
      edgeStates[edge.id] = [focusEdge || hoverEdge ? "edge-focus" : relatedEdge ? "edge-related" : "edge-dim"];
    }
    for (const edge of this.source.semanticEdges) {
      const active = edge.source === activeId || edge.target === activeId;
      edgeStates[`semantic:${edge.id}`] = [active ? "semantic-active" : "semantic-hidden"];
    }
    void this.graph.setElementState(nodeStates, animated).catch((error: unknown) => this.reportRenderError(error));
    void this.graph.setElementState(edgeStates, animated).catch((error: unknown) => this.reportRenderError(error));
  }

  private scheduleVisualState(delay = 50) {
    if (this.paused) {
      return;
    }
    if (this.visualStateTimer) {
      clearTimeout(this.visualStateTimer);
    }
    this.visualStateTimer = setTimeout(() => {
      this.visualStateTimer = null;
      this.applyVisualState();
    }, delay);
  }

  private refreshNodeStyles() {
    if (!this.graph) {
      return;
    }
    const zoom = this.safeZoom();
    this.graph.updateNodeData(
      this.layout.nodes.map((node) => ({
        id: node.id,
        style: this.nodeDatumStyle(node, zoom),
      })),
    );
    void this.graph.draw().catch((error: unknown) => this.reportRenderError(error));
  }

  private scheduleZoomCompensation() {
    if (this.paused) {
      return;
    }
    if (this.zoomCompensationTimer) {
      clearTimeout(this.zoomCompensationTimer);
    }
    this.zoomCompensationTimer = setTimeout(() => {
      this.zoomCompensationTimer = null;
      if (!this.graph) {
        return;
      }
      const zoom = this.safeZoom();
      if (Math.abs(zoom - this.zoomCompensation) < 0.025) {
        return;
      }
      this.zoomCompensation = zoom;
      this.scaleLabelsForZoom(zoom);
      this.applyVisualState();
    }, 80);
  }

  private scaleLabelsForZoom(zoom: number) {
    if (!this.graph) {
      return;
    }
    this.graph.updateNodeData(
      this.layout.nodes.map((node) => ({
        id: node.id,
        style: this.nodeDatumStyle(node, zoom),
      })),
    );
    void this.graph.draw().catch((error: unknown) => this.reportRenderError(error));
  }

  private touchInteraction() {
    this.interactionUntil = performance.now() + IDLE_RESUME_MS;
    if (this.mode === "focused" && !this.reducedMotion) {
      this.startOrbit();
    }
  }

  private enterFreeView() {
    this.interactionUntil = performance.now() + IDLE_RESUME_MS;
    this.setMode("free");
    this.stopOrbit();
  }

  private setMode(mode: KnowledgeGraphMode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.callbacks.onModeChange?.(mode);
  }

  private startOrbit() {
    if (this.paused || this.orbitFrame !== null || this.destroyed || this.reducedMotion) {
      return;
    }
    this.orbitLastTime = performance.now();
    this.orbitLastPosition = this.orbitLastTime;
    const step = (now: number) => {
      this.orbitFrame = null;
      if (this.destroyed || this.paused || !this.graph || this.mode !== "focused") {
        return;
      }
      const delta = Math.min(60, Math.max(0, now - this.orbitLastTime));
      this.orbitLastTime = now;
      const idle = now >= this.interactionUntil;
      if (idle && this.hoveredId === null && !this.orbitMoving) {
        this.orbitAngle += (delta / ORBIT_PERIOD) * Math.PI * 2;
        if (now - this.orbitLastPosition >= 32) {
          this.orbitLastPosition = now;
          const positions = orbitPositions(this.layout, this.orbitAngle);
          this.orbitMoving = true;
          void this.graph
            .translateElementTo(positions, false)
            .catch((error: unknown) => this.reportRenderError(error))
            .finally(() => {
              this.orbitMoving = false;
            });
        }
      }
      this.orbitFrame = requestAnimationFrame(step);
    };
    this.orbitFrame = requestAnimationFrame(step);
  }

  private stopOrbit() {
    if (this.orbitFrame !== null) {
      cancelAnimationFrame(this.orbitFrame);
      this.orbitFrame = null;
    }
    this.orbitMoving = false;
  }

  destroy() {
    this.transitionGeneration += 1;
    this.destroyed = true;
    this.stopOrbit();
    if (this.zoomCompensationTimer) {
      clearTimeout(this.zoomCompensationTimer);
      this.zoomCompensationTimer = null;
    }
    if (this.visualStateTimer) {
      clearTimeout(this.visualStateTimer);
      this.visualStateTimer = null;
    }
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.graph?.destroy();
    this.graph = null;
  }
}
