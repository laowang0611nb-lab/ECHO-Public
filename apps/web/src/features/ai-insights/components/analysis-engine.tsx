"use client";

import type { AIAnalysisProgress, AIAnalysisStage } from "@echo/shared-types";
import { AlertTriangle, BrainCircuit, Check, LoaderCircle, Play, RefreshCw, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SecondaryAnalysisState = "idle" | "analyzing" | "completed" | "failed";

const analysisPhases: Array<{ stage: AIAnalysisStage; label: string }> = [
  { stage: "collecting_previous_analysis", label: "收集已有分析结果" },
  { stage: "querying_evidence", label: "查询关联学习证据" },
  { stage: "expanding_knowledge_graph", label: "扩展知识关系" },
  { stage: "analyzing_student_impact", label: "分析影响学生" },
  { stage: "generating_recommendation", label: "生成教学建议" },
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
  onReanalyze?: () => void;
  reanalyzePending?: boolean;
  onAction: () => void;
}) {
  const analyzing = state === "analyzing";
  const rotationMode = analyzing ? "fast" : "slow";
  const currentStageIndex = progress?.stage ? stageIndexes.get(progress.stage) ?? -1 : -1;
  const percent = Math.max(0, Math.min(100, progress?.percent ?? (state === "completed" ? 100 : 0)));
  const hasDeterminateProgress = analyzing && currentStageIndex >= 0 && percent > 0;
  const progressMessage = progress?.message
    ?? (progress?.stage_label ? `${progress.stage_label} · ${percent}%` : "等待后端返回阶段进度...");

  return (
    <Card className="relative flex min-h-[310px] flex-col gap-3 overflow-hidden border-2 border-blue-200 bg-card/95 py-4">
      <motion.span
        aria-hidden="true"
        animate={analyzing ? { opacity: [0, 0.7, 0], y: [0, 250, 0] } : { opacity: 0 }}
        className="absolute left-5 right-5 top-4 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
        transition={{ duration: 2.2, ease: "easeInOut", repeat: analyzing ? Infinity : 0 }}
      />
      <CardHeader className="items-center px-5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <StatusBadge tone={analyzing ? "info" : state === "completed" ? "success" : state === "failed" ? "danger" : "neutral"}>
            {analyzing ? "分析中" : state === "completed" ? "分析已完成" : state === "failed" ? "分析失败" : "等待分析"}
          </StatusBadge>
          {modelName ? <StatusBadge tone="neutral">{modelName}</StatusBadge> : null}
        </div>
        <CardTitle className="mt-3 text-lg">ECHO AI 教学引擎</CardTitle>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          在已有分析结果上继续追问原因、影响范围和可执行的下一步。
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5">
        <div className="relative mx-auto flex size-28 items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            className="absolute inset-0 rounded-full border border-dashed border-primary/35"
            initial={{ rotate: 0 }}
            key={`outer-${rotationMode}`}
            transition={{ duration: analyzing ? 1.9 : 10, ease: "linear", repeat: Infinity }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            className="absolute inset-3 rounded-full border border-primary/15"
            initial={{ rotate: 0 }}
            key={`inner-${rotationMode}`}
            transition={{ duration: analyzing ? 2.8 : 14, ease: "linear", repeat: Infinity }}
          />
          <motion.div
            animate={analyzing ? { scale: [0.97, 1.04, 0.97] } : { scale: 1 }}
            className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-primary to-cyan-400 text-white shadow-[0_18px_40px_rgba(47,124,246,0.24)]"
            transition={{ duration: 1.05, repeat: analyzing ? Infinity : 0 }}
          >
            {state === "failed" ? <AlertTriangle className="size-8" /> : analyzing ? <Search className="size-8" /> : <BrainCircuit className="size-9" />}
          </motion.div>
          <motion.span
            animate={{ rotate: 360 }}
            className="absolute inset-1"
            initial={{ rotate: 0 }}
            key={`cyan-${rotationMode}`}
            transition={{ duration: analyzing ? 2.4 : 20, ease: "linear", repeat: Infinity }}
          >
            <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
          </motion.span>
          <motion.span
            animate={{ rotate: -360 }}
            className="absolute inset-1"
            initial={{ rotate: 0 }}
            key={`sparkle-${rotationMode}`}
            transition={{ duration: analyzing ? 3.2 : 26, ease: "linear", repeat: Infinity }}
          >
            <span className="absolute bottom-0 left-1/2 flex size-6 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border bg-card text-primary shadow-sm">
              <Sparkles className="size-3.5" />
            </span>
          </motion.span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {analysisPhases.map((phase, index) => {
            const done = state === "completed" || (analyzing && currentStageIndex > index);
            const active = analyzing && currentStageIndex === index;
            return (
              <div className="flex items-center gap-2 text-xs" key={phase.stage}>
                <span className={done ? "text-emerald-600" : active ? "text-primary" : "text-muted-foreground"}>
                  {done ? <Check className="size-3.5" /> : active ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="block size-1.5 rounded-full bg-border" />}
                </span>
                <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{phase.label}</span>
              </div>
            );
          })}
        </div>
        {analyzing && hasDeterminateProgress ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <motion.div
              animate={{ width: `${percent}%` }}
              className="h-full rounded-full bg-primary"
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        ) : analyzing ? (
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <motion.span
              animate={{ x: ["-120%", "320%"] }}
              className="absolute inset-y-0 w-1/3 rounded-full bg-primary"
              transition={{ duration: 1.35, ease: "easeInOut", repeat: Infinity }}
            />
          </div>
        ) : (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={state === "completed" ? "h-full w-full rounded-full bg-primary" : "h-full w-0 rounded-full bg-primary"} />
          </div>
        )}
        {analyzing ? (
          <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">{progressMessage}</p>
        ) : null}
        <Button className="mt-3 h-9 w-full" disabled={analyzing || actionPending || actionDisabled} onClick={onAction} type="button">
          {analyzing || actionPending ? <LoaderCircle className="animate-spin" /> : <Play />}
          {analyzing || actionPending ? actionPendingLabel : actionLabel}
        </Button>
        {onReanalyze ? (
          <Button
            className="mt-2 h-8 w-full text-xs"
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
      </CardContent>
    </Card>
  );
}
