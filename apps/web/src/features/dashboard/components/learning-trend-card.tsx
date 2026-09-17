"use client";

import type { DashboardTrendPoint } from "@echo/shared-types";
import { useState } from "react";

import { LearningTrendChart, type TrendMetric } from "@/components/charts/learning-trend-chart";
import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Card className="gap-4 py-5">
      <CardHeader className="gap-3 px-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>学习状态趋势</CardTitle>
          <CardDescription className="mt-1">过去七天课程学习交互与活跃学生变化</CardDescription>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Tabs onValueChange={(value) => setMetric(value as TrendMetric)} value={metric}>
            <TabsList>
              <TabsTrigger value="mastery">综合掌握度</TabsTrigger>
              <TabsTrigger value="interaction">学习交互</TabsTrigger>
              <TabsTrigger value="active">活跃学生</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">{range}</p>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        {data.length ? (
          <LearningTrendChart currentMastery={currentMastery} data={data} metric={metric} />
        ) : (
          <EmptyState description="课程产生学习事件后，趋势会显示在这里。" title="暂无趋势数据" />
        )}
      </CardContent>
    </Card>
  );
}
