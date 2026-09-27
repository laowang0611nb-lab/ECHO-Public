"use client";

import { ArrowRight, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiAnalysisOutcome, AiTeachingTone } from "@/features/ai-insights/view-model";

const toneClasses: Record<AiTeachingTone, string> = {
  blue: "border-blue-200 bg-blue-50/45",
  emerald: "border-emerald-200 bg-emerald-50/45",
  amber: "border-amber-200 bg-amber-50/55",
  rose: "border-rose-200 bg-rose-50/45",
  violet: "border-violet-200 bg-violet-50/45",
  neutral: "border-border bg-muted/25",
};

export function AnalysisResultPanel({
  outcomes,
  analyzing,
}: {
  outcomes: AiAnalysisOutcome[];
  analyzing: boolean;
}) {
  return (
    <Card className="min-h-[380px] gap-3 border-2 py-4 xl:h-full">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />分析输出</CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">输出来自当前分析记录，所有事实均需回链到持久化证据。</p>
      </CardHeader>
      <CardContent
        className="scrollbar-hidden grid auto-rows-max min-h-0 flex-1 gap-2 overflow-x-hidden overflow-y-auto px-4 pb-1"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)", maskImage: "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)" }}
      >
        {outcomes.map((outcome, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn("min-w-0 rounded-lg border-2 px-3 py-2.5", toneClasses[outcome.tone])}
            initial={{ opacity: 0, y: 8 }}
            key={outcome.id}
            transition={{ delay: analyzing ? index * 0.09 : 0, duration: 0.28 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{outcome.label}</p>
                <p className="mt-1 break-words text-sm font-semibold leading-5">{outcome.value}</p>
              </div>
              {outcome.insufficient ? <StatusBadge tone="neutral">证据不足</StatusBadge> : null}
            </div>
            <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{outcome.description}</p>
            {outcome.tags?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {outcome.tags.map((tag) => (
                  <span className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground" key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            {outcome.facts?.length ? (
              <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
                {outcome.facts.map((fact) => (
                  <div className="min-w-0" key={fact.id}>
                    <p className="break-words text-xs leading-5">{fact.text}</p>
                    <Link className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary" href={fact.href}>
                      {fact.sourceLabel} · {fact.evidenceCount} 条证据 <ArrowRight className="size-3" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
            {outcome.href ? (
              <Link className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary" href={outcome.href}>
                查看依据 <ArrowRight className="size-3.5" />
              </Link>
            ) : outcome.facts?.length ? null : (
              <p className="mt-2 flex items-start gap-1 break-words text-xs text-muted-foreground">
                <Info className="size-3.5" />
                {analyzing ? "分析完成后更新" : outcome.insufficient ? "本次未生成可回链依据" : "已回链至当前分析记录"}
              </p>
            )}
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
