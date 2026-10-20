"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { ArrowRight, Network, Target } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { GRAPH_THEME, riskColor, riskHalo, riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import type { GraphRiskLevel } from "@/features/knowledge/graph-v2/graph-types";
import { cn } from "@/lib/utils";

const NODE_POSITIONS = [
  { x: 50, y: 11 },
  { x: 81, y: 29 },
  { x: 89, y: 66 },
  { x: 68, y: 89 },
  { x: 32, y: 89 },
  { x: 11, y: 66 },
  { x: 19, y: 29 },
] as const;

const riskRank: Record<GraphRiskLevel, number> = {
  high: 5,
  medium: 4,
  elevated: 3,
  normal: 2,
  unknown: 1,
};

function validPointId(source: ReturnType<typeof buildGraphSource> | null, value: string | null | undefined) {
  return value && source?.pointById.has(value) ? value : null;
}

export function AiKnowledgeGraphPreview({
  analysis,
  attentionCount,
  chapters,
  courseId,
  fallbackDifficulty,
}: {
  analysis: AIAnalysis | null;
  attentionCount: number;
  chapters: Chapter[];
  courseId: string;
  fallbackDifficulty: DashboardLearningDifficulty | null;
}) {
  const graphQuery = useKnowledgeGraph(courseId, {
    scope: "full",
    maxNodes: 160,
  });
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const reducedMotion = useReducedMotion() ?? false;
  const source = useMemo(
    () => (graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null),
    [chapters, graphQuery.data],
  );
  const riskMap = useMemo(
    () => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data),
    [dashboardQuery.data, source?.points],
  );
  const analysisPointId = useMemo(() => {
    if (!source) return null;
    const candidates = [
      analysis?.knowledge_point_id,
      ...(analysis?.evidence.map((item) => item.knowledge_point_id) ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .filter((value) => source.pointById.has(value));
    const unique = [...new Set(candidates)];
    return unique.sort(
      (left, right) => riskRank[riskMap.get(right) ?? "unknown"] - riskRank[riskMap.get(left) ?? "unknown"],
    )[0] ?? null;
  }, [analysis, riskMap, source]);
  const riskPointId = useMemo(() => {
    if (!source) return null;
    const dashboardPoint = dashboardQuery.data?.high_risk_knowledge_points
      .map((item) => item.knowledge_point_id)
      .find((pointId) => source.pointById.has(pointId));
    if (dashboardPoint) return dashboardPoint;
    return validPointId(source, fallbackDifficulty?.knowledge_point_id);
  }, [dashboardQuery.data?.high_risk_knowledge_points, fallbackDifficulty?.knowledge_point_id, source]);
  const centerId = analysisPointId ?? riskPointId ?? source?.defaultFocusId ?? null;
  const mode = analysisPointId ? "analysis" : riskPointId ? "risk" : "overview";
  const [selection, setSelection] = useState<{ id: string; centerId: string | null } | null>(null);

  const activeId = selection && selection.centerId === centerId && source?.pointById.has(selection.id)
    ? selection.id
    : centerId;
  const activePoint = activeId ? source?.pointById.get(activeId) ?? null : null;
  const activeRisk = activeId ? riskMap.get(activeId) ?? "unknown" : "unknown";
  const neighbors = useMemo(() => {
    if (!source || !activeId) return [];
    const relationByNeighbor = new Map<string, { label: string; direction: "upstream" | "downstream" | "related" }>();
    for (const edge of source.semanticEdges) {
      const neighborId = edge.source === activeId ? edge.target : edge.target === activeId ? edge.source : null;
      if (!neighborId || !source.pointById.has(neighborId)) continue;
      const direction = edge.type === "related"
        ? "related"
        : edge.target === activeId
          ? "upstream"
          : "downstream";
      relationByNeighbor.set(neighborId, {
        direction,
        label: direction === "upstream" ? "前置" : direction === "downstream" ? "后继" : "相关",
      });
    }
    return [...relationByNeighbor.entries()]
      .map(([id, relation]) => ({
        id,
        point: source.pointById.get(id)!,
        risk: riskMap.get(id) ?? "unknown",
        ...relation,
      }))
      .sort(
        (left, right) =>
          (left.direction === "related" ? 1 : 0) - (right.direction === "related" ? 1 : 0) ||
          riskRank[right.risk] - riskRank[left.risk] ||
          left.point.chapterOrder - right.point.chapterOrder ||
          left.point.label.localeCompare(right.point.label, "zh-CN"),
      )
      .slice(0, 6);
  }, [activeId, riskMap, source]);
  const remainingCount = activeId
    ? Math.max(0, (source?.adjacency.get(activeId)?.length ?? 0) - neighbors.length)
    : 0;
  const graphHref = `/knowledge?courseId=${courseId}&tab=graph`;
  const focusHref = centerId ? `${graphHref}&pointId=${centerId}` : graphHref;
  const modeLabel = mode === "analysis"
    ? "本次分析关联知识点"
    : mode === "risk"
      ? "课程风险概览"
      : "课程图谱概览";

  return (
    <Card
      className="min-h-[380px] gap-3 overflow-hidden border-2 border-[#1b3b61] bg-[#081527] py-4 text-[#eaf2ff] xl:h-full"
      data-ai-graph-preview="true"
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-[#eaf2ff]">
          <Network className="size-4 text-[#6ab0ff]" />
          课程知识图谱
        </CardTitle>
        <p className="text-xs leading-5 text-[#8fa5c2]">
          {modeLabel} · 当前课程待关注知识点 {attentionCount} 个
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4">
        {graphQuery.isLoading ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl bg-white/95 text-foreground">
            <LoadingState label="正在加载真实图谱..." />
          </div>
        ) : graphQuery.isError ? (
          <div className="min-h-48 rounded-xl bg-white/95 text-foreground">
            <ErrorState description="知识图谱数据加载失败，请重试。" onRetry={() => void graphQuery.refetch()} title="图谱加载失败" />
          </div>
        ) : !source?.points.length ? (
          <div className="min-h-48 rounded-xl bg-white/95 text-foreground">
            <EmptyState description="当前课程还没有可展示的知识点。" title="暂无图谱数据" />
          </div>
        ) : (
          <>
            <div className="relative min-h-[190px] overflow-hidden rounded-xl border border-[#24466f]/70 bg-[radial-gradient(circle_at_50%_50%,rgba(39,82,135,0.5),rgba(8,21,39,0.98)_72%)]">
              <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                {neighbors.map((neighbor, index) => {
                  const position = NODE_POSITIONS[index % NODE_POSITIONS.length];
                  const isActive = activeId === neighbor.id;
                  return (
                    <line
                      key={neighbor.id}
                      stroke={isActive ? GRAPH_THEME.focusHalo : GRAPH_THEME.edgeSoft}
                      strokeOpacity={isActive ? 1 : 0.65}
                      strokeWidth={isActive ? 1.4 : 1}
                      x1="50"
                      x2={position.x}
                      y1="50"
                      y2={position.y}
                    />
                  );
                })}
              </svg>

              {activePoint && activeId ? (
                <motion.button
                  animate={activeRisk === "high" && !reducedMotion ? { boxShadow: [riskHalo("high"), "rgba(169,140,255,0.62)", riskHalo("high")] } : undefined}
                  aria-label={`当前知识点 ${activePoint.label}，${riskLabel(activeRisk)}`}
                  className="absolute left-1/2 top-1/2 z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 bg-[#0d1d33] text-center shadow-[0_0_28px_rgba(75,156,255,0.25)]"
                  onClick={() => setSelection({ id: activeId, centerId })}
                  style={{ borderColor: riskColor(activeRisk) }}
                  transition={{ duration: 2.8, repeat: Infinity }}
                  type="button"
                >
                  <Target className="size-4 text-[#77b7ff]" />
                  <span className="mt-0.5 max-w-14 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-semibold">
                    {activePoint.label}
                  </span>
                </motion.button>
              ) : null}

              {neighbors.map((neighbor, index) => {
                const position = NODE_POSITIONS[index % NODE_POSITIONS.length];
                const isActive = activeId === neighbor.id;
                return (
                  <button
                    aria-label={`${neighbor.point.label}，${riskLabel(neighbor.risk)}，${neighbor.label}`}
                    className={cn(
                      "absolute z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-[#10233d] px-1 text-center transition-[border-color,opacity,transform] duration-200 hover:scale-105",
                      isActive ? "opacity-100" : "opacity-85",
                    )}
                    key={neighbor.id}
                    onClick={() => setSelection({ id: neighbor.id, centerId })}
                    style={{
                      borderColor: riskColor(neighbor.risk),
                      boxShadow: `0 0 14px ${riskHalo(neighbor.risk)}`,
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                    }}
                    title={`${neighbor.point.label} · ${neighbor.label}`}
                    type="button"
                  >
                    <span className="max-w-8 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-semibold">
                      {neighbor.point.label}
                    </span>
                    <span className="mt-0.5 text-[7px] text-[#9db2cf]">{riskLabel(neighbor.risk)}</span>
                  </button>
                );
              })}

              {remainingCount > 0 ? (
                <span className="absolute bottom-2 right-2 rounded-full border border-white/10 bg-[#0d1d33]/80 px-2 py-1 text-[10px] text-[#9db2cf]">
                  +{remainingCount} 个关联知识点
                </span>
              ) : null}
            </div>

            <div className="mt-3 rounded-lg border border-[#24466f]/80 bg-[#0d1d33]/80 px-3 py-3">
              {activePoint ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-[#eaf2ff]">{activePoint.label}</p>
                      <p className="mt-1 text-[11px] text-[#8fa5c2]">
                        {activePoint.chapterTitle ?? "未归属章节"} · 邻接 {source.adjacency.get(activePoint.id)?.length ?? 0} 个真实节点
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px]" style={{ color: riskColor(activeRisk) }}>
                      {riskLabel(activeRisk)}
                    </span>
                  </div>
                  {activeId === centerId && analysisPointId ? (
                    <p className="mt-2 text-[11px] leading-4 text-[#9db2cf]">
                      该节点来自当前分析记录或关联证据的有效 knowledge_point_id，未使用文字相似度猜测。
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-auto grid gap-2 pt-3 sm:grid-cols-2 xl:grid-cols-1">
              {centerId ? (
                <Link className={cn(buttonVariants({ size: "sm" }), "w-full bg-[#2468b7] hover:bg-[#2f7cd5]")} href={focusHref}>
                  在知识图谱中定位 <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
              <Link
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full border-white/20 bg-transparent text-[#dceaff] hover:bg-white/10 hover:text-white")}
                href={graphHref}
              >
                前往完整知识图谱
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
