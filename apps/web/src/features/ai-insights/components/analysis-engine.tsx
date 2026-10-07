"use client";

import type { AIAnalysisProgress, AIAnalysisStage } from "@echo/shared-types";
import { AlertTriangle, Check, LoaderCircle, Play, RefreshCw, ScanSearch } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import styles from "./analysis-engine.module.css";
import { MagicRings, type MagicRingsState } from "./magic-rings";

export type SecondaryAnalysisState = "idle" | "analyzing" | "completed" | "failed";

const analysisPhases: Array<{ stage: AIAnalysisStage; label: string; detail: string }> = [
  { stage: "collecting_previous_analysis", label: "收集已有分析结果", detail: "读取当前分析上下文" },
  { stage: "querying_evidence", label: "查询关联学习证据", detail: "关联持久化证据" },
  { stage: "expanding_knowledge_graph", label: "扩展知识关系", detail: "沿知识图谱扩展关系" },
  { stage: "analyzing_student_impact", label: "分析影响学生", detail: "定位受到影响的学生" },
  { stage: "generating_recommendation", label: "生成教学建议", detail: "形成可执行的下一步" },
];

const stageIndexes = new Map(analysisPhases.map((phase, index) => [phase.stage, index]));

export function AnalysisEngine({
  state,
  progress,
  actionLabel,
  actionPending = false,
  actionPendingLabel = "正在分析...",
  actionDisabled = false,
  modelName,
  evidenceCount = 0,
  affectedStudentCount = 0,
  onReanalyze,
  reanalyzePending = false,
  onAction,
}: {
  state: SecondaryAnalysisState;
  progress: AIAnalysisProgress | null;
  actionLabel: string;
  actionPending?: boolean;
  actionPendingLabel?: string;
  actionDisabled?: boolean;
  modelName?: string | null;
  evidenceCount?: number;
  affectedStudentCount?: number;
  onReanalyze?: () => void;
  reanalyzePending?: boolean;
  onAction: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const analyzing = state === "analyzing";
  const currentStageIndex = progress?.stage ? stageIndexes.get(progress.stage) ?? -1 : -1;
  const percent = Math.max(0, Math.min(100, progress?.percent ?? (state === "completed" ? 100 : 0)));
  const hasDeterminateProgress = analyzing && currentStageIndex >= 0 && percent > 0;
  const progressMessage = progress?.message
    ?? (progress?.stage_label ? `${progress.stage_label} · ${percent}%` : "等待后端返回阶段进度...");
  const visualState: MagicRingsState = analyzing
    ? "processing"
    : hovered && !reducedMotion
      ? "hover"
      : "idle";
  const statusMessage = analyzing
    ? progressMessage
    : state === "completed"
      ? "分析已完成，推理链已形成"
      : state === "failed"
        ? "分析失败，可重新分析"
        : "等待开始分析";
  const statusMetric = analyzing
    ? "进行中"
    : state === "completed"
      ? "完成"
      : state === "failed"
        ? "失败"
        : "待开始";
  const meterWidth = analyzing && !hasDeterminateProgress ? 38 : percent;

  return (
    <section
      aria-busy={analyzing}
      aria-labelledby="ai-analysis-title"
      className={cn(styles.card, "relative flex min-h-[310px] flex-col px-4 pt-3 pb-6 backdrop-blur-[20px] backdrop-saturate-[1.35] xl:h-full")}
      data-ai-analysis-card="true"
      data-state={visualState}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[620px] flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <StatusBadge tone={analyzing ? "info" : state === "completed" ? "success" : state === "failed" ? "danger" : "neutral"}>
            {analyzing ? "分析中" : state === "completed" ? "分析已完成" : state === "failed" ? "分析失败" : "等待分析"}
          </StatusBadge>
          {modelName ? <StatusBadge tone="neutral">{modelName}</StatusBadge> : null}
        </div>

        <div className="mt-2 text-center">
          <h2 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#13233a]" id="ai-analysis-title">
            ECHO AI 教学引擎
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-[#526984]">
            基于学习证据进行教学推理与策略生成
          </p>
        </div>

        <div aria-hidden="true" className={styles.coreStage}>
          <div className="pointer-events-none absolute -inset-x-10 -inset-y-5">
            <MagicRings className="size-full" state={visualState} />
          </div>
          <span className={styles.coreHalo} />
          <div className={styles.coreShellWrap}>
            <div className={styles.coreShell}>
              {state === "failed"
                ? <AlertTriangle className="size-7 text-rose-500" />
                : <ScanSearch className={cn(styles.coreIcon, "size-7")} />}
            </div>
          </div>
        </div>

        <ol aria-label="教学分析推理阶段" className={styles.pipeline}>
          {analysisPhases.map((phase, index) => {
            const done = state === "completed" || (analyzing && currentStageIndex > index);
            const active = analyzing && currentStageIndex === index;
            const pipelineStatus = done ? "done" : active ? "active" : "pending";
            const pipelineStatusText = done ? "已完成" : active ? "分析中" : "等待";
            return (
              <li
                aria-label={`${phase.label}，${pipelineStatusText}`}
                className={styles.pipelineItem}
                data-status={pipelineStatus}
                key={phase.stage}
                title={phase.detail}
              >
                <span className={styles.pipelineNode}>
                  {done ? <Check className="size-2.5" strokeWidth={3} /> : null}
                </span>
                <span className={styles.pipelineLabel}>{phase.label}</span>
                <span className={styles.pipelineState}>{done ? "完成" : active ? "分析中" : "等待"}</span>
              </li>
            );
          })}
        </ol>

        <div aria-label="分析摘要" className={styles.metrics}>
          <Metric label="学习证据" value={evidenceCount > 0 ? evidenceCount.toString() : analyzing ? "..." : "0"} />
          <Metric label="影响学生" value={affectedStudentCount > 0 ? affectedStudentCount.toString() : analyzing ? "..." : "0"} />
          <Metric label="分析状态" value={statusMetric} />
        </div>

        <div className={styles.meterWrap}>
          <div className={styles.meterLabels}>
            <span>推理进度</span>
            <span>{analyzing && !hasDeterminateProgress ? "推理中" : `${percent}%`}</span>
          </div>
          <progress aria-label="教学分析进度" className="sr-only" max={100} value={percent} />
          <div aria-hidden="true" className={styles.meterTrack}>
            <span
              className={cn(styles.meterFill, analyzing && !hasDeterminateProgress && styles.meterIndeterminate)}
              style={{ width: `${meterWidth}%` }}
            />
          </div>
        </div>

        <div aria-live="polite" className={styles.statusLine} role="status">
          {statusMessage}
        </div>

        <div className="mt-auto">
          <button
            className={cn(styles.strategyButton, "flex w-full items-center justify-center gap-2")}
            disabled={analyzing || actionPending || actionDisabled}
            onClick={onAction}
            type="button"
          >
            {analyzing || actionPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            {analyzing || actionPending ? actionPendingLabel : actionLabel}
          </button>
          {onReanalyze ? (
            <Button
              className="mt-2 h-9 w-full text-xs"
              disabled={analyzing || actionPending || reanalyzePending}
              onClick={onReanalyze}
              size="sm"
              type="button"
              variant="outline"
            >
              {reanalyzePending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              {reanalyzePending ? "正在重新分析..." : "重新分析"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.metric}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </span>
  );
}
