"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty, KnowledgeGraphEdge, KnowledgeGraphNode } from "@echo/shared-types";
import { ExternalLink, GitBranchPlus, Network, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties } from "react";

import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import { GRAPH_THEME, riskColor, riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import type { GraphRiskLevel } from "@/features/knowledge/graph-v2/graph-types";
import styles from "./ai-neural-stage.module.css";

type Relation = KnowledgeGraphEdge["type"];
type MiniNode = { id: string; label: string; kind: KnowledgeGraphNode["type"]; risk: GraphRiskLevel; depth: number; x: number; y: number };
type MiniLink = { id: string; source: string; target: string; type: Relation; evidence: number; x1: number; y1: number; x2: number; y2: number };
const RISK_PRIORITY: Record<GraphRiskLevel, number> = { high: 4, medium: 3, elevated: 2, normal: 1, unknown: 0 };
const RELATION_LABEL: Record<Relation, string> = {
  prerequisite: "前置依赖", related: "知识关联", contains: "包含", assessed_by: "测评依据", sourced_from: "来源依据",
};
const RELATION_COLOR: Record<Relation, string> = {
  prerequisite: GRAPH_THEME.edgePrerequisite, related: GRAPH_THEME.edgeRelated,
  contains: "#7b9ace", assessed_by: "#73d6ce", sourced_from: "#b69bff",
};
const SOURCE_TYPES: Record<string, string[]> = {
  conversations: ["conversation_message"], quizzes: ["quick_check_attempt"], events: ["learning_event"],
  citations: ["message_citation", "knowledge_chunk"], mastery: ["mastery_snapshot"],
};
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic small force layout over real, typed graph edges. Does not add a second G6 instance. */
function layoutNeighborhood(nodes: Array<Omit<MiniNode, "x" | "y">>, edges: KnowledgeGraphEdge[]): { nodes: MiniNode[]; links: MiniLink[] } {
  const output: MiniNode[] = nodes.map((n, i) => {
    const angle = ((hash(n.id) % 360) * Math.PI / 180) + i * .39;
    const radius = n.depth === 0 ? 0 : n.depth === 1 ? 25 : 39;
    return { ...n, x: n.depth === 0 ? 50 : 50 + Math.cos(angle) * radius, y: n.depth === 0 ? 48 : 48 + Math.sin(angle) * radius * .72 };
  });
  const byId = new Map(output.map((n) => [n.id, n]));
  const visibleEdges = edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target).slice(0, 55);
  for (let iteration = 0; iteration < 105; iteration++) {
    for (let i = 1; i < output.length; i++) {
      const a = output[i];
      let dx = 0, dy = 0;
      for (let j = 0; j < output.length; j++) {
        if (i === j) continue;
        const b = output[j];
        const x = a.x - b.x, y = (a.y - b.y) * 1.2;
        const dist2 = Math.max(13, x*x + y*y);
        const force = 145 / dist2;
        dx += x * force * .05; dy += y * force * .05;
      }
      for (const edge of visibleEdges) {
        if (edge.source !== a.id && edge.target !== a.id) continue;
        const b = byId.get(edge.source === a.id ? edge.target : edge.source)!;
        const x = b.x - a.x, y = b.y - a.y;
        const distance = Math.max(1, Math.hypot(x, y));
        const desired = a.depth === 1 ? 23 : 19;
        const spring = (distance - desired) * .008;
        dx += x / distance * spring; dy += y / distance * spring;
      }
      const ring = a.depth === 1 ? 26 : 39;
      const distanceToCenter = Math.max(1, Math.hypot(a.x - 50, a.y - 48));
      dx += ((a.x - 50) / distanceToCenter) * (ring - distanceToCenter) * .009;
      dy += ((a.y - 48) / distanceToCenter) * (ring - distanceToCenter) * .009;
      a.x = Math.max(9, Math.min(91, a.x + dx));
      a.y = Math.max(11, Math.min(87, a.y + dy));
    }
  }
  return { nodes: output, links: visibleEdges.map((e) => ({
    id: e.id, source: e.source, target: e.target, type: e.type, evidence: e.evidence_count,
    x1: byId.get(e.source)!.x, y1: byId.get(e.source)!.y,
    x2: byId.get(e.target)!.x, y2: byId.get(e.target)!.y,
  })) };
}

function getNeighborhood(
  rawNodes: KnowledgeGraphNode[], rawEdges: KnowledgeGraphEdge[], center: string,
  risks: ReadonlyMap<string, GraphRiskLevel>,
) {
  const byId = new Map(rawNodes.map((node) => [node.id, node]));
  if (!byId.has(center)) return { nodes: [] as MiniNode[], links: [] as MiniLink[] };
  const included = new Set<string>([center]);
  const depths = new Map<string, number>([[center, 0]]);
  let frontier = [center];
  for (let depth = 1; depth <= 2; depth++) {
    const next: string[] = [];
    const maxNodes = depth === 1 ? 10 : 23;
    for (const parent of frontier) {
      const edges = rawEdges.filter((edge) => edge.source === parent || edge.target === parent)
        .sort((a, b) => {
          const ai = a.source === parent ? a.target : a.source;
          const bi = b.source === parent ? b.target : b.source;
          const ax = byId.get(ai)?.type === "knowledge_point" ? 0 : 1;
          const bx = byId.get(bi)?.type === "knowledge_point" ? 0 : 1;
          return ax - bx || RISK_PRIORITY[risks.get(bi) ?? "unknown"] - RISK_PRIORITY[risks.get(ai) ?? "unknown"] || ai.localeCompare(bi);
        });
      for (const edge of edges) {
        const neighbor = edge.source === parent ? edge.target : edge.source;
        if (included.has(neighbor) || !byId.has(neighbor)) continue;
        included.add(neighbor); depths.set(neighbor, depth); next.push(neighbor);
        if (included.size >= maxNodes) break;
      }
      if (included.size >= maxNodes) break;
    }
    frontier = next;
  }
  return layoutNeighborhood([...included].map((id) => ({
    id, label: byId.get(id)!.label, kind: byId.get(id)!.type,
    risk: byId.get(id)!.type === "knowledge_point" ? risks.get(id) ?? "unknown" : "unknown" as const,
    depth: depths.get(id) ?? 2,
  })), rawEdges);
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
  const arrowId = useId().replace(/:/g, "");
  const [choice, setChoice] = useState<{ id: string; base: string | null } | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const source = useMemo(() => graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null, [graphQuery.data, chapters]);
  const riskMap = useMemo(() => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data), [source, dashboardQuery.data]);
  const linkedId = useMemo(() => {
    if (!source) return null;
    const valid = [analysis?.knowledge_point_id, ...(analysis?.evidence.map((e) => e.knowledge_point_id) ?? [])]
      .filter((id): id is string => Boolean(id) && source.pointById.has(id!));
    return [...new Set(valid)].sort((a, b) => RISK_PRIORITY[riskMap.get(b) ?? "unknown"] - RISK_PRIORITY[riskMap.get(a) ?? "unknown"])[0] ?? null;
  }, [source, analysis, riskMap]);
  const evidenceLinkedId = useMemo(() => {
    if (!activeEvidenceId || !source) return null;
    const types = SOURCE_TYPES[activeEvidenceId] ?? [];
    return analysis?.evidence.find((e) => types.includes(e.source_type) && e.knowledge_point_id && source.pointById.has(e.knowledge_point_id))?.knowledge_point_id ?? null;
  }, [analysis, activeEvidenceId, source]);
  const knownHighRisk = dashboardQuery.data?.high_risk_knowledge_points.find((p) => source?.pointById.has(p.knowledge_point_id))?.knowledge_point_id ?? null;
  const difficultyId = fallbackDifficulty?.knowledge_point_id && source?.pointById.has(fallbackDifficulty.knowledge_point_id) ? fallbackDifficulty.knowledge_point_id : null;
  const baseId = linkedId ?? knownHighRisk ?? difficultyId ?? source?.defaultFocusId ?? null;
  // A transient evidence highlight is explicitly a relation, not an AI high-risk verdict.
  const selectedId = choice?.base === baseId && choice?.id && source?.pointById.has(choice.id) ? choice.id : baseId;
  const activeId = evidenceLinkedId ?? selectedId;
  const focus = activeId ? source?.pointById.get(activeId) ?? null : null;
  const activeRisk = activeId ? riskMap.get(activeId) ?? "unknown" : "unknown";
  const view = useMemo(() => activeId && source ? getNeighborhood(source.graph.nodes, source.graph.edges, activeId, riskMap) : { nodes: [], links: [] }, [source, activeId, riskMap]);
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph`;
  const focusHref = activeId ? `${graphHref}&pointId=${encodeURIComponent(activeId)}` : graphHref;
  const contextLabel = evidenceLinkedId ? "当前证据关联知识点" : linkedId ? "本次分析关联知识点" : knownHighRisk ? "课程风险知识点" : "课程知识结构";
  const relatedEdges = view.links.filter((edge) => edge.source === activeId || edge.target === activeId);
  const relationCounts = relatedEdges.reduce((map, edge) => map.set(edge.type, (map.get(edge.type) ?? 0) + 1), new Map<Relation, number>());
  const hasGraph = Boolean(source?.points.length);
  const hasVerifiedRisk = [...riskMap.values()].some((risk) => risk === "high" || risk === "medium");
  return (
    <section aria-label="动态课程知识图谱" className={styles.graphPanel} data-ai-graph="true">
      <div className={styles.graphHeader}>
        <div className={styles.graphTitle}><Network size={17} /><strong>动态课程知识图谱</strong></div>
        <button aria-pressed={riskOnly} disabled={!hasVerifiedRisk} title={hasVerifiedRisk ? "仅突出有真实风险依据的节点" : "当前没有已确认的风险节点"} className={styles.graphToggle} onClick={() => setRiskOnly((v) => !v)} type="button">{!hasVerifiedRisk ? "暂无风险" : riskOnly ? "全部关系" : "突出风险"}</button>
      </div>
      <p className={styles.graphSubtitle}>{source ? `${source.points.length} 个知识点 · ${source.graph.edges.length} 条源数据关系` : "课程图谱 · 真实关系"}</p>
      {graphQuery.isLoading ? <div className={styles.graphPlaceholder} role="status">正在加载真实知识图谱…</div> :
      graphQuery.isError ? <div className={styles.graphPlaceholder} role="alert">图谱获取失败 <button type="button" onClick={() => void graphQuery.refetch()}>重试</button></div> :
      !hasGraph ? <div className={styles.graphPlaceholder}>暂无图谱数据 · 等待课程知识结构</div> : (
        <>
          <div className={styles.graphUniverse}>
            <svg aria-label="知识点真实连接及关系方向" role="img" viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.graphEdges}>
              <defs>
                <radialGradient id={`${arrowId}-coreGlow`}><stop offset="0" stopColor="#dff8ff" stopOpacity=".95"/><stop offset=".35" stopColor="#5bc7ff" stopOpacity=".55"/><stop offset="1" stopColor="#5bc7ff" stopOpacity="0"/></radialGradient>
                <filter id={`${arrowId}-softGlow`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                {(Object.keys(RELATION_COLOR) as Relation[]).map((type) => (
                <marker key={type} id={`${arrowId}-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 Z" fill={RELATION_COLOR[type]} />
                </marker>
              ))}</defs>
              {activeId ? <><circle cx="50" cy="48" r="20" fill={`url(#${arrowId}-coreGlow)`} opacity=".55"/><circle cx="50" cy="48" r="13" fill="none" stroke="#65d9ff" strokeOpacity=".28" strokeDasharray="1 3" className={styles.graphCoreOrbit}/><circle cx="50" cy="48" r="18" fill="none" stroke="#9d83ff" strokeOpacity=".22" strokeDasharray=".8 4" className={styles.graphCoreOrbitReverse}/></> : null}
              {view.links.map((edge) => {
                const attached = edge.source === activeId || edge.target === activeId;
                const highlighted = hovered && (edge.source === hovered || edge.target === hovered);
                const high = [edge.source, edge.target].some((id) => riskMap.get(id) === "high");
                return (
                  <g key={edge.id} opacity={riskOnly && !high ? .09 : hovered && !highlighted ? .20 : attached || highlighted ? .95 : .47}>
                    <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke={RELATION_COLOR[edge.type]} strokeWidth={attached || highlighted ? .55 : .30} strokeDasharray={edge.type === "related" ? "1.5 1" : undefined} markerEnd={`url(#${arrowId}-${edge.type})`} />
                    {(attached || highlighted) && <line className={styles.graphEdgeFlow} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke={RELATION_COLOR[edge.type]} strokeWidth=".75" strokeDasharray="1 15" />}
                    <title>{RELATION_LABEL[edge.type]}：{edge.source === activeId ? focus?.label : source?.graph.nodes.find((n) => n.id === edge.source)?.label} → {source?.graph.nodes.find((n) => n.id === edge.target)?.label} · {edge.evidence} 条依据</title>
                  </g>
                );
              })}
            </svg>
            {view.nodes.map((node) => {
              const selected = node.id === activeId;
              const dim = riskOnly && node.risk !== "high" && node.risk !== "medium" && !selected;
              return (
                <button key={node.id} type="button" className={`${styles.graphNode} ${selected ? styles.graphNodeSelected : ""} ${dim ? styles.graphNodeDim : ""} ${node.kind !== "knowledge_point" ? styles.graphPeripheralNode : ""}`}
                  aria-label={`${node.label}，${node.kind === "knowledge_point" ? riskLabel(node.risk) : node.kind}${selected ? "，当前聚焦" : ""}`}
                  aria-pressed={selected} disabled={node.kind !== "knowledge_point"} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)}
                  onClick={() => { if (source?.pointById.has(node.id)) setChoice({ id: node.id, base: baseId }); }}
                  style={{ left: `${node.x}%`, top: `${node.y}%`, "--node-color": node.kind === "knowledge_point" ? riskColor(node.risk) : "#7a91b2" } as CSSProperties}
                  title={`${node.label} · ${node.kind === "knowledge_point" ? riskLabel(node.risk) : node.kind}`}>
                  <span className={styles.graphNodeLight} />
                  {selected ? <><span className={styles.graphNodeHalo} /><span className={styles.graphNodeSatellite} /></> : null}
                  {(selected || hovered === node.id || (node.depth === 1 && node.label.length <= 7)) ? <span className={styles.graphNodeLabel}>{node.label}</span> : null}
                </button>
              );
            })}
          </div>
          <div className={styles.graphRelations} aria-label="聚焦知识点真实关系类型">
            {relationCounts.size ? [...relationCounts.entries()].map(([type, count]) => <span key={type} title={`${RELATION_LABEL[type]} · ${count} 条`}><i style={{ backgroundColor: RELATION_COLOR[type] }} />{RELATION_LABEL[type]} {count}</span>) : <span>暂无直接关联的关系</span>}
          </div>
        </>
      )}
      <div className={styles.graphLegend}>
        <span><i style={{ backgroundColor: riskColor("normal") }} />正常</span>
        <span><i style={{ backgroundColor: riskColor("high") }} />高风险</span>
        <span><i style={{ backgroundColor: riskColor("unknown") }} />暂无学情</span>
      </div>
      <div className={styles.graphFocus}>
        <div className={styles.graphFocusText}><small>{contextLabel} · {riskLabel(activeRisk)}</small><strong>{focus?.label ?? "暂无聚焦知识点"}</strong></div>
        {choice?.base === baseId && !evidenceLinkedId ? <button aria-label="恢复默认聚焦" className={styles.graphReset} onClick={() => setChoice(null)} type="button"><RotateCcw size={15} /></button> : null}
        <Link href={focusHref} className={styles.graphOpen}><GitBranchPlus size={14} />图谱定位<ExternalLink size={12} /></Link>
      </div>
    </section>
  );
}
