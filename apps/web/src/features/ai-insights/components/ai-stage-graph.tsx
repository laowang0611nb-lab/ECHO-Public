"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty, KnowledgeGraphEdge, KnowledgeGraphNode } from "@echo/shared-types";
import { ExternalLink, GitBranchPlus, Network, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties } from "react";

import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import { GRAPH_THEME, riskColor, riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import type { GraphRiskLevel } from "@/features/knowledge/graph-v2/graph-types";
import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import styles from "./ai-neural-stage.module.css";

type Relation = KnowledgeGraphEdge["type"];
type MiniNode = {
  id: string;
  label: string;
  kind: KnowledgeGraphNode["type"];
  risk: GraphRiskLevel;
  depth: number;
  x: number;
  y: number;
  size: number;
  cluster: number;
  degree: number;
};
type MiniLink = {
  id: string;
  source: string;
  target: string;
  type: Relation;
  evidence: number;
  sourceIndex: number;
  targetIndex: number;
  path: string;
};

const RISK_PRIORITY: Record<GraphRiskLevel, number> = { high: 4, medium: 3, elevated: 2, normal: 1, unknown: 0 };
const RELATION_LABEL: Record<Relation, string> = {
  prerequisite: "前置依赖",
  related: "知识关联",
  contains: "包含",
  assessed_by: "测评依据",
  sourced_from: "来源依据",
};
const RELATION_COLOR: Record<Relation, string> = {
  prerequisite: GRAPH_THEME.edgePrerequisite,
  related: GRAPH_THEME.edgeRelated,
  contains: "#7b9ace",
  assessed_by: "#73d6ce",
  sourced_from: "#b69bff",
};
const SOURCE_TYPES: Record<string, string[]> = {
  conversations: ["conversation_message"],
  quizzes: ["quick_check_attempt"],
  events: ["learning_event"],
  citations: ["message_citation", "knowledge_chunk"],
  mastery: ["mastery_snapshot"],
};

function relationWeight(type: Relation) {
  switch (type) {
    case "prerequisite": return 5;
    case "contains": return 4;
    case "assessed_by": return 3;
    case "related": return 2;
    case "sourced_from": return 1;
    default: return 0;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function midCurvePath(x1: number, y1: number, x2: number, y2: number, bend = 0.18) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const controlX = mx + nx * length * bend;
  const controlY = my + ny * length * bend;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function getNeighborhood(rawNodes: KnowledgeGraphNode[], rawEdges: KnowledgeGraphEdge[], center: string, risks: ReadonlyMap<string, GraphRiskLevel>) {
  const byId = new Map(rawNodes.map((node) => [node.id, node]));
  if (!byId.has(center)) return { nodes: [] as MiniNode[], links: [] as MiniLink[] };

  const adjacency = new Map<string, KnowledgeGraphEdge[]>();
  for (const edge of rawEdges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge]);
  }

  const sortNeighbors = (a: string, b: string) => {
    const an = byId.get(a);
    const bn = byId.get(b);
    const ak = an?.type === "knowledge_point" ? 0 : 1;
    const bk = bn?.type === "knowledge_point" ? 0 : 1;
    const ar = RISK_PRIORITY[risks.get(a) ?? "unknown"];
    const br = RISK_PRIORITY[risks.get(b) ?? "unknown"];
    const ad = adjacency.get(a)?.length ?? 0;
    const bd = adjacency.get(b)?.length ?? 0;
    return ak - bk || br - ar || bd - ad || a.localeCompare(b);
  };

  const included = new Set<string>([center]);
  const depth = new Map<string, number>([[center, 0]]);
  const parent = new Map<string, string>();
  const firstRing: string[] = [];
  const secondRing: string[] = [];

  const firstCandidates = (adjacency.get(center) ?? [])
    .map((edge) => (edge.source === center ? edge.target : edge.source))
    .filter((id, index, self) => byId.has(id) && self.indexOf(id) === index)
    .sort(sortNeighbors)
    .slice(0, 8);

  for (const id of firstCandidates) {
    included.add(id);
    depth.set(id, 1);
    parent.set(id, center);
    firstRing.push(id);
  }

  for (const seed of firstRing) {
    const secondCandidates = (adjacency.get(seed) ?? [])
      .map((edge) => (edge.source === seed ? edge.target : edge.source))
      .filter((id) => byId.has(id) && id !== center && !included.has(id))
      .sort(sortNeighbors)
      .slice(0, 2);
    for (const id of secondCandidates) {
      if (included.size >= 22) break;
      included.add(id);
      depth.set(id, 2);
      parent.set(id, seed);
      secondRing.push(id);
    }
    if (included.size >= 22) break;
  }

  const centerNode: MiniNode = {
    id: center,
    label: byId.get(center)!.label,
    kind: byId.get(center)!.type,
    risk: risks.get(center) ?? "unknown",
    depth: 0,
    x: 51,
    y: 51,
    size: 11.6,
    cluster: -1,
    degree: adjacency.get(center)?.length ?? 0,
  };

  const nodes: MiniNode[] = [centerNode];
  const firstTotal = Math.max(1, firstRing.length);
  firstRing.forEach((id, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / firstTotal) * index;
    const rx = 29;
    const ry = 21;
    nodes.push({
      id,
      label: byId.get(id)!.label,
      kind: byId.get(id)!.type,
      risk: byId.get(id)!.type === "knowledge_point" ? risks.get(id) ?? "unknown" : "unknown",
      depth: 1,
      x: 51 + Math.cos(angle) * rx,
      y: 51 + Math.sin(angle) * ry,
      size: 7.1,
      cluster: index,
      degree: adjacency.get(id)?.length ?? 0,
    });
  });

  const firstIndexById = new Map(firstRing.map((id, index) => [id, index]));
  const secondClusters = new Map<number, string[]>();
  for (const id of secondRing) {
    const p = parent.get(id);
    const cluster = p ? firstIndexById.get(p) ?? 0 : 0;
    secondClusters.set(cluster, [...(secondClusters.get(cluster) ?? []), id]);
  }

  for (const [cluster, ids] of secondClusters.entries()) {
    const anchor = (-Math.PI / 2) + ((Math.PI * 2) / Math.max(1, firstTotal)) * cluster;
    ids.forEach((id, localIndex) => {
      const spread = ids.length === 1 ? 0 : (localIndex - (ids.length - 1) / 2) * 0.32;
      const angle = anchor + spread;
      const rx = 40;
      const ry = 30;
      nodes.push({
        id,
        label: byId.get(id)!.label,
        kind: byId.get(id)!.type,
        risk: byId.get(id)!.type === "knowledge_point" ? risks.get(id) ?? "unknown" : "unknown",
        depth: 2,
        x: clamp(51 + Math.cos(angle) * rx, 9, 93),
        y: clamp(51 + Math.sin(angle) * ry, 12, 90),
        size: 4.9,
        cluster,
        degree: adjacency.get(id)?.length ?? 0,
      });
    });
  }

  const nodeMap = new Map(nodes.map((node, index) => [node.id, { ...node, index }]));
  const visibleEdges = rawEdges.filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target) && edge.source !== edge.target);
  const deduped = new Map<string, KnowledgeGraphEdge>();
  visibleEdges.forEach((edge) => {
    const a = edge.source;
    const b = edge.target;
    const key = [a, b, edge.type].join("::");
    const current = deduped.get(key);
    if (!current || edge.evidence_count > current.evidence_count) deduped.set(key, edge);
  });

  const links: MiniLink[] = [...deduped.values()]
    .sort((a, b) => relationWeight(b.type) - relationWeight(a.type) || b.evidence_count - a.evidence_count)
    .slice(0, 44)
    .map((edge) => {
      const sourceNode = nodeMap.get(edge.source)!;
      const targetNode = nodeMap.get(edge.target)!;
      const attachedToCenter = edge.source === center || edge.target === center;
      const sameCluster = sourceNode.cluster >= 0 && sourceNode.cluster === targetNode.cluster;
      const bend = attachedToCenter ? 0.08 : sameCluster ? 0.12 : 0.19;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        evidence: edge.evidence_count,
        sourceIndex: sourceNode.index,
        targetIndex: targetNode.index,
        path: midCurvePath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, bend),
      };
    });

  return { nodes, links };
}

export function AiStageGraph({
  analysis,
  chapters,
  courseId,
  fallbackDifficulty,
  activeEvidenceId,
  paused = false,
}: {
  analysis: AIAnalysis | null;
  chapters: Chapter[];
  courseId: string;
  fallbackDifficulty: DashboardLearningDifficulty | null;
  activeEvidenceId?: string | null;
  paused?: boolean;
}) {
  const graphQuery = useKnowledgeGraph(courseId);
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const arrowId = useId().replace(/:/g, "");
  const [choice, setChoice] = useState<{ id: string; base: string | null } | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const source = useMemo(() => (graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null), [graphQuery.data, chapters]);
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
  const selectedId = choice?.base === baseId && choice?.id && source?.pointById.has(choice.id) ? choice.id : baseId;
  const activeId = evidenceLinkedId ?? selectedId;
  const focus = activeId ? source?.pointById.get(activeId) ?? null : null;
  const activeRisk = activeId ? riskMap.get(activeId) ?? "unknown" : "unknown";
  const view = useMemo(() => (activeId && source ? getNeighborhood(source.graph.nodes, source.graph.edges, activeId, riskMap) : { nodes: [], links: [] }), [source, activeId, riskMap]);
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph`;
  const focusHref = activeId ? `${graphHref}&pointId=${encodeURIComponent(activeId)}` : graphHref;
  const contextLabel = evidenceLinkedId
    ? "当前证据关联知识点"
    : linkedId
      ? "本次分析关联知识点"
      : knownHighRisk
        ? "课程风险知识点"
        : "课程知识结构";
  const hasGraph = Boolean(source?.points.length);
  const hasVerifiedRisk = [...riskMap.values()].some((risk) => risk === "high" || risk === "medium");

  const relationCounts = view.links.reduce((map, edge) => map.set(edge.type, (map.get(edge.type) ?? 0) + 1), new Map<Relation, number>());
  const visibleNodes = riskOnly ? view.nodes.filter((node) => node.id === activeId || node.risk === "high" || node.risk === "medium") : view.nodes;
  const visibleSet = new Set(visibleNodes.map((node) => node.id));
  const visibleLinks = view.links.filter((edge) => visibleSet.has(edge.source) && visibleSet.has(edge.target));
  const nodeCount = visibleNodes.filter((node) => node.kind === "knowledge_point").length;
  const activeNodeLinks = visibleLinks.filter((edge) => edge.source === activeId || edge.target === activeId).length;

  return (
    <section aria-label="动态课程知识图谱" className={styles.graphPanel} data-ai-graph="true">
      <div className={styles.graphHeader}>
        <div className={styles.graphTitle}><Network size={17} /><strong>动态课程知识图谱</strong></div>
        <div className={styles.graphTabs}>
          <button type="button" className={`${styles.graphTab} ${!riskOnly ? styles.graphTabActive : ""}`} onClick={() => setRiskOnly(false)} aria-pressed={!riskOnly}>知识结构</button>
          <button type="button" className={`${styles.graphTab} ${riskOnly ? styles.graphTabActive : ""}`} onClick={() => setRiskOnly(true)} disabled={!hasVerifiedRisk} aria-pressed={riskOnly} title={hasVerifiedRisk ? "仅突出真实风险节点" : "当前没有已确认风险节点"}>风险视图</button>
        </div>
      </div>

      <p className={styles.graphSubtitle}>{source ? `${source.points.length} 个知识点 · ${source.graph.edges.length} 条源数据关系` : "课程图谱 · 真实关系"}</p>
      <div className={styles.graphStats}>
        <span><Sparkles size={12} />局部节点 {nodeCount}</span>
        <span><GitBranchPlus size={12} />局部关系 {visibleLinks.length}</span>
        <span><ExternalLink size={12} />当前连接 {activeNodeLinks}</span>
      </div>

      {graphQuery.isLoading ? <div className={styles.graphPlaceholder} role="status">正在加载真实知识图谱…</div> :
      graphQuery.isError ? <div className={styles.graphPlaceholder} role="alert">图谱获取失败 <button type="button" onClick={() => void graphQuery.refetch()}>重试</button></div> :
      !hasGraph ? <div className={styles.graphPlaceholder}>暂无图谱数据 · 等待课程知识结构</div> : (
        <>
          <div className={styles.graphUniverse}>
            <div className={styles.graphAmbientHalo} aria-hidden="true" />
            <div className={styles.graphAmbientRings} aria-hidden="true"><span /><span /><span /></div>
            <svg aria-label="知识点真实连接及关系方向" role="img" viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.graphEdges}>
              <defs>
                {(Object.keys(RELATION_COLOR) as Relation[]).map((type) => (
                  <marker key={type} id={`${arrowId}-${type}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                    <path d="M 0 1 L 9 5 L 0 9 Z" fill={RELATION_COLOR[type]} opacity="0.9" />
                  </marker>
                ))}
              </defs>
              {visibleLinks.map((edge, index) => {
                const highlighted = hovered ? edge.source === hovered || edge.target === hovered : edge.source === activeId || edge.target === activeId;
                const high = [edge.source, edge.target].some((id) => riskMap.get(id) === "high");
                const medium = [edge.source, edge.target].some((id) => riskMap.get(id) === "medium");
                const edgeOpacity = riskOnly ? (high ? 0.96 : medium ? 0.62 : 0.12) : highlighted ? 0.98 : 0.42;
                const edgeWidth = highlighted ? 0.85 : high ? 0.62 : 0.44;
                return (
                  <g key={edge.id} opacity={edgeOpacity}>
                    <path d={edge.path} fill="none" stroke={RELATION_COLOR[edge.type]} strokeWidth={edgeWidth + 0.8} opacity={0.14} />
                    <path d={edge.path} fill="none" stroke={RELATION_COLOR[edge.type]} strokeWidth={edgeWidth} strokeDasharray={edge.type === "related" ? "1.6 1.1" : undefined} markerEnd={`url(#${arrowId}-${edge.type})`} />
                    {!paused ? (
                      <>
                        <path d={edge.path} className={styles.graphEdgeFlow} stroke={RELATION_COLOR[edge.type]} strokeWidth={highlighted ? 1.05 : 0.76} strokeDasharray={highlighted ? "4 16" : "3 17"} style={{ animationDuration: `${highlighted ? 3.8 : 6.6}s`, animationDelay: `${-index * 0.35}s` }} />
                        <circle r={highlighted ? 1.05 : 0.8} fill={RELATION_COLOR[edge.type]} opacity={0.95}>
                          <animateMotion path={edge.path} dur={`${highlighted ? 3.2 : 5.6}s`} repeatCount="indefinite" begin={`${-index * 0.42}s`} />
                        </circle>
                      </>
                    ) : null}
                    <title>{RELATION_LABEL[edge.type]} · {edge.evidence} 条依据</title>
                  </g>
                );
              })}
            </svg>

            {visibleNodes.map((node) => {
              const selected = node.id === activeId;
              const isHovered = hovered === node.id;
              const kindLabel = node.kind === "knowledge_point" ? riskLabel(node.risk) : node.kind;
              const halo = node.depth === 0 ? 1 : node.risk === "high" ? 0.92 : node.risk === "medium" ? 0.75 : 0.58;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`${styles.graphNode} ${selected ? styles.graphNodeSelected : ""} ${node.kind !== "knowledge_point" ? styles.graphPeripheralNode : ""}`}
                  aria-label={`${node.label}，${kindLabel}${selected ? "，当前聚焦" : ""}`}
                  aria-pressed={selected}
                  disabled={node.kind !== "knowledge_point"}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(node.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    if (source?.pointById.has(node.id)) setChoice({ id: node.id, base: baseId });
                  }}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    width: `${node.size * 1.3}px`,
                    height: `${node.size * 1.3}px`,
                    "--node-color": node.kind === "knowledge_point" ? riskColor(node.risk) : "#8196b6",
                    "--node-halo": `${halo}`,
                  } as CSSProperties}
                  title={`${node.label} · ${kindLabel}`}
                >
                  <span className={styles.graphNodePulse} />
                  <span className={styles.graphNodeLight} />
                  {(selected || isHovered || node.depth === 1) ? <span className={styles.graphNodeLabel}>{node.label}</span> : null}
                </button>
              );
            })}
          </div>

          <div className={styles.graphRelations} aria-label="当前局部图中的真实关系类型">
            {(Object.keys(RELATION_LABEL) as Relation[]).map((type) => (
              <span key={type} title={`${RELATION_LABEL[type]} · ${relationCounts.get(type) ?? 0} 条`}>
                <i style={{ backgroundColor: RELATION_COLOR[type] }} />{RELATION_LABEL[type]} {relationCounts.get(type) ?? 0}
              </span>
            ))}
          </div>
        </>
      )}

      <div className={styles.graphLegend}>
        <span><i style={{ backgroundColor: riskColor("normal") }} />正常</span>
        <span><i style={{ backgroundColor: riskColor("high") }} />高风险</span>
        <span><i style={{ backgroundColor: riskColor("medium") }} />需关注</span>
        <span><i style={{ backgroundColor: riskColor("unknown") }} />暂无学情</span>
      </div>

      <div className={styles.graphFocus}>
        <div className={styles.graphFocusText}>
          <small>{contextLabel} · {riskLabel(activeRisk)}</small>
          <strong>{focus?.label ?? "暂无聚焦知识点"}</strong>
        </div>
        {choice?.base === baseId && !evidenceLinkedId ? <button aria-label="恢复默认聚焦" className={styles.graphReset} onClick={() => setChoice(null)} type="button"><RotateCcw size={15} /></button> : null}
        <Link href={focusHref} className={styles.graphOpen}><GitBranchPlus size={14} />图谱定位<ExternalLink size={12} /></Link>
      </div>
    </section>
  );
}
