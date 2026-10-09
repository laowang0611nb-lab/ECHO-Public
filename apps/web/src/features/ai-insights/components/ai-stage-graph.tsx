"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { ExternalLink, GitBranchPlus, Network, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";

import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import { riskColor, riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import type { GraphRiskLevel } from "@/features/knowledge/graph-v2/graph-types";

import styles from "./ai-neural-stage.module.css";

const RISK_PRIORITY: Record<GraphRiskLevel, number> = { high: 4, medium: 3, elevated: 2, normal: 1, unknown: 0 };
const FIRST_RING = [
  [23, 19], [48, 11], [79, 17], [89, 45], [76, 78], [47, 89], [19, 74], [10, 45],
];
const OUTER_RING = [[15, 9], [69, 7], [92, 72], [26, 92], [9, 62], [92, 25]];

type GraphNode = { id: string; label: string; x: number; y: number; risk: GraphRiskLevel; depth: number };
type GraphLink = { key: string; source: string; target: string; x1: number; y1: number; x2: number; y2: number };

export function AiStageGraph({
  analysis,
  chapters,
  courseId,
  fallbackDifficulty,
}: {
  analysis: AIAnalysis | null;
  chapters: Chapter[];
  courseId: string;
  fallbackDifficulty: DashboardLearningDifficulty | null;
}) {
  const graphQuery = useKnowledgeGraph(courseId);
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const [choice, setChoice] = useState<{ id: string; base: string | null } | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const source = useMemo(() => graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null, [graphQuery.data, chapters]);
  const riskMap = useMemo(() => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data), [source, dashboardQuery.data]);
  const linkedPoint = useMemo(() => {
    if (!source) return null;
    const fromEvidence = [analysis?.knowledge_point_id, ...(analysis?.evidence.map((e) => e.knowledge_point_id) ?? [])]
      .filter((id): id is string => Boolean(id) && source.pointById.has(id!));
    return [...new Set(fromEvidence)].sort((a, b) => RISK_PRIORITY[riskMap.get(b) ?? "unknown"] - RISK_PRIORITY[riskMap.get(a) ?? "unknown"])[0] ?? null;
  }, [source, analysis, riskMap]);
  const knownHighRisk = dashboardQuery.data?.high_risk_knowledge_points.find((p) => source?.pointById.has(p.knowledge_point_id))?.knowledge_point_id ?? null;
  const actualRiskFallback = fallbackDifficulty?.knowledge_point_id && source?.pointById.has(fallbackDifficulty.knowledge_point_id) ? fallbackDifficulty.knowledge_point_id : null;
  const baseId = linkedPoint ?? knownHighRisk ?? actualRiskFallback ?? source?.defaultFocusId ?? null;
  const activeId = choice?.base === baseId && choice?.id && source?.pointById.has(choice.id) ? choice.id : baseId;
  const focus = activeId ? source?.pointById.get(activeId) ?? null : null;
  const activeRisk = activeId ? riskMap.get(activeId) ?? "unknown" : "unknown";
  const view = useMemo(() => {
    if (!source || !activeId) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const mapped: GraphNode[] = [{ id: activeId, label: source.pointById.get(activeId)?.label ?? "知识点", x: 50, y: 49, risk: riskMap.get(activeId) ?? "unknown", depth: 0 }];
    const included = new Set([activeId]);
    const first = (source.adjacency.get(activeId) ?? [])
      .map((e) => e.neighborId)
      .filter((id, index, arr) => arr.indexOf(id) === index && source.pointById.has(id))
      .sort((a, b) => RISK_PRIORITY[riskMap.get(b) ?? "unknown"] - RISK_PRIORITY[riskMap.get(a) ?? "unknown"])
      .slice(0, FIRST_RING.length);
    first.forEach((id, index) => {
      included.add(id);
      const p = source.pointById.get(id)!;
      mapped.push({ id, label: p.label, x: FIRST_RING[index][0], y: FIRST_RING[index][1], risk: riskMap.get(id) ?? "unknown", depth: 1 });
    });
    const additional: string[] = [];
    for (const id of first) {
      for (const edge of source.adjacency.get(id) ?? []) {
        if (included.has(edge.neighborId) || !source.pointById.has(edge.neighborId)) continue;
        included.add(edge.neighborId);
        additional.push(edge.neighborId);
        if (additional.length >= OUTER_RING.length) break;
      }
      if (additional.length >= OUTER_RING.length) break;
    }
    additional.forEach((id, index) => mapped.push({ id, label: source.pointById.get(id)!.label, x: OUTER_RING[index][0], y: OUTER_RING[index][1], risk: riskMap.get(id) ?? "unknown", depth: 2 }));
    const lookup = new Map(mapped.map((n) => [n.id, n]));
    const links: GraphLink[] = source.semanticEdges.filter((edge) => lookup.has(edge.source) && lookup.has(edge.target))
      .slice(0, 30).map((e) => ({ key: e.id, source: e.source, target: e.target, x1: lookup.get(e.source)!.x, y1: lookup.get(e.source)!.y, x2: lookup.get(e.target)!.x, y2: lookup.get(e.target)!.y }));
    return { nodes: mapped, links };
  }, [source, activeId, riskMap]);
  const hasGraph = Boolean(source?.points.length);
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph`;
  const focusHref = activeId ? `${graphHref}&pointId=${encodeURIComponent(activeId)}` : graphHref;
  const contextLabel = linkedPoint ? "本次分析关联知识点" : knownHighRisk ? "课程风险知识点" : "课程知识结构";
  return (
    <section aria-label="动态课程知识图谱" className={styles.graphPanel} data-ai-graph="true">
      <div className={styles.graphHeader}>
        <div className={styles.graphTitle}><Network size={17} /><strong>动态课程知识图谱</strong></div>
        <button aria-pressed={riskOnly} className={styles.graphToggle} onClick={() => setRiskOnly((v) => !v)} type="button">{riskOnly ? "全部关系" : "突出风险"}</button>
      </div>
      <p className={styles.graphSubtitle}>{graphQuery.data && source ? `${source.points.length} 个知识点 · ${source.semanticEdges.length} 条真实关系` : "课程图谱 · 学情关联"}</p>
      {graphQuery.isLoading ? (
        <div className={styles.graphPlaceholder} role="status">正在加载真实知识图谱…</div>
      ) : graphQuery.isError ? (
        <div className={styles.graphPlaceholder} role="alert">图谱获取失败 <button type="button" onClick={() => void graphQuery.refetch()}>重试</button></div>
      ) : !hasGraph ? (
        <div className={styles.graphPlaceholder}>本课程尚无知识图谱数据</div>
      ) : (
        <div className={styles.graphUniverse}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.graphEdges}>
            {view.links.map((link) => {
              const linked = link.source === activeId || link.target === activeId;
              return (
                <g key={link.key} opacity={riskOnly && !linked ? ".15" : linked ? "1" : ".5"}>
                  <line x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} stroke={linked ? "#62b5ff" : "#476b9a"} strokeWidth={linked ? ".5" : ".27"} />
                  {linked ? <line className={styles.graphEdgeFlow} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} stroke="#bcecff" strokeWidth=".58" strokeDasharray="1 20" /> : null}
                </g>
              );
            })}
          </svg>
          {view.nodes.map((node) => {
            const selected = node.id === activeId;
            const dim = riskOnly && node.risk !== "high" && node.risk !== "medium" && !selected;
            return (
              <button
                aria-label={`${node.label}，${riskLabel(node.risk)}${selected ? "，当前聚焦" : ""}`}
                aria-pressed={selected}
                className={`${styles.graphNode} ${selected ? styles.graphNodeSelected : ""} ${dim ? styles.graphNodeDim : ""}`}
                key={node.id}
                onClick={() => setChoice({ id: node.id, base: baseId })}
                style={{ left: `${node.x}%`, top: `${node.y}%`, "--node-color": riskColor(node.risk) } as CSSProperties}
                title={`${node.label} · ${riskLabel(node.risk)}`}
                type="button"
              >
                <span className={styles.graphNodeLight} />
                {(selected || (node.depth === 1 && node.label.length < 9)) ? <span className={styles.graphNodeLabel}>{node.label}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.graphLegend}>
        <span><i style={{ backgroundColor: "#4b9cff" }} />正常</span>
        <span><i style={{ backgroundColor: "#a98cff" }} />高风险</span>
        <span><i style={{ backgroundColor: "#71839c" }} />暂无学情</span>
      </div>
      <div className={styles.graphFocus}>
        <div className={styles.graphFocusText}>
          <small>{contextLabel} · {riskLabel(activeRisk)}</small>
          <strong>{focus?.label ?? "暂无聚焦知识点"}</strong>
        </div>
        {choice && choice.base === baseId ? <button aria-label="恢复默认聚焦" className={styles.graphReset} onClick={() => setChoice(null)} type="button"><RotateCcw size={15} /></button> : null}
        <Link href={focusHref} className={styles.graphOpen}><GitBranchPlus size={14} />图谱定位<ExternalLink size={12} /></Link>
      </div>
    </section>
  );
}
