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
    <Card className="min-h-[430px] gap-4 border-2 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />分析输出</CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">输出卡片展示当前已有结论；后端二次分析接口接入后在此更新。</p>
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        {outcomes.map((outcome, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn("rounded-lg border-2 px-3.5 py-3", toneClasses[outcome.tone])}
            initial={{ opacity: 0, y: 8 }}
            key={outcome.id}
            transition={{ delay: analyzing ? index * 0.09 : 0, duration: 0.28 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{outcome.label}</p>
                <p className="mt-1 truncate text-sm font-semibold" title={outcome.value}>{outcome.value}</p>
              </div>
              {outcome.insufficient ? <StatusBadge tone="neutral">证据不足</StatusBadge> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{outcome.description}</p>
            {outcome.href ? (
              <Link className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary" href={outcome.href}>
                查看依据 <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Info className="size-3.5" />等待分析接口返回</p>
            )}
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}
