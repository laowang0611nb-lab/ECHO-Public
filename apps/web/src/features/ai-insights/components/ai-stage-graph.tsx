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
const RELATION_COLOR: Record<Relation, string> = {
  prerequisite: GRAPH_THEME.edgePrerequisite,
  related: "#a98cff",
};
const SOURCE_TYPES: Record<string, string[]> = {
  conversations: ["conversation_message"],
  quizzes: ["quick_check_attempt"],
  events: ["learning_event"],
  citations: ["message_citation", "knowledge_chunk"],
  mastery: ["mastery_snapshot"],
};

function hash(value: string) {
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
  const bend = Math.min(9, Math.max(3, distance * 0.15)) * (index % 2 === 0 ? 1 : -1);
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
    return (
      RISK_PRIORITY[riskMap.get(right) ?? "unknown"] - RISK_PRIORITY[riskMap.get(left) ?? "unknown"] ||
      (rightPoint?.semanticDegree ?? 0) - (leftPoint?.semanticDegree ?? 0) ||
      (rightPoint?.evidenceCount ?? 0) - (leftPoint?.evidenceCount ?? 0) ||
      left.localeCompare(right, "zh-CN", { numeric: true })
    );
  });
}

/** Only knowledge-point nodes and real semantic edges enter this projection. */
function buildFocusedGraph(source: GraphSourceModel, focusId: string, riskMap: ReadonlyMap<string, GraphRiskLevel>) {
  const direct = source.adjacency.get(focusId) ?? [];
  const firstIds = sortNeighborIds(source, direct.map((item) => item.neighborId), riskMap).slice(0, 8);
  const included = new Set<string>([focusId, ...firstIds]);
  const secondCandidates: string[] = [];
  for (const firstId of firstIds) {
    secondCandidates.push(...(source.adjacency.get(firstId) ?? []).map((item) => item.neighborId));
  }
  const secondIds = sortNeighborIds(source, secondCandidates, riskMap).filter((id) => !included.has(id)).slice(0, 10);
  secondIds.forEach((id) => included.add(id));

  const nodeById = new Map<string, GraphNode>();
  const firstCount = Math.max(1, firstIds.length);
  const secondCount = Math.max(1, secondIds.length);
  const putNode = (id: string, depth: 0 | 1 | 2, index: number, count: number, radiusX: number, radiusY: number) => {
    const point = source.pointById.get(id);
    if (!point) return;
    if (depth === 0) {
      nodeById.set(id, { id, label: point.label, chapterTitle: point.chapterTitle, risk: riskMap.get(id) ?? "unknown", depth, x: 50, y: 50, degree: point.semanticDegree, evidence: point.evidenceCount });
      return;
    }
    const start = depth === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / secondCount;
    const angle = start + (Math.PI * 2 * index) / count + (((hash(id) % 100) / 100) - 0.5) * (depth === 1 ? 0.08 : 0.12);
    nodeById.set(id, { id, label: point.label, chapterTitle: point.chapterTitle, risk: riskMap.get(id) ?? "unknown", depth, x: 50 + Math.cos(angle) * radiusX, y: 50 + Math.sin(angle) * radiusY, degree: point.semanticDegree, evidence: point.evidenceCount });
  };
  putNode(focusId, 0, 0, 1, 0, 0);
  firstIds.forEach((id, index) => putNode(id, 1, index, firstCount, 25, 25));
  secondIds.forEach((id, index) => putNode(id, 2, index, secondCount, 41, 34));

  const links = source.semanticEdges.filter((edge) => included.has(edge.source) && included.has(edge.target)).slice(0, 32).map((edge, index) => {
    const sourceNode = nodeById.get(edge.source)!;
    const targetNode = nodeById.get(edge.target)!;
    return { ...edge, x1: sourceNode.x, y1: sourceNode.y, x2: targetNode.x, y2: targetNode.y, path: edgePath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, index) };
  });
  return { nodes: [...nodeById.values()], links };
}

function riskIsActive(risk: GraphRiskLevel) {
  return risk === "high" || risk === "medium" || risk === "elevated";
}

function nodeSize(node: GraphNode) {
  if (node.depth === 0) return 44;
  return Math.min(31, Math.max(18, 18 + Math.min(7, node.degree) + Math.min(5, node.evidence) * 0.45));
}

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
    const candidates = [analysis?.knowledge_point_id, ...(analysis?.evidence.map((item) => item.knowledge_point_id) ?? [])].filter((id): id is string => typeof id === "string" && source.pointById.has(id));
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
  const graph = useMemo(() => activeId && source ? buildFocusedGraph(source, activeId, riskMap) : { nodes: [] as GraphNode[], links: [] as GraphLink[] }, [activeId, riskMap, source]);
  const relatedEdges = graph.links.filter((edge) => edge.source === activeId || edge.target === activeId);
  const relationCounts = relatedEdges.reduce((counts, edge) => counts.set(relationOf(edge), (counts.get(relationOf(edge)) ?? 0) + 1), new Map<Relation, number>());
  const hasGraph = Boolean(source?.points.length);
  const hasVerifiedRisk = [...riskMap.values()].some(riskIsActive);
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph`;
  const focusHref = activeId ? `${graphHref}&pointId=${encodeURIComponent(activeId)}` : graphHref;
  const contextLabel = evidenceLinkedId ? "证据关联知识点" : linkedId ? "本次分析聚焦" : knownHighRisk ? "课程风险聚焦" : "课程结构聚焦";

  return (
    <section aria-label="动态课程知识图谱" className={styles.graphPanel} data-ai-graph="true">
      <div className={graphStyles.header}>
        <div className={graphStyles.title}><span className={graphStyles.titleIcon}><Network size={15} /></span><div><strong>知识关系网络</strong><small>真实课程语义图谱</small></div></div>
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
            <svg className={graphStyles.svg} viewBox="0 0 100 100" role="img" aria-label="真实知识点关系网络">
              <defs>
                <radialGradient id={`${markerId}-core`}><stop offset="0" stopColor="#eefcff" stopOpacity=".98" /><stop offset=".2" stopColor="#65d5ff" stopOpacity=".9" /><stop offset=".65" stopColor="#387dff" stopOpacity=".25" /><stop offset="1" stopColor="#387dff" stopOpacity="0" /></radialGradient>
                <filter id={`${markerId}-glow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M 0 1 L 9 5 L 0 9 Z" fill={RELATION_COLOR.prerequisite} /></marker>
              </defs>
              <ellipse cx="50" cy="50" rx="28" ry="26" className={graphStyles.orbitInner} />
              <ellipse cx="50" cy="50" rx="43" ry="35" className={graphStyles.orbitOuter} />
              <circle cx="50" cy="50" r="20" fill={`url(#${markerId}-core)`} className={graphStyles.coreGlow} />
              {graph.links.map((edge) => {
                const relation = relationOf(edge);
                const attached = edge.source === activeId || edge.target === activeId;
                const highlighted = hovered !== null && (edge.source === hovered || edge.target === hovered);
                const highRisk = riskIsActive(riskMap.get(edge.source) ?? "unknown") || riskIsActive(riskMap.get(edge.target) ?? "unknown");
                const muted = riskOnly && !highRisk && !attached && !highlighted;
                return <g key={edge.id} className={`${graphStyles.edgeGroup} ${attached || highlighted ? graphStyles.edgeActive : ""}`} opacity={muted ? .1 : highlighted ? 1 : attached ? .92 : .48}>
                  <path d={edge.path} className={`${graphStyles.edgeBase} ${relation === "related" ? graphStyles.edgeRelated : ""}`} markerEnd={relation === "prerequisite" ? `url(#${markerId}-arrow)` : undefined} />
                  <path d={edge.path} pathLength="1" className={graphStyles.edgeFlow} />
                  <title>{RELATION_LABEL[relation]}：{labelForNode(source, edge.source)} → {labelForNode(source, edge.target)} · {edge.evidenceCount} 条依据</title>
                </g>;
              })}
              <circle cx="50" cy="50" r="14" className={graphStyles.coreRing} />
              <circle cx="50" cy="50" r="8" className={graphStyles.coreDot} filter={`url(#${markerId}-glow)`} />
            </svg>
            {graph.nodes.map((node) => {
              const selected = node.id === activeId;
              const highlighted = hovered === node.id;
              const connected = selected || highlighted || graph.links.some((edge) => (edge.source === hovered || edge.target === hovered) && (edge.source === node.id || edge.target === node.id));
              const muted = riskOnly && !riskIsActive(node.risk) && !selected;
              const color = selected ? "#5bd8ff" : riskColor(node.risk);
              const size = nodeSize(node);
              return <button key={node.id} type="button" className={`${graphStyles.node} ${node.depth === 0 ? graphStyles.nodeCore : node.depth === 1 ? graphStyles.nodePrimary : graphStyles.nodeSatellite} ${selected ? graphStyles.nodeSelected : ""} ${highlighted ? graphStyles.nodeHover : ""} ${muted ? graphStyles.nodeMuted : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%`, "--node-color": color, "--node-size": `${size}px` } as CSSProperties} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)} onClick={() => setChoice({ id: node.id, base: baseId })} aria-pressed={selected} aria-label={`${node.label}，${riskLabel(node.risk)}${selected ? "，当前聚焦" : ""}`} title={`${node.label} · ${riskLabel(node.risk)}`}>
                <span className={graphStyles.nodeHalo} aria-hidden="true" /><span className={graphStyles.nodeCoreDot} aria-hidden="true" />
                <span className={`${graphStyles.nodeLabel} ${node.depth === 2 ? graphStyles.nodeLabelOuter : ""}`}>{node.label}</span>
                {node.depth === 1 && node.chapterTitle ? <span className={graphStyles.chapterLabel}>{node.chapterTitle}</span> : null}
                {selected ? <span className={graphStyles.nodePulse} aria-hidden="true" /> : null}
                {connected && !selected ? <span className={graphStyles.connectionMark} aria-hidden="true" /> : null}
              </button>;
            })}
            <div className={graphStyles.coreCaption} aria-hidden="true"><strong>{focus?.label ?? "知识点"}</strong><small>{activeId === evidenceLinkedId ? "证据已关联" : "当前聚焦"}</small></div>
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
