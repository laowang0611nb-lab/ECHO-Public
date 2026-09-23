"use client";

import { BrainCircuit, Check, LoaderCircle, Play, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/common/status-badge";

export type SecondaryAnalysisState = "idle" | "analyzing" | "completed";

const analysisPhases = [
  "收集已有分析结果",
  "查询关联学习证据",
  "扩展知识关系",
  "分析影响学生",
  "生成教学建议",
] as const;

export function AnalysisEngine({
  state,
  phaseIndex,
  onAnalyze,
}: {
  state: SecondaryAnalysisState;
  phaseIndex: number;
  onAnalyze: () => void;
}) {
  const analyzing = state === "analyzing";
  const progress = analyzing ? Math.round(((phaseIndex + 1) / analysisPhases.length) * 100) : 100;

  return (
    <Card className="relative flex min-h-[430px] flex-col gap-4 overflow-hidden border-2 border-blue-200 bg-card/95 py-5">
      <CardHeader className="items-center px-5 text-center">
        <div className="flex items-center gap-2">
          <StatusBadge tone={analyzing ? "info" : state === "completed" ? "success" : "neutral"}>
            {analyzing ? "分析中" : state === "completed" ? "分析已完成" : "等待分析"}
          </StatusBadge>
          <StatusBadge tone="neutral">界面预览</StatusBadge>
        </div>
        <CardTitle className="mt-4 text-lg">ECHO AI 教学引擎</CardTitle>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          在已有分析结果上继续追问原因、影响范围和可执行的下一步。
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5">
        <div className="relative mx-auto flex size-40 items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            className="absolute inset-0 rounded-full border border-dashed border-primary/35"
            transition={{ duration: analyzing ? 3 : 9, ease: "linear", repeat: Infinity }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            className="absolute inset-4 rounded-full border border-primary/15"
            transition={{ duration: analyzing ? 5 : 13, ease: "linear", repeat: Infinity }}
          />
          <motion.div
            animate={analyzing ? { scale: [0.98, 1.03, 0.98] } : { scale: 1 }}
            className="relative flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-primary to-cyan-400 text-white shadow-[0_18px_40px_rgba(47,124,246,0.24)]"
            transition={{ duration: 1.2, repeat: analyzing ? Infinity : 0 }}
          >
            {analyzing ? <Search className="size-9" /> : <BrainCircuit className="size-10" />}
          </motion.div>
          <span className="absolute bottom-2 right-1 rounded-full border bg-card p-1.5 text-primary shadow-sm">
            <Sparkles className="size-3.5" />
          </span>
        </div>

        <div className="mt-5 space-y-2">
          {analysisPhases.map((phase, index) => {
            const done = state === "completed" || (analyzing && index < phaseIndex);
            const active = analyzing && index === phaseIndex;
            return (
              <div className="flex items-center gap-2 text-xs" key={phase}>
                <span className={done ? "text-emerald-600" : active ? "text-primary" : "text-muted-foreground"}>
                  {done ? <Check className="size-3.5" /> : active ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="block size-1.5 rounded-full bg-border" />}
                </span>
                <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>{phase}</span>
              </div>
            );
          })}
        </div>
        <Progress className="mt-5" value={progress} />
        <Button className="mt-5 h-10 w-full" disabled={analyzing} onClick={onAnalyze} type="button">
          {analyzing ? <LoaderCircle className="animate-spin" /> : <Play />}
          {analyzing ? "正在进一步分析..." : "进一步分析"}
        </Button>
      </CardContent>
    </Card>
  );
}
