"use client";

import type { AIAnalysis, AIAnalysisProgress, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { Activity, ArrowRight, BookOpen, Check, Database, FlaskConical, MessageCircle, Pause, Play, RefreshCw, RotateCcw, Send, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { AiAnalysisOutcome, AiEvidenceNode } from "../view-model";
import type { SecondaryAnalysisState } from "./analysis-engine";
import { AiStageOrb } from "./ai-stage-orb";
import { AiStageFlow } from "./ai-stage-flow";
import { AiStageGraph } from "./ai-stage-graph";
import styles from "./ai-neural-stage.module.css";

type Props = {
  analysis: AIAnalysis | null;
  chapters: Chapter[];
  courseId: string;
  evidenceNodes: AiEvidenceNode[];
  outcomes: AiAnalysisOutcome[];
  fallbackDifficulty: DashboardLearningDifficulty | null;
  state: SecondaryAnalysisState;
  progress: AIAnalysisProgress | null;
  evidenceCount: number;
  actionLabel: string;
  actionPendingLabel: string;
  actionPending: boolean;
  actionDisabled: boolean;
  onAction: () => void;
  onReanalyze?: () => void;
  reanalyzePending: boolean;
};
type Phase = "idle" | "dragging" | "hovering-orb" | "consuming" | "analyzing-item" | "item-complete";
type Point = { x: number; y: number };
type Delivery = { id: string; phase: Phase; position: Point; destination: Point };
type PointerSession = { id: string; pointerId: number; start: Point; dragging: boolean };
const icons = [MessageCircle, FlaskConical, Activity, BookOpen, TrendingUp];
const ACCENTS = ["#368aff", "#936dfa", "#2bc5d1", "#bc79ef", "#4e9aff"];
const pipeline = [
  { label: "证据解析", stages: ["collecting_previous_analysis", "querying_evidence"] },
  { label: "知识对齐", stages: ["expanding_knowledge_graph"] },
  { label: "风险定位", stages: ["analyzing_student_impact"] },
  { label: "策略生成", stages: ["generating_recommendation"] },
];
function hasActualEvidence(node: AiEvidenceNode): boolean {
  if (node.value === "暂无") return false;
  const leading = node.value.match(/\d+(?:\.\d+)?/);
  return Boolean(leading && Number(leading[0]) > 0);
}

export function AiNeuralStage(props: Props) {
  const reducedMotion = useReducedMotion() ?? false;
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [hoveredEvidence, setHoveredEvidence] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const pointerRef = useRef<PointerSession | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(element);
    const updateTab = () => setTabVisible(document.visibilityState === "visible");
    updateTab();
    document.addEventListener("visibilitychange", updateTab);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", updateTab); };
  }, []);
  // Clean all pending animation callbacks on course change and unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timeout of timers) clearTimeout(timeout);
      timers.clear();
      pointerRef.current = null;
    };
  }, [props.courseId]);

  const paused = reducedMotion || manuallyPaused || !inView || !tabVisible;
  const usableEvidence = props.evidenceNodes.filter(hasActualEvidence);
  const activeEvidenceId = delivery?.id ?? hoveredEvidence;
  const activeIndex = props.evidenceNodes.findIndex((node) => node.id === activeEvidenceId);
  const activeColor = activeIndex < 0 ? undefined : ACCENTS[activeIndex % ACCENTS.length];
  const activeLabel = props.evidenceNodes.find((node) => node.id === activeEvidenceId)?.label ?? null;
  const stageKey = props.progress?.stage ?? "";
  const stageIndex = pipeline.findIndex((part) => part.stages.includes(stageKey));
  const statusLabel = props.state === "analyzing" ? "真实分析进行中" : props.state === "completed" ? "分析已完成" : props.state === "failed" ? "分析失败" : "等待首次分析";
  const progress = props.state === "completed" ? 100 : Math.max(0, Math.min(100, props.progress?.percent ?? 0));
  const subtitle = props.state === "analyzing" ? props.progress?.stage_label ?? "等待后端阶段" : props.state === "completed" ? "持续监测" : props.state === "failed" ? "可重试" : "待命中";
  const featured = props.outcomes.find((item) => !item.insufficient) ?? null;

  const inStage = (point: Point): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: point.x - (rect?.left ?? 0), y: point.y - (rect?.top ?? 0) };
  };
  const getDropCenter = (): Point | null => {
    const rect = stageRef.current?.querySelector<HTMLElement>('[data-ai-drop-zone="true"]')?.getBoundingClientRect();
    return rect ? inStage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : null;
  };
  const overSphere = (point: Point): boolean => {
    const rect = stageRef.current?.querySelector<HTMLElement>('[data-ai-drop-zone="true"]')?.getBoundingClientRect();
    if (!rect) return false;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    return Math.hypot(point.x - cx, point.y - cy) < rect.width * .65;
  };
  const schedule = (callback: () => void, ms: number) => {
    const timeout = setTimeout(() => { timersRef.current.delete(timeout); callback(); }, ms);
    timersRef.current.add(timeout);
  };
  const consumeEvidence = (id: string, start?: Point, initiatedByButton = false) => {
    const node = props.evidenceNodes.find((item) => item.id === id);
    const end = getDropCenter();
    if (!node || !hasActualEvidence(node) || !end) return;
    const rowRect = stageRef.current?.querySelector<HTMLElement>(`[data-evidence-id="${id}"]`)?.getBoundingClientRect();
    const rowPoint = rowRect ? inStage({ x: rowRect.right - 25, y: rowRect.top + rowRect.height / 2 }) : end;
    setHoveredEvidence(null);
    setDelivery({ id, phase: reducedMotion ? "item-complete" : initiatedByButton ? "dragging" : "consuming", position: start ?? rowPoint, destination: end });
    if (!reducedMotion) {
      if (initiatedByButton) schedule(() => setDelivery((current) => current?.id === id ? { ...current, phase: "consuming" } : current), 60);
      schedule(() => setDelivery((current) => current?.id === id ? { ...current, phase: "analyzing-item" } : current), 720);
      schedule(() => setDelivery((current) => current?.id === id ? { ...current, phase: "item-complete" } : current), 1750);
      schedule(() => setDelivery((current) => current?.id === id ? null : current), 2950);
    } else schedule(() => setDelivery(null), 1250);
  };
  const startDelivery = (id: string) => {
    if (props.state === "analyzing" || props.actionPending || delivery) return;
    consumeEvidence(id, undefined, true);
  };
  const dragStart = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (delivery || props.state === "analyzing" || props.actionPending || event.button !== 0 ||
      (event.target instanceof Element && event.target.closest("button,a"))) return;
    const node = props.evidenceNodes.find((item) => item.id === id);
    if (!node || !hasActualEvidence(node)) return;
    pointerRef.current = { id, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const current = { x: event.clientX, y: event.clientY };
    if (!session.dragging && Math.hypot(current.x - session.start.x, current.y - session.start.y) < 7) return;
    session.dragging = true;
    const destination = getDropCenter();
    if (!destination) return;
    setDelivery({ id: session.id, phase: overSphere(current) ? "hovering-orb" : "dragging", position: inStage(current), destination });
  };
  const dragEnd = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    if (!cancelled && session.dragging && overSphere({ x: event.clientX, y: event.clientY })) {
      consumeEvidence(session.id, inStage({ x: event.clientX, y: event.clientY }));
    } else setDelivery(null);
  };

  return (
    <>
      <section className={styles.stage} aria-label="AI 教学分析神经协同工作台" ref={stageRef} data-state={props.state} data-paused={paused ? "true" : "false"}>
        <div className={styles.stageGrid} aria-hidden="true" />
        <AiStageFlow hostRef={stageRef} evidenceCount={usableEvidence.length} activeEvidenceId={activeEvidenceId} activityPhase={delivery?.phase} paused={paused} state={props.state} />
        <div className={styles.stageIdentity}><span className={styles.identityLight} /><span>AI 教学分析 · 神经协同工作台</span></div>
        <div className={styles.stageSequence} aria-label="分析推理步骤">
          {pipeline.map((step, index) => {
            const done = props.state === "completed" || (props.state === "analyzing" && stageIndex > index);
            const current = props.state === "analyzing" && stageIndex === index;
            return (
              <div className={styles.sequenceStep} key={step.label} data-step={done ? "done" : current ? "current" : "pending"}>
                <span className={styles.sequenceBullet}>{done ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
                <span>{step.label}</span>
                {index < pipeline.length - 1 ? <span className={styles.sequenceDivider}>—</span> : null}
              </div>
            );
          })}
        </div>
        <div className={styles.stageTagline}>证据溯源　→　知识归因　→　风险定位　→　教学行动</div>
        <div className={styles.evidencePanel} aria-label="真实学习证据概览">
          <div className={styles.evidenceTitle}><Database size={16} /><strong>学习证据输入</strong><small>{usableEvidence.length} 类有效来源</small></div>
          {props.evidenceNodes.map((node, index) => {
            const Icon = icons[index % icons.length];
            const nonzero = hasActualEvidence(node);
            const active = activeEvidenceId === node.id;
            const disabled = !nonzero || props.state === "analyzing" || props.actionPending || Boolean(delivery);
            const color = ACCENTS[index % ACCENTS.length];
            return (
              <div className={`${styles.evidenceRow} ${nonzero ? "" : styles.evidenceAbsent} ${active ? styles.evidenceRowActive : ""}`} key={node.id}
                data-evidence-id={node.id} data-evidence-stream={nonzero ? "true" : undefined} data-evidence-accent={color} data-draggable={!disabled ? "true" : "false"}
                style={{ "--evidence-accent": color } as CSSProperties}
                onPointerDown={(event) => dragStart(event, node.id)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={(event) => dragEnd(event, true)}
                onPointerEnter={() => { if (nonzero && !delivery) setHoveredEvidence(node.id); }}
                onPointerLeave={() => { if (!delivery) setHoveredEvidence((id) => id === node.id ? null : id); }}
                onFocus={() => { if (nonzero && !delivery) setHoveredEvidence(node.id); }}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHoveredEvidence((id) => id === node.id ? null : id); }}>
                <div className={styles.evidenceIcon}><Icon size={20} /></div>
                <div className={styles.evidenceText}><strong>{node.label}</strong><small>{nonzero ? node.value : "当前暂无数据"}</small></div>
                <span className={styles.evidencePulse} aria-hidden="true"><i /><i /><i /><i /><i /></span>
                {nonzero ? <button type="button" className={styles.evidenceDeliver} disabled={disabled} onClick={() => startDelivery(node.id)} title={`送入核心：${node.label}`} aria-label={`将${node.label}送入 AI 核心（交互演示）`}><Send size={14} /></button> : null}
                {node.href ? <Link className={styles.evidenceOpen} href={node.href} title={`查看${node.label}证据`} aria-label={`查看${node.label}证据`}><ArrowRight size={15} /></Link> : null}
              </div>
            );
          })}
          <p className={styles.evidenceNote}>真实课程数据 · 拖入核心或点击投递（交互演示，不提交新分析）</p>
        </div>
        <div className={styles.centerArea}>
          <AiStageOrb state={props.state} paused={paused} subtitle={subtitle} activeColor={activeColor} activeLabel={activeLabel} activityPhase={delivery?.phase ?? (hoveredEvidence ? "hovering-orb" : "idle")} />
          <div className={styles.centerActions}>
            <button className={styles.analyzeButton} disabled={props.actionDisabled || props.actionPending || props.state === "analyzing"} onClick={props.onAction} type="button">
              {props.state === "analyzing" || props.actionPending ? <RefreshCw className={styles.spinIcon} size={16} /> : <Play size={16} />}
              {props.state === "analyzing" || props.actionPending ? props.actionPendingLabel : props.actionLabel}
            </button>
            {props.onReanalyze ? <button className={styles.reanalyzeButton} disabled={props.actionPending || props.state === "analyzing" || props.reanalyzePending} onClick={props.onReanalyze} type="button" title="重新分析"><RotateCcw size={16} /><span>重新分析</span></button> : null}
          </div>
        </div>
        <AiStageGraph analysis={props.analysis} chapters={props.chapters} courseId={props.courseId} fallbackDifficulty={props.fallbackDifficulty} activeEvidenceId={activeEvidenceId} />
        {delivery && !reducedMotion && (delivery.phase === "dragging" || delivery.phase === "hovering-orb" || delivery.phase === "consuming") ? (
          <div aria-hidden="true" className={`${styles.evidenceGhost} ${delivery.phase === "consuming" ? styles.evidenceGhostConsume : ""}`} style={{
            left: delivery.position.x, top: delivery.position.y, "--ghost-target-x": `${delivery.destination.x}px`, "--ghost-target-y": `${delivery.destination.y}px`, "--ghost-color": activeColor ?? "#398bff",
          } as CSSProperties}>
            <IconGhostLabel label={activeLabel ?? "学习证据"} />
          </div>
        ) : null}
        <div className={styles.stageFooter}>
          <span className={styles.footerState}><i />{statusLabel}</span>
          <span>{props.evidenceCount > 0 ? `${props.evidenceCount} 条持久化分析证据` : "尚未产生持久化分析证据"}</span>
          {props.state === "analyzing" ? <span>{props.progress?.message ?? "等待服务端返回分析进度"} {progress > 0 ? `${progress}%` : ""}</span> : null}
          <button aria-label={paused ? "开启动画" : "暂停动画"} className={styles.motionToggle} onClick={() => setManuallyPaused((value) => !value)} disabled={reducedMotion} title={reducedMotion ? "遵循系统减少动画设置" : paused ? "开启动画" : "暂停动画"} type="button">{paused ? <Play size={13} /> : <Pause size={13} />}</button>
        </div>
      </section>
      <section aria-label="关键洞察摘要" className={styles.insightRibbon}>
        <div className={styles.ribbonTitle}><Sparkles size={20} /><strong>{props.analysis?.status === "completed" ? "AI 分析洞察" : "当前课程学情概览"}</strong></div>
        <p className={styles.ribbonSummary}>{featured?.value ?? "暂无可展示的分析结果"} <span>{featured?.description ?? "请先完成分析或检查课程证据。"}</span></p>
        {featured?.href ? <Link className={styles.ribbonAction} href={featured.href}>查看依据 <ArrowRight size={14} /></Link> : null}
        <span className={styles.ribbonModel}>{props.analysis?.result?.model_name ? `模型：${props.analysis.result.model_name}` : "ECHO AI · 真实教学证据"}</span>
      </section>
    </>
  );
}

function IconGhostLabel({ label }: { label: string }) { return <><Database size={18} /><span>{label}</span></>; }
