"use client";

import type { AIAnalysis, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Network, RotateCcw } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { useKnowledgeCourseDashboard, useKnowledgeGraph } from "@/features/knowledge/queries";
import { buildGraphSource } from "@/features/knowledge/graph-v2/graph-adapter";
import { riskMapFromDashboard } from "@/features/knowledge/graph-v2/graph-risk";
import { riskLabel } from "@/features/knowledge/graph-v2/graph-theme";
import type { GraphRiskLevel } from "@/features/knowledge/graph-v2/graph-types";
import { directRelations, isRisk, layoutBranches, RELATIONS_PER_PAGE, type FocusRelation, type NodeBox } from "./ai-stage-graph-layout";
import stageStyles from "./ai-neural-stage.module.css";
import s from "./ai-stage-graph.module.css";

const PRIORITY: Record<GraphRiskLevel, number> = { high: 5, medium: 4, elevated: 3, normal: 2, unknown: 1 };
const SOURCE_TYPES: Record<string, string[]> = {
  conversations: ["conversation_message"], quizzes: ["quick_check_attempt"], events: ["learning_event"],
  citations: ["message_citation", "knowledge_chunk"], mastery: ["mastery_snapshot"],
};
const RISK_COLORS: Record<GraphRiskLevel, string> = { high: "#ffb36d", medium: "#ff9c86", elevated: "#f6cd80", normal: "#7ac4ec", unknown: "#8194ae" };
const boxStyle = (box: NodeBox) => ({ left: box.x, top: box.y, width: box.width, height: box.height });

function relationDescription(relation: FocusRelation, focus: string) {
  return relation.edges.map((edge) => {
    if (edge.type === "related") return `${focus} 与 ${relation.point.label}：知识关联`;
    return edge.source === relation.point.id ? `${relation.point.label} → ${focus}：前置依赖` : `${focus} → ${relation.point.label}：前置依赖`;
  }).join("；");
}

export function AiStageGraph({ analysis, chapters, courseId, fallbackDifficulty, activeEvidenceId }: {
  analysis: AIAnalysis | null;
  chapters: Chapter[];
  courseId: string;
  fallbackDifficulty: DashboardLearningDifficulty | null;
  activeEvidenceId?: string | null;
}) {
  const graphQuery = useKnowledgeGraph(courseId, {
    scope: "full",
    maxNodes: 160,
  });
  const dashboardQuery = useKnowledgeCourseDashboard(courseId);
  const source = useMemo(() => graphQuery.data ? buildGraphSource(graphQuery.data, chapters) : null, [graphQuery.data, chapters]);
  const riskMap = useMemo(() => riskMapFromDashboard(source?.points ?? [], dashboardQuery.data), [source, dashboardQuery.data]);
  const linkedId = useMemo(() => {
    if (!source) return null;
    const ids = [analysis?.knowledge_point_id, ...(analysis?.evidence.map((e) => e.knowledge_point_id) ?? [])]
      .filter((id): id is string => typeof id === "string" && source.pointById.has(id));
    return [...new Set(ids)].sort((a, b) => PRIORITY[riskMap.get(b) ?? "unknown"] - PRIORITY[riskMap.get(a) ?? "unknown"])[0] ?? null;
  }, [analysis, riskMap, source]);
  const evidenceId = useMemo(() => {
    if (!activeEvidenceId || !source || !analysis) return null;
    const types = SOURCE_TYPES[activeEvidenceId] ?? [];
    return analysis.evidence.find((e) => (e.id === activeEvidenceId || types.includes(e.source_type)) && e.knowledge_point_id && source.pointById.has(e.knowledge_point_id))?.knowledge_point_id ?? null;
  }, [activeEvidenceId, analysis, source]);
  const highRiskId = dashboardQuery.data?.high_risk_knowledge_points.find((p) => source?.pointById.has(p.knowledge_point_id))?.knowledge_point_id;
  const difficultyId = fallbackDifficulty?.knowledge_point_id && source?.pointById.has(fallbackDifficulty.knowledge_point_id) ? fallbackDifficulty.knowledge_point_id : null;
  const baseId = evidenceId ?? linkedId ?? highRiskId ?? difficultyId ?? source?.defaultFocusId ?? null;
  // A new course/analysis/evidence context resets exploration without stale cross-course IDs.
  const context = JSON.stringify([courseId, analysis?.id, activeEvidenceId, baseId]);
  const [navigation, setNavigation] = useState<{ context: string; ids: string[] } | null>(null);
  const trail = navigation?.context === context ? navigation.ids.filter((id) => source?.pointById.has(id)) : [];
  const activeId = trail[trail.length - 1] ?? baseId;
  const focus = activeId ? source?.pointById.get(activeId) : undefined;
  const reducedMotion = useReducedMotion();
  const [moving, setMoving] = useState(false);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (motionTimer.current) clearTimeout(motionTimer.current); }, []);
  const beginMove = () => {
    if (motionTimer.current) clearTimeout(motionTimer.current);
    if (reducedMotion) { setMoving(false); return; }
    setMoving(true);
    motionTimer.current = setTimeout(() => setMoving(false), 620);
  };
  const [riskOnly, setRiskOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [paging, setPaging] = useState({ key: "", page: 0 });
  const relations = source && activeId ? directRelations(source, activeId) : [];
  const risky = relations.filter((r) => isRisk(riskMap.get(r.point.id)));
  const previousId = trail.length > 1 ? trail[trail.length - 2] : null;
  const previous = previousId ? source?.pointById.get(previousId) : undefined;
  // Keep the old center visible on the first page: it visibly becomes a neighbor.
  const ordered = previousId ? [...relations].sort((a, b) => Number(b.point.id === previousId) - Number(a.point.id === previousId)) : relations;
  const filtered = riskOnly ? ordered.filter((r) => isRisk(riskMap.get(r.point.id))) : ordered;
  const pageCount = Math.max(1, Math.ceil(filtered.length / RELATIONS_PER_PAGE));
  const pageKey = JSON.stringify([context, activeId, riskOnly]);
  const page = paging.key === pageKey ? Math.min(paging.page, pageCount - 1) : 0;
  const visible = filtered.slice(page * RELATIONS_PER_PAGE, (page + 1) * RELATIONS_PER_PAGE);
  const currentHover = visible.find((r) => r.point.id === hovered);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 300, height: 224 });
  const ready = Boolean(focus && !graphQuery.isLoading && !graphQuery.isError);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setViewport((old) => Math.abs(old.width - width) < .5 && Math.abs(old.height - height) < .5 ? old : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);
  const layout = layoutBranches(viewport.width, viewport.height, visible.length);
  const arrowId = `relation-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const graphHref = `/knowledge?courseId=${encodeURIComponent(courseId)}&tab=graph${activeId ? `&pointId=${encodeURIComponent(activeId)}` : ""}`;
  const contextLabel = trail.length > 0 ? "自主探索" : evidenceId ? "证据联动" : linkedId ? "分析聚焦" : highRiskId ? "风险聚焦" : "课程结构";
  const openNode = (id: string) => {
    if (id === activeId || moving) return;
    beginMove();
    setHovered(null);
    setRiskOnly(false);
    setNavigation({ context, ids: id === previousId ? trail.slice(0, -1) : [...(trail.length ? trail : activeId ? [activeId] : []), id].slice(-30) });
  };
  const changePage = (next: number) => { if (moving) return; beginMove(); setHovered(null); setPaging({ key: pageKey, page: next }); };
  const sceneKey = JSON.stringify([context, activeId, riskOnly, page, viewport.width, viewport.height]);
  // Stable DOM order lets retained nodes keep their motion state when their roles swap.
  const renderedNodes = focus ? [
    { id: focus.id, label: focus.label, root: true, box: layout.root, relation: null as FocusRelation | null },
    ...visible.map((relation, i) => ({ id: relation.point.id, label: relation.point.label, root: false, box: layout.leaves[i], relation })),
  ].sort((a, b) => a.id.localeCompare(b.id)) : [];

  return (
    <section className={`${stageStyles.graphPanel} ${s.panel}`} aria-label="课程知识关系" data-ai-graph="true" data-graph-revision="readable-v5">
      <header className={s.header}>
        <span className={s.icon}><Network size={17} /></span>
        <div className={s.heading}><strong>知识关系</strong><small>{source ? `课程 ${source.points.length} 个知识点 · ${source.semanticEdges.length} 条关系` : "课程知识结构"}</small></div>
        <span className={s.context}>{contextLabel}</span>
      </header>
      <div className={s.toolbar}>
        <button type="button" className={!riskOnly ? s.tabActive : s.tab} aria-pressed={!riskOnly} disabled={moving} onClick={() => { beginMove(); setHovered(null); setRiskOnly(false); }}>直接关系 <b>{relations.length}</b></button>
        <button type="button" className={riskOnly ? s.tabActive : s.tab} aria-pressed={riskOnly} disabled={moving} onClick={() => { beginMove(); setHovered(null); setRiskOnly(true); }}>风险点 <b>{risky.length}</b></button>
        <div className={s.history}>
          <button type="button" title="返回上一知识点" aria-label="返回上一知识点" disabled={trail.length < 2 || moving} onClick={() => { beginMove(); setHovered(null); setRiskOnly(false); setNavigation({ context, ids: trail.slice(0, -1) }); }}><ArrowLeft size={14} /></button>
          <button type="button" title="恢复默认聚焦" aria-label="恢复默认聚焦" disabled={moving || (trail.length === 0 && !riskOnly)} onClick={() => { beginMove(); setHovered(null); setNavigation(null); setRiskOnly(false); setPaging({ key: "", page: 0 }); }}><RotateCcw size={13} /></button>
        </div>
      </div>
      {graphQuery.isLoading ? <div className={s.placeholder} role="status">正在加载课程知识关系…</div>
        : graphQuery.isError ? <div className={s.placeholder} role="alert">知识图谱加载失败<button type="button" onClick={() => void graphQuery.refetch()}>重新加载</button></div>
        : !focus ? <div className={s.placeholder}>暂无课程知识点</div>
        : <>
          <div ref={canvasRef} className={s.canvas} aria-label="当前知识点的直接关系">
            <motion.svg key={sceneKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .18, delay: reducedMotion ? 0 : .42 }} className={s.connectors} viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="#8cd8ef" strokeWidth="1.3" /></marker></defs>
              {layout.spine && <path d={layout.spine} className={s.spine} />}
              {visible.map((relation, i) => {
                const box = layout.leaves[i];
                return <g key={relation.point.id} data-relation-edge={relation.point.id}>
                  <path d={box.branch} className={relation.incoming || relation.outgoing ? s.dependency : s.association} />
                  {(relation.incoming || relation.outgoing) && <path d={box.direction} className={s.dependency} markerStart={relation.incoming ? `url(#${arrowId})` : undefined} markerEnd={relation.outgoing ? `url(#${arrowId})` : undefined} />}
                  {visible.length > 1 && <circle cx={layout.middle} cy={box.portY} r="2.3" className={s.junction} />}
                  <circle cx={box.portX} cy={box.portY} r="2.4" className={s.port} />
                </g>;
              })}
              {currentHover && <path d={layout.leaves[visible.indexOf(currentHover)].highlight} className={s.trace} pathLength="100" />}
            </motion.svg>
            <AnimatePresence>
              {renderedNodes.map((node) => {
                const risk = riskMap.get(node.id) ?? "unknown";
                const description = node.relation ? relationDescription(node.relation, focus.label) : `${focus.label} · 当前知识点`;
                return <motion.button key={node.id} type="button" className={node.root ? s.focusNode : s.node}
                  initial={{ ...boxStyle(node.box), opacity: 0 }}
                  animate={{ ...boxStyle(node.box), opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : .1 } }}
                  transition={{ duration: reducedMotion ? 0 : .42, ease: [.22, 1, .36, 1], opacity: { duration: reducedMotion ? 0 : .2, delay: reducedMotion ? 0 : .32 } }}
                  style={{ "--risk-color": RISK_COLORS[risk] } as CSSProperties}
                  data-graph-node={node.id} data-root={node.root} data-active={hovered === node.id} data-risk={isRisk(risk)}
                  disabled={moving} aria-pressed={node.root}
                  onPointerEnter={() => { if (!node.root && !moving) setHovered(node.id); }} onPointerLeave={() => setHovered(null)}
                  onFocus={() => { if (!node.root && !moving) setHovered(node.id); }} onBlur={() => setHovered(null)} onClick={() => { if (!node.root) openNode(node.id); }}
                  aria-label={`${node.label}，${node.root ? "当前知识点" : `${node.relation!.label}，${riskLabel(risk)}，点击展开`}`}
                  title={`${description}\n${(node.relation?.point ?? focus).chapterTitle ?? "未分章节"} · ${riskLabel(risk)}`}>
                  {node.root && <span className={s.focusTag}><i />当前知识点</span>}
                  <strong>{node.label}</strong>
                  {!node.root && <span className={s.nodeMeta}><span>{node.id === previousId ? "上一步 · " : ""}{node.relation!.label}</span>{isRisk(risk) && <i title={riskLabel(risk)} />}</span>}
                </motion.button>;
              })}
            </AnimatePresence>
            {!visible.length && <div className={s.emptyRelations}>{riskOnly ? "当前知识点没有直接关联的风险点" : "该知识点暂未建立直接关系"}{riskOnly && <button type="button" onClick={() => setRiskOnly(false)}>查看全部关系</button>}</div>}
          </div>
          <div className={s.pagination}>
            <span>{filtered.length ? `本页 ${visible.length} / ${filtered.length} 个关联知识点` : "暂无可展示关系"}</span>
            {pageCount > 1 ? <div><button aria-label="上一页关系" type="button" disabled={page === 0 || moving} onClick={() => changePage(page - 1)}><ChevronLeft size={13} /></button><span>{page + 1} / {pageCount}</span><button aria-label="下一页关系" type="button" disabled={page === pageCount - 1 || moving} onClick={() => changePage(page + 1)}><ChevronRight size={13} /></button></div> : <small>点击节点展开</small>}
          </div>
          <div className={s.detail} aria-live="polite" title={currentHover ? relationDescription(currentHover, focus.label) : focus.chapterTitle ?? ""}>
            {currentHover ? <><strong>{currentHover.point.label}</strong><span>{currentHover.label} · {riskLabel(riskMap.get(currentHover.point.id))}</span></> : <><strong>{previous ? `从「${previous.label}」展开 → ${focus.label}` : focus.chapterTitle ?? "当前知识关系"}</strong><span>{previous ? "原中心保留在「上一步」节点，可点击返回" : "箭头表示前置依赖 · 虚线表示关联"}</span></>}
          </div>
        </>}
      <footer className={s.footer}>
        <span className={s.focusRisk}><i style={{ background: RISK_COLORS[activeId ? riskMap.get(activeId) ?? "unknown" : "unknown"] }} />{riskLabel(activeId ? riskMap.get(activeId) : "unknown")}</span>
        <Link href={graphHref} className={s.open}>完整图谱<ArrowUpRight size={14} /></Link>
      </footer>
    </section>
  );
}
