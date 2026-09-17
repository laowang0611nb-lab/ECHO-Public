"use client";

import type { DashboardTrendPoint } from "@echo/shared-types";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import { formatDashboardDate } from "@/features/dashboard/view-model";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export type TrendMetric = "mastery" | "interaction" | "active";

export function LearningTrendChart({
  data,
  metric,
  currentMastery,
}: {
  data: DashboardTrendPoint[];
  metric: TrendMetric;
  currentMastery: number | null;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!elementRef.current) {
      return;
    }
    const chart = echarts.init(elementRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(elementRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    const values = data.map((point) => {
      if (metric === "interaction") return point.interaction_count;
      if (metric === "active") return point.active_student_count;
      return currentMastery ?? 0;
    });
    const metricName = metric === "mastery" ? "当前综合掌握度" : metric === "active" ? "活跃学生" : "学习交互";
    const numericMax = Math.max(1, ...values);
    const yAxisMax = metric === "mastery" ? 100 : Math.max(2, Math.ceil(numericMax * 1.25));

    chart.setOption({
      animationDuration: 420,
      animationEasing: "cubicOut",
      grid: { left: 8, right: 18, top: 20, bottom: 10, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#ffffff",
        borderColor: "#E5EAF2",
        borderWidth: 1,
        textStyle: { color: "#182236", fontSize: 12 },
        extraCssText: "border-radius:10px;box-shadow:0 10px 24px rgba(23,37,58,.10);",
        valueFormatter: (value: number) => metric === "mastery" ? `${value}%` : String(value),
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: data.map((point) => formatDashboardDate(point.date)),
        axisLine: { lineStyle: { color: "#D5DFEC" } },
        axisTick: { show: false },
        axisLabel: { color: "#667085", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yAxisMax,
        minInterval: 1,
        splitNumber: metric === "mastery" ? 5 : Math.min(5, yAxisMax),
        splitLine: { lineStyle: { color: "#E8EEF7" } },
        axisLabel: { color: "#98A2B3", fontSize: 11 },
      },
      series: [
        {
          name: metricName,
          type: "line",
          smooth: true,
          symbol: "none",
          data: values,
          lineStyle: { color: "#2F7CF6", width: 2.5 },
          itemStyle: { color: "#2F7CF6" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(47,124,246,0.24)" },
                { offset: 1, color: "rgba(47,124,246,0.015)" },
              ],
            },
          },
        },
      ],
    });
  }, [currentMastery, data, metric]);

  return <div aria-label="学习状态趋势图" className="h-[240px] min-h-[220px] w-full sm:h-[280px] lg:h-[320px]" ref={elementRef} role="img" />;
}
