"use client";

import type { Chapter, KnowledgeGraph } from "@echo/shared-types";
import { Crosshair, Maximize2, Minimize2, Network, RotateCcw, ScanSearch, Sparkles, ZoomIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useSidebarTransitioning } from "@/components/layout/sidebar-transition";
import { buildPointHref } from "@/features/knowledge/view-model";
import { useKnowledgeCourseDashboard, useKnowledgePointAnalytics } from "@/features/knowledge/queries";
import { cn } from "@/lib/utils";

import { KnowledgeGraphAnalyticsCard } from "./analytics-card";
import { buildGraphSource } from "./graph-adapter";
import { KnowledgeGraphController } from "./graph-controller";
import { GRAPH_THEME } from "./graph-theme";
import { derivePointRisk, riskMapFromDashboard } from "./graph-risk";
import type {
  GraphHoverState,
  GraphRiskLevel,
  KnowledgeGraphFilter,
  KnowledgeGraphMode,
} from "./graph-types";

const LAST_FOCUS_PREFIX = "echo.knowledge-graph.last-focus";

export function KnowledgeGraphView({
  courseId,
  courseName,
  chapters,
  graph,
  isLoading,
  isError,
  onRetry,
}: {
  courseId: string;
  courseName: string;
  chapters: Chapter[];
  graph: KnowledgeGraph | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const sidebarTransitioning = useSidebarTransitioning();
  const source = useMemo(() => (graph ? buildGraphSource(graph, chapters) : null), [chapters, graph]);
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const [preferredFocusId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return new URLSearchParams(window.location.search).get("pointId") ?? window.localStorage.getItem(`${LAST_FOCUS_PREFIX}.${courseId}`);
  });
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [hovered, setHovered] = useState<GraphHoverState | null>(null);
  const [mode, setMode] = useState<KnowledgeGraphMode>("focused");
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState<KnowledgeGraphFilter>("all");
  const [fullscreen, setFullscreen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<KnowledgeGraphController | null>(null);
  const riskMapRef = useRef<ReadonlyMap<string, GraphRiskLevel>>(new Map());
  const focusIdRef = useRef<string | null>(null);

  const initialFocusId = useMemo(() => {
    if (!source) {
      return null;
    }
    if (preferredFocusId && source.pointById.has(preferredFocusId)) {
      return preferredFocusId;
    }
    const storedFocusId = typeof window === "undefined" ? null : window.localStorage.getItem(`${LAST_FOCUS_PREFIX}.${courseId}`);
    if (storedFocusId && source.pointById.has(storedFocusId)) {
      return storedFocusId;
    }
    return source.defaultFocusId;
  }, [courseId, preferredFocusId, source]);
  const focusId = focusOverride && source?.pointById.has(focusOverride) ? focusOverride : initialFocusId;
  const selectedId = selectedOverride && source?.pointById.has(selectedOverride) ? selectedOverride : focusId;

  const analyticsQuery = useKnowledgePointAnalytics(courseId, selectedId ?? focusId);
  const baseRiskMap = useMemo(
    () => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data),
    [dashboardQuery.data, source?.points],
  );
  const riskMap = useMemo(() => {
    const map = new Map(baseRiskMap);
    const pointId = analyticsQuery.data?.knowledge_point_id;
    if (pointId) {
      map.set(pointId, derivePointRisk(analyticsQuery.data, map.get(pointId)));
    }
    return map;
  }, [analyticsQuery.data, baseRiskMap]);
  const selectedPoint = selectedId ? source?.pointById.get(selectedId) ?? null : null;
  const selectedRisk = selectedId
    ? derivePointRisk(analyticsQuery.data, riskMap.get(selectedId))
    : "unknown";

  useEffect(() => {
    focusIdRef.current = focusId;
  }, [focusId]);

  useEffect(() => {
    riskMapRef.current = riskMap;
    controllerRef.current?.setRiskMap(riskMap);
  }, [riskMap]);

  useEffect(() => {
    controllerRef.current?.setPaused(sidebarTransitioning);
  }, [sidebarTransitioning]);

  useEffect(() => {
    if (!source || !initialFocusId || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const element = canvasRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    setRenderError(null);
    const controller = new KnowledgeGraphController({
      container: element,
      source,
      focusId: initialFocusId,
      viewport: { width: Math.max(320, rect.width), height: Math.max(440, rect.height) },
      riskById: riskMapRef.current,
      reducedMotion: typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      callbacks: {
        onNodeClick: (id) => {
          if (id === focusIdRef.current) {
            const point = source.pointById.get(id);
            router.push(buildPointHref(id, {
              courseId,
              from: "graph",
              resourceId: point?.chapterDocumentId ?? undefined,
            }));
            return;
          }
          setFocusOverride(id);
          setSelectedOverride(id);
        },
        onNodeHover: (id, client) => {
          if (!id) {
            setHovered(null);
            return;
          }
          const point = source.pointById.get(id);
          if (!point) {
            setHovered(null);
            return;
          }
          const bounds = canvas.getBoundingClientRect();
          setHovered({
            id,
            label: point.label,
            x: (client?.x ?? bounds.left + bounds.width / 2) - bounds.left,
            y: (client?.y ?? bounds.top + bounds.height / 2) - bounds.top,
          });
        },
        onBackgroundClick: () => {
          if (focusIdRef.current) {
            setSelectedOverride(focusIdRef.current);
          }
        },
        onZoomChange: (nextZoom) => setZoom(nextZoom),
        onModeChange: setMode,
        onRenderError: (error) => {
          setRenderError(error instanceof Error ? error.message : "知识图谱渲染失败");
        },
      },
    });
    controllerRef.current = controller;
    controller.mount();
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      controller.resize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(440, entry.contentRect.height),
      });
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
      controller.destroy();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [courseId, initialFocusId, router, source]);

  useEffect(() => {
    if (focusId && controllerRef.current) {
      controllerRef.current.setFocus(focusId);
      controllerRef.current.setSelected(focusId);
      window.localStorage.setItem(`${LAST_FOCUS_PREFIX}.${courseId}`, focusId);
    }
  }, [courseId, focusId]);

  useEffect(() => {
    controllerRef.current?.setFilter(filter);
  }, [filter]);

  useEffect(() => {
    controllerRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  async function toggleFullscreen() {
    if (!wrapperRef.current) {
      return;
    }
    try {
      if (document.fullscreenElement === wrapperRef.current) {
        await document.exitFullscreen();
      } else {
        await wrapperRef.current.requestFullscreen();
      }
      setRenderError(null);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "无法切换全屏视图");
    }
  }

  if (isError) {
    return (
      <GraphPanelShell title="知识图谱" description="真实关系数据暂时不可用">
        <div className="flex h-full items-center justify-center">
          <div className="max-w-sm text-center">
            <p className="text-base font-semibold text-white">知识图谱加载失败</p>
            <p className="mt-2 text-sm leading-6 text-[#a9bfdd]">后端关系数据没有返回，请重试。其他知识库页签不受影响。</p>
            <Button className="mt-4" onClick={onRetry} type="button" variant="secondary">
              <RotateCcw data-icon="inline-start" />
              重新加载
            </Button>
          </div>
        </div>
      </GraphPanelShell>
    );
  }

  if (isLoading || !source) {
    return (
      <GraphPanelShell title="知识图谱" description="正在组织真实知识点与关系…">
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-[#a9bfdd]">
            <span className="size-4 animate-spin rounded-full border-2 border-[#4b9cff]/30 border-t-[#4b9cff]" />
            正在构建学习网络
          </div>
        </div>
      </GraphPanelShell>
    );
  }

  if (!source.points.length) {
    return (
      <GraphPanelShell title="知识图谱" description="当前课程还没有可展示的知识点">
        <div className="flex h-full items-center justify-center">
          <div className="max-w-sm text-center">
            <Sparkles className="mx-auto size-7 text-[#74b4ff]" />
            <p className="mt-3 text-base font-semibold text-white">尚未形成知识网络</p>
            <p className="mt-2 text-sm leading-6 text-[#a9bfdd]">解析课程资料并建立知识点后，这里会自动生成图谱。</p>
          </div>
        </div>
      </GraphPanelShell>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-[#213c62] bg-[#081527] shadow-[0_18px_60px_rgba(8,21,39,0.22)] transition-[height,border-radius] duration-300",
        fullscreen ? "h-screen rounded-none border-0" : "h-full min-h-[420px]",
      )}
      ref={wrapperRef}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(84,128,185,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(84,128,185,0.075)_1px,transparent_1px)] bg-[size:32px_32px] opacity-55" />
      <div className="absolute inset-0 z-[1]">
        <div
          className={cn(
            "h-full w-full transition-[filter,opacity] duration-200",
            sidebarTransitioning && "opacity-50 blur-[6px]",
          )}
          ref={canvasRef}
        />
      </div>

      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[520px]">
        <div className="flex items-center gap-2 text-[#dceaff]">
          <Network className="size-4 text-[#6ab0ff]" />
          <h3 className="text-sm font-semibold">课程知识图谱</h3>
          <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold text-[#a9bfdd]">
            {source.points.length} 个知识点
          </span>
          <span className="rounded-full border border-white/10 bg-white/7 px-2 py-0.5 text-[10px] font-semibold text-[#a9bfdd]">
            {source.semanticEdges.length} 条语义关系
          </span>
        </div>
        <p className="mt-1 max-w-md text-xs leading-5 text-[#8299b8]">
          {courseName} · 当前只显示知识点，点击节点切换分析中心
        </p>
      </div>

      <div className="absolute right-4 top-4 z-30 flex items-center gap-2 lg:right-[324px]">
        <div className="flex rounded-lg border border-white/10 bg-[#0d1d33]/90 p-1 shadow-lg backdrop-blur">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>全部</FilterButton>
          <FilterButton active={filter === "high-risk"} onClick={() => setFilter("high-risk")}>高风险</FilterButton>
        </div>
        <ToolbarButton label="回到焦点" onClick={() => controllerRef.current?.resetView()}>
          <Crosshair />
        </ToolbarButton>
        <ToolbarButton label="适应画布" onClick={() => controllerRef.current?.fitView()}>
          <ScanSearch />
        </ToolbarButton>
        <ToolbarButton label={fullscreen ? "退出全屏" : "全屏查看"} onClick={() => void toggleFullscreen()}>
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </ToolbarButton>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#0d1d33]/86 px-3 py-2 text-[11px] text-[#9db2cf] backdrop-blur">
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: GRAPH_THEME.primary }} />正常</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: GRAPH_THEME.risk.elevated }} />关注</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: GRAPH_THEME.risk.medium }} />中风险</span>
        <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: GRAPH_THEME.risk.high }} />高风险</span>
        <span className="ml-1 border-l border-white/10 pl-3">拖动进入自由视图</span>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-[#0d1d33]/86 px-3 py-2 text-[11px] text-[#9db2cf] backdrop-blur">
        <ZoomIn className="size-3.5" />
        {Math.round(zoom * 100)}%
        <span className="border-l border-white/10 pl-2">{mode === "free" ? "自由视图" : mode === "focusing" ? "正在聚焦" : "聚焦模式"}</span>
      </div>

      {source.semanticEdges.length === 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-200">
          当前没有语义关系，已按章节顺序稳定排列
        </div>
      ) : null}

      {hovered ? (
        <div
          className="pointer-events-none absolute z-40 max-w-[240px] -translate-x-1/2 rounded-md border border-white/10 bg-[#081527]/96 px-2.5 py-1.5 text-xs font-medium text-[#edf5ff] shadow-xl"
          style={{ left: hovered.x, top: Math.max(12, hovered.y - 38) }}
        >
          {hovered.label}
        </div>
      ) : null}

      {renderError ? (
        <div className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-red-300/20 bg-red-500/12 px-3 py-2 text-xs text-red-100">
          {renderError}
        </div>
      ) : null}

      <KnowledgeGraphAnalyticsCard
        analytics={analyticsQuery.data ?? null}
        courseId={courseId}
        filterActive={filter === "high-risk"}
        isError={analyticsQuery.isError}
        isLoading={analyticsQuery.isPending}
        onRetry={() => void analyticsQuery.refetch()}
        point={selectedPoint}
        risk={selectedRisk}
      />
    </div>
  );
}

function GraphPanelShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl border border-[#213c62] bg-[#081527]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(84,128,185,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(84,128,185,0.075)_1px,transparent_1px)] bg-[size:32px_32px] opacity-55" />
      <div className="absolute left-5 top-5 z-10">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-[#8299b8]">{description}</p>
      </div>
      <div className="relative h-full">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={cn(
        "h-7 rounded-md px-2.5 text-xs font-semibold transition-colors",
        active ? "bg-[#2468b7] text-white" : "text-[#8ea7c6] hover:bg-white/8 hover:text-white",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-[#0d1d33]/90 text-[#a9bfdd] shadow-lg backdrop-blur transition-colors hover:bg-[#173152] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9cff]"
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="[&>svg]:size-4">{children}</span>
    </button>
  );
}
