"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { ExternalLink, GitBranchPlus, Network, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties } from "react";

import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import { GRAPH_THEME, riskColor, riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import type { GraphRiskLevel, GraphSemanticEdge, GraphSourceModel } from "@/features/knowledge/graph-v2/graph-types";
import styles from "./ai-neural-stage.module.css";
import graphStyles from "./ai-stage-graph.module.css";

type Relation = "prerequisite" | "related";
type GraphNode = {
  id: string;
  label: string;
  chapterTitle: string | null;
  risk: GraphRiskLevel;
  depth: 0 | 1 | 2;
  x: number;
  y: number;
  degree: number;
  evidence: number;
};
type GraphLink = GraphSemanticEdge & { x1: number; y1: number; x2: number; y2: number; path: string };

const RISK_PRIORITY: Record<GraphRiskLevel, number> = { high: 5, medium: 4, elevated: 3, normal: 2, unknown: 1 };
const RELATION_LABEL: Record<Relation, string> = { prerequisite: "前置依赖", related: "知识关联" };
const RELATION_COLOR: Record<Relation, string> = { prerequisite: GRAPH_THEME.edgePrerequisite, related: "#a98cff" };
const SOURCE_TYPES: Record<string, string[]> = {
  conversations: ["conversation_message"], quizzes: ["quick_check_attempt"], events: ["learning_event"],
  citations: ["message_citation", "knowledge_chunk"], mastery: ["mastery_snapshot"],
};

function stableHash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function relationOf(edge: GraphSemanticEdge): Relation {
  return edge.type === "prerequisite" ? "prerequisite" : "related";
}

function labelForNode(source: GraphSourceModel | null, id: string) {
  return source?.pointById.get(id)?.label ?? id;
}

function edgePath(x1: number, y1: number, x2: number, y2: number, index: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(7, Math.max(2, distance * 0.1)) * (index % 2 === 0 ? 1 : -1);
  const nx = -dy / distance;
  const ny = dx / distance;
  const cx = (x1 + x2) / 2 + nx * bend;
  const cy = (y1 + y2) / 2 + ny * bend;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function sortNeighborIds(source: GraphSourceModel, ids: string[], riskMap: ReadonlyMap<string, GraphRiskLevel>) {
  return [...new Set(ids)].sort((left, right) => {
    const leftPoint = source.pointById.get(left);
    const rightPoint = source.pointById.get(right);
    return RISK_PRIORITY[riskMap.get(right) ?? "unknown"] - RISK_PRIORITY[riskMap.get(left) ?? "unknown"]
      || (rightPoint?.semanticDegree ?? 0) - (leftPoint?.semanticDegree ?? 0)
      || (rightPoint?.evidenceCount ?? 0) - (leftPoint?.evidenceCount ?? 0)
      || left.localeCompare(right, "zh-CN", { numeric: true });
  });
}

/** A deliberately flat projection: real knowledge points only, no 3D orbit or fake nodes. */
function buildFlatGraph(source: GraphSourceModel, focusId: string, riskMap: ReadonlyMap<string, GraphRiskLevel>) {
  const direct = source.adjacency.get(focusId) ?? [];
  const firstIds = sortNeighborIds(source, direct.map((item) => item.neighborId), riskMap).slice(0, 7);
  const included = new Set<string>([focusId, ...firstIds]);
  const secondCandidates: string[] = [];
  firstIds.forEach((id) => secondCandidates.push(...(source.adjacency.get(id) ?? []).map((item) => item.neighborId)));
  const secondIds = sortNeighborIds(source, secondCandidates, riskMap).filter((id) => !included.has(id)).slice(0, 7);
  secondIds.forEach((id) => included.add(id));

  const innerPositions: Array<[number, number]> = [[25, 21], [50, 15], [75, 21], [88, 51], [75, 81], [25, 81], [12, 51]];
  const outerPositions: Array<[number, number]> = [[9, 29], [32, 8], [68, 8], [91, 29], [91, 73], [68, 93], [32, 93]];
  const nodes = new Map<string, GraphNode>();
  const add = (id: string, depth: 0 | 1 | 2, index: number) => {
    const point = source.pointById.get(id);
    if (!point) return;
    const [x, y] = depth === 0 ? [50, 50] : (depth === 1 ? innerPositions[index] : outerPositions[index]) ?? [50, 50];
    nodes.set(id, { id, label: point.label, chapterTitle: point.chapterTitle, risk: riskMap.get(id) ?? "unknown", depth, x, y, degree: point.semanticDegree, evidence: point.evidenceCount });
  };
  add(focusId, 0, 0);
  firstIds.forEach((id, index) => add(id, 1, index));
  secondIds.forEach((id, index) => add(id, 2, index));
  const links = source.semanticEdges.filter((edge) => included.has(edge.source) && included.has(edge.target)).slice(0, 32).map((edge, index) => {
    const start = nodes.get(edge.source)!;
    const end = nodes.get(edge.target)!;
    return { ...edge, x1: start.x, y1: start.y, x2: end.x, y2: end.y, path: edgePath(start.x, start.y, end.x, end.y, index) };
  });
  return { nodes: [...nodes.values()], links };
}

function isRisk(risk: GraphRiskLevel) { return risk === "high" || risk === "medium" || risk === "elevated"; }

export function AiStageGraph({ analysis, chapters, courseId, fallbackDifficulty, activeEvidenceId }: {
  analysis: AIAnalysis | null;
  chapters: Chapter[];
  courseId: string;
  fallbackDifficulty: DashboardLearningDifficulty | null;
  activeEvidenceId?: string | null;
}) {
  const graphQuery = useKnowledgeGraph(courseId);
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const markerId = useId().replace(/:/g, "");
  const [choice, setChoice] = useState<{ id: string; base: string | null } | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const source = useMemo(() => graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null, [graphQuery.data, chapters]);
  const riskMap = useMemo(() => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data), [source, dashboardQuery.data]);
  const linkedId = useMemo(() => {
    if (!source) return null;
    const candidates = [analysis?.knowledge_point_id, ...(analysis?.evidence.map((item) => item.knowledge_point_id) ?? [])]
      .filter((id): id is string => typeof id === "string" && source.pointById.has(id));
    return [...new Set(candidates)].sort((a, b) => RISK_PRIORITY[riskMap.get(b) ?? "unknown"] - RISK_PRIORITY[riskMap.get(a) ?? "unknown"])[0] ?? null;
  }, [analysis, riskMap, source]);
  const evidenceLinkedId = useMemo(() => {
    if (!activeEvidenceId || !source || !analysis) return null;
    const types = SOURCE_TYPES[activeEvidenceId] ?? [];
    return analysis.evidence.find((item) => (item.id === activeEvidenceId || types.includes(item.source_type)) && item.knowledge_point_id && source.pointById.has(item.knowledge_point_id))?.knowledge_point_id ?? null;
  }, [activeEvidenceId, analysis, source]);
  const knownHighRisk = dashboardQuery.data?.high_risk_knowledge_points.find((item) => source?.pointById.has(item.knowledge_point_id))?.knowledge_point_id ?? null;
  const difficultyId = fallbackDifficulty?.knowledge_point_id && source?.pointById.has(fallbackDifficulty.knowledge_point_id) ? fallbackDifficulty.knowledge_point_id : null;
  const baseId = linkedId ?? knownHighRisk ?? difficultyId ?? source?.defaultFocusId ?? null;
  const chosenId = choice?.base === baseId && choice.id && source?.pointById.has(choice.id) ? choice.id : baseId;
  const activeId = evidenceLinkedId ?? chosenId;
  const focus = activeId && source ? source.pointById.get(activeId) ?? null : null;
  const graph = useMemo(() => activeId && source ? buildFlatGraph(source, activeId, riskMap) : { nodes: [] as GraphNode[], links: [] as GraphLink[] }, [activeId, riskMap, source]);
  const relationCounts = graph.links.filter((edge) => edge.source === activeId || edge.target === activeId).reduce((counts, edge) => counts.set(relationOf(edge), (counts.get(relationOf(edge)) ?? 0) + 1), new Map<Relation, number>());
  const hasGraph = Boolean(source?.points.length);
  const hasVerifiedRisk = [...riskMap.values()].some(isRisk);
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph`;
  const focusHref = activeId ? `${graphHref}&pointId=${encodeURIComponent(activeId)}` : graphHref;
  const contextLabel = evidenceLinkedId ? "证据关联知识点" : linkedId ? "本次分析聚焦" : knownHighRisk ? "课程风险聚焦" : "课程结构聚焦";

  return (
    <section aria-label="动态课程知识图谱" className={styles.graphPanel} data-ai-graph="true">
      <div className={graphStyles.header}>
        <div className={graphStyles.title}><span className={graphStyles.titleIcon}><Network size={15} /></span><div><strong>知识关系网络</strong><small>二维真实课程图谱</small></div></div>
        <div className={graphStyles.live}><i />LIVE</div>
      </div>
      <div className={graphStyles.toolbar}>
        <span>{source ? `${source.points.length} 个知识点` : "课程知识点"}</span><b>·</b><span>{source?.semanticEdges.length ?? 0} 条真实关系</span>
        <button type="button" aria-pressed={riskOnly} disabled={!hasVerifiedRisk} onClick={() => setRiskOnly((value) => !value)} className={graphStyles.riskButton} title={hasVerifiedRisk ? "突出有真实学情依据的风险点" : "当前没有风险数据"}>{riskOnly ? <ShieldAlert size={12} /> : <Sparkles size={12} />}{riskOnly ? "显示全部" : "风险聚焦"}</button>
      </div>
      {graphQuery.isLoading ? <div className={styles.graphPlaceholder} role="status">正在加载真实知识图谱…</div> : graphQuery.isError ? <div className={styles.graphPlaceholder} role="alert">图谱获取失败 <button type="button" onClick={() => void graphQuery.refetch()}>重试</button></div> : !hasGraph || !activeId ? <div className={styles.graphPlaceholder}>暂无课程知识点 · 等待知识结构</div> : (
        <>
          <div className={graphStyles.canvas}>
            <div className={graphStyles.scanLine} aria-hidden="true" />
            <svg className={graphStyles.svg} viewBox="0 0 100 100" role="img" aria-label="真实知识点二维关系网络">
              <defs><marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M 0 1 L 9 5 L 0 9 Z" fill={RELATION_COLOR.prerequisite} /></marker></defs>
              {graph.links.map((edge) => {
                const relation = relationOf(edge);
                const attached = edge.source === activeId || edge.target === activeId;
                const highlighted = hovered !== null && (edge.source === hovered || edge.target === hovered);
                const highRisk = isRisk(riskMap.get(edge.source) ?? "unknown") || isRisk(riskMap.get(edge.target) ?? "unknown");
                const muted = riskOnly && !highRisk && !attached && !highlighted;
                return <g key={edge.id} className={`${graphStyles.edgeGroup} ${attached || highlighted ? graphStyles.edgeActive : ""}`} opacity={muted ? .1 : highlighted ? 1 : attached ? .95 : .56}>
                  <path d={edge.path} className={`${graphStyles.edgeBase} ${relation === "related" ? graphStyles.edgeRelated : ""}`} markerEnd={relation === "prerequisite" ? `url(#${markerId}-arrow)` : undefined} />
                  <path d={edge.path} pathLength="1" className={graphStyles.edgeFlow} />
                  {(attached || highlighted) ? <circle r="1.1" className={graphStyles.edgeSignal}><animateMotion dur={`${2.3 + (stableHash(edge.id) % 10) / 10}s`} repeatCount="indefinite" path={edge.path} /></circle> : null}
                  <title>{RELATION_LABEL[relation]}：{labelForNode(source, edge.source)} → {labelForNode(source, edge.target)} · {edge.evidenceCount} 条依据</title>
                </g>;
              })}
            </svg>
            {graph.nodes.map((node) => {
              const selected = node.id === activeId;
              const highlighted = hovered === node.id;
              const connected = selected || highlighted || graph.links.some((edge) => hovered !== null && (edge.source === hovered || edge.target === hovered) && (edge.source === node.id || edge.target === node.id));
              const muted = riskOnly && !isRisk(node.risk) && !selected;
              const color = selected ? "#57d8ff" : riskColor(node.risk);
              return <button key={node.id} type="button" className={`${graphStyles.node} ${node.depth === 0 ? graphStyles.nodeCore : node.depth === 1 ? graphStyles.nodePrimary : graphStyles.nodeSatellite} ${selected ? graphStyles.nodeSelected : ""} ${highlighted ? graphStyles.nodeHover : ""} ${muted ? graphStyles.nodeMuted : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%`, "--node-color": color } as CSSProperties} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)} onClick={() => setChoice({ id: node.id, base: baseId })} aria-pressed={selected} aria-label={`${node.label}，${riskLabel(node.risk)}${selected ? "，当前聚焦" : ""}`} title={`${node.label} · ${riskLabel(node.risk)}`}>
                <span className={graphStyles.nodeSurface} aria-hidden="true" /><span className={graphStyles.nodeStatus} aria-hidden="true" />
                <span className={graphStyles.nodeText}><strong>{node.label}</strong><small>{node.depth === 0 ? (selected ? "当前聚焦" : "知识中心") : node.depth === 1 ? "直接关系" : "关联节点"}</small></span>
                {selected ? <span className={graphStyles.nodePulse} aria-hidden="true" /> : null}
                {connected && !selected ? <span className={graphStyles.connectionMark} aria-hidden="true" /> : null}
              </button>;
            })}
          </div>
          <div className={graphStyles.relationStrip} aria-label="当前知识点关系统计">
            {["prerequisite", "related"].map((type) => <span key={type} className={graphStyles.relationPill}><i style={{ background: RELATION_COLOR[type as Relation] }} />{RELATION_LABEL[type as Relation]} {relationCounts.get(type as Relation) ?? 0}</span>)}
            <span className={graphStyles.relationHint}>点击节点重新聚焦</span>
          </div>
        </>
      )}
      <div className={graphStyles.legend}><span><i style={{ background: GRAPH_THEME.edgePrerequisite }} />前置关系</span><span><i style={{ background: RELATION_COLOR.related }} />关联关系</span><span><i style={{ background: riskColor("high") }} />风险知识点</span></div>
      <div className={styles.graphFocus}>
        <div className={styles.graphFocusText}><small>{contextLabel} · {riskLabel(activeId ? riskMap.get(activeId) : "unknown")}</small><strong>{focus?.label ?? "暂无聚焦知识点"}</strong></div>
        {choice?.base === baseId && !evidenceLinkedId ? <button aria-label="恢复默认聚焦" className={styles.graphReset} onClick={() => setChoice(null)} type="button"><RotateCcw size={15} /></button> : null}
        <Link href={focusHref} className={styles.graphOpen}><GitBranchPlus size={14} />完整图谱<ExternalLink size={12} /></Link>
      </div>
    </section>
  );
}
