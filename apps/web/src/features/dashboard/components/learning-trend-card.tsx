"use client";

import type { DashboardTrendPoint } from "@echo/shared-types";
import { Info } from "lucide-react";
import { useState } from "react";

import { LearningTrendChart, type TrendMetric } from "@/components/charts/learning-trend-chart";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDashboardDate } from "@/features/dashboard/view-model";

export function LearningTrendCard({
  data,
  currentMastery,
}: {
  data: DashboardTrendPoint[];
  currentMastery: number | null;
}) {
  const [metric, setMetric] = useState<TrendMetric>("interaction");
  const range = data.length ? `${formatDashboardDate(data[0].date)} - ${formatDashboardDate(data.at(-1)!.date)}` : "暂无日期范围";

  return (
    <Card className="relative gap-0 overflow-hidden py-0">
      <div className="h-px bg-gradient-to-r from-primary/75 via-primary/25 to-transparent" />
      <CardHeader className="gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <TooltipProvider delay={150}>
            <Tooltip>
              <TooltipTrigger render={<button aria-label="查看趋势说明" className="inline-flex items-center gap-1.5 text-left outline-none" type="button" />}>
                <CardTitle>学习状态趋势</CardTitle>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>过去七天课程学习交互与活跃学生变化</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="rounded-md border border-border bg-muted/45 px-2 py-1 text-xs text-muted-foreground">{range}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs onValueChange={(value) => setMetric(value as TrendMetric)} value={metric}>
            <TabsList className="border border-border bg-muted/60">
              <TabsTrigger value="mastery">综合掌握度</TabsTrigger>
              <TabsTrigger value="interaction">学习交互</TabsTrigger>
              <TabsTrigger value="active">活跃学生</TabsTrigger>
            </TabsList>
          </Tabs>
          {metric !== "mastery" && currentMastery !== null ? (
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              当前综合掌握度 {Math.round(currentMastery)}%
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:px-5">
        {data.length ? (
          <div className="overflow-hidden rounded-lg border border-border/90 bg-[linear-gradient(180deg,rgba(244,248,255,0.78)_0%,rgba(255,255,255,0)_72%)] px-1 pt-3 sm:px-3">
            <LearningTrendChart currentMastery={currentMastery} data={data} metric={metric} />
          </div>
        ) : (
          <EmptyState description="课程产生学习事件后，趋势会显示在这里。" title="暂无趋势数据" />
        )}
      </CardContent>
    </Card>
  );
}
