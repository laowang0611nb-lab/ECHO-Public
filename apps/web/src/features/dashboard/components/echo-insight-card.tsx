import type { DashboardInsight, DashboardLearningDifficulty } from "@echo/shared-types";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/common/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { localizeInsightSummary } from "@/features/dashboard/view-model";

export function EchoInsightCard({
  insight,
  difficulties,
}: {
  insight: DashboardInsight;
  difficulties: DashboardLearningDifficulty[];
}) {
  const tone = insight.risk_level === "high" ? "danger" : insight.risk_level === "medium" ? "warning" : "success";

  return (
    <Card className="gap-4 border-blue-300/80 bg-blue-50/45 py-5 shadow-[0_1px_3px_rgba(47,124,246,0.12)]">
      <CardHeader className="px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-4" />
            <p className="text-xs font-semibold tracking-[0.16em]">ECHO INSIGHT</p>
          </div>
          <StatusBadge tone={tone}>{insight.risk_level === "high" ? "高风险" : insight.risk_level === "medium" ? "需关注" : "正常"}</StatusBadge>
        </div>
        <CardTitle className="mt-3 text-lg leading-7">{localizeInsightSummary(insight.summary)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="space-y-2">
          {difficulties.slice(0, 3).map((item) => (
            <div className="flex items-start gap-2 text-sm text-foreground" key={item.knowledge_point_id}>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item.affected_students} 人在“{item.name}”上需要支持</span>
            </div>
          ))}
          {!difficulties.length ? <p className="text-sm text-muted-foreground">当前没有明显困难知识点。</p> : null}
        </div>

        {difficulties[0] ? (
          <div className="rounded-lg border border-blue-100 bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="size-4 text-orange-500" />
              建议优先支持“{difficulties[0].name}”
            </p>
            <p className="mt-2 text-xs text-muted-foreground">数据来源：实时课程学习事件与掌握状态。</p>
          </div>
        ) : null}

        <Link className={cn(buttonVariants(), "w-full")} href="/ai-insights">
          查看详细分析
          <ArrowRight data-icon="inline-end" />
        </Link>
      </CardContent>
    </Card>
  );
}
