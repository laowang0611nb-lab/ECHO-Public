"use client";

import type { AIAnalysis, AIAnalysisProgress, Chapter, DashboardLearningDifficulty } from "@echo/shared-types";
import { Activity, ArrowRight, BookOpen, Check, Database, FlaskConical, MessageCircle, Pause, Play, RefreshCw, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

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

const icons = [MessageCircle, FlaskConical, Activity, BookOpen, TrendingUp];
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
  const stageRef = useRef<HTMLElement>(null);
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
  const paused = reducedMotion || manuallyPaused || !inView || !tabVisible;
  const usableEvidence = props.evidenceNodes.filter(hasActualEvidence);
  const stageKey = props.progress?.stage ?? "";
  const stageIndex = pipeline.findIndex((part) => part.stages.includes(stageKey));
  const statusLabel = props.state === "analyzing" ? "真实分析进行中" : props.state === "completed" ? "分析已完成" : props.state === "failed" ? "分析失败" : "等待首次分析";
  const progress = props.state === "completed" ? 100 : Math.max(0, Math.min(100, props.progress?.percent ?? 0));
  const subtitle = props.state === "analyzing" ? props.progress?.stage_label ?? "等待后端阶段" : props.state === "completed" ? "持续监测" : props.state === "failed" ? "可重试" : "待命中";
  const featured = props.outcomes.find((item) => !item.insufficient) ?? null;
  return (
    <>
      <section className={styles.stage} aria-label="AI 教学分析神经协同工作台" ref={stageRef} data-state={props.state} data-paused={paused ? "true" : "false"}>
        <div className={styles.stageGrid} aria-hidden="true" />
        <AiStageFlow hostRef={stageRef} evidenceCount={usableEvidence.length} paused={paused} state={props.state} />
        <div className={styles.stageIdentity}>
          <span className={styles.identityLight} />
          <span>AI 教学分析 · 神经协同工作台</span>
        </div>
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
            return (
              <div className={`${styles.evidenceRow} ${nonzero ? "" : styles.evidenceAbsent}`} data-evidence-stream={nonzero ? "true" : undefined} key={node.id} style={{ "--evidence-accent": ["#368aff", "#936dfa", "#2bc5d1", "#bc79ef", "#4e9aff"][index % 5] } as CSSProperties}>
                <div className={styles.evidenceIcon}><Icon size={20} /></div>
                <div className={styles.evidenceText}><strong>{node.label}</strong><small>{nonzero ? node.value : "当前暂无数据"}</small></div>
                <span className={styles.evidencePulse} aria-hidden="true"><i /><i /><i /><i /><i /></span>
                {node.href ? <Link className={styles.evidenceLink} href={node.href} aria-label={`查看${node.label}证据`}><ArrowRight size={15} /></Link> : null}
              </div>
            );
          })}
          <p className={styles.evidenceNote}>仅呈现当前课程的真实数据 · 点击可回查</p>
        </div>
        <div className={styles.centerArea}>
          <AiStageOrb state={props.state} paused={paused} subtitle={subtitle} />
          <div className={styles.centerActions}>
            <button
              className={styles.analyzeButton}
              disabled={props.actionDisabled || props.actionPending || props.state === "analyzing"}
              onClick={props.onAction}
              type="button"
            >
              {props.state === "analyzing" || props.actionPending ? <RefreshCw className={styles.spinIcon} size={16} /> : <Play size={16} />}
              {props.state === "analyzing" || props.actionPending ? props.actionPendingLabel : props.actionLabel}
            </button>
            {props.onReanalyze ? <button className={styles.reanalyzeButton} disabled={props.actionPending || props.state === "analyzing" || props.reanalyzePending} onClick={props.onReanalyze} type="button" title="重新分析"><RotateCcw size={16} /> <span>重新分析</span></button> : null}
          </div>
        </div>
        <AiStageGraph analysis={props.analysis} chapters={props.chapters} courseId={props.courseId} fallbackDifficulty={props.fallbackDifficulty} />
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
        <span className={styles.ribbonModel}> {props.analysis?.result?.model_name ? `模型：${props.analysis.result.model_name}` : "ECHO AI · 真实教学证据"} </span>
      </section>
    </>
  );
}
