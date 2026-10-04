"use client";

import type { KnowledgePointAnalytics } from "@echo/shared-types";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowUpRight, BookOpen, ChevronDown, ChevronUp, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buildPointHref } from "@/features/knowledge/view-model";
import { cn } from "@/lib/utils";

import { riskLabel } from "./graph-theme";
import type { GraphPointRecord, GraphRiskLevel } from "./graph-types";

export function KnowledgeGraphAnalyticsCard({
  courseId,
  point,
  analytics,
  risk,
  isLoading,
  isError,
  filterActive,
  onRetry,
}: {
  courseId: string;
  point: GraphPointRecord | null;
  analytics: KnowledgePointAnalytics | null | undefined;
  risk: GraphRiskLevel;
  isLoading: boolean;
  isError: boolean;
  filterActive: boolean;
  onRetry: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <AnimatePresence mode="wait">
      {point ? (
        <motion.aside
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            "pointer-events-auto absolute right-4 top-20 z-20 w-[292px] max-w-[calc(100%-2rem)] rounded-xl border border-white/12 bg-[#f8fbff]/96 text-foreground shadow-[0_18px_50px_rgba(3,10,24,0.28)] backdrop-blur transition-[padding] duration-200 lg:top-4",
            collapsed ? "px-3 py-1.5" : "p-4",
          )}
          exit={{ opacity: 0, x: 12 }}
          initial={{ opacity: 0, x: 12 }}
          key={point.id}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={cn("flex justify-between gap-3", collapsed ? "items-center" : "items-start")}>
            <div className="min-w-0">
              {collapsed ? (
                <h3 className="truncate text-sm font-semibold leading-5">{analytics?.name ?? point.label}</h3>
              ) : (
                <>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">知识点学情</p>
                  <h3 className="mt-1 text-base font-semibold leading-6">{analytics?.name ?? point.label}</h3>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  risk === "high"
                    ? "bg-violet-100 text-violet-700"
                    : risk === "medium"
                      ? "bg-red-50 text-red-600"
                      : risk === "elevated"
                        ? "bg-orange-50 text-orange-600"
                        : "bg-blue-50 text-blue-700",
                )}
              >
                {riskLabel(risk)}
              </span>
              <button
                aria-expanded={!collapsed}
                aria-label={collapsed ? "展开学情卡片" : "收起学情卡片"}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setCollapsed((current) => !current)}
                type="button"
              >
                {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                key="analytics-body"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
          {filterActive && risk !== "high" ? (
            <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-700">
              当前焦点未命中“高风险”筛选，已保留在图中用于对照。
            </p>
          ) : null}

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              正在加载真实学情…
            </div>
          ) : isError ? (
            <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-3">
              <p className="text-sm text-destructive">学情数据暂时不可用。</p>
              <Button className="mt-2 h-8 px-3" onClick={onRetry} size="sm" type="button" variant="outline">
                <RefreshCw data-icon="inline-start" />
                重新加载
              </Button>
            </div>
          ) : analytics ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Metric
                  label="平均掌握度"
                  value={analytics.average_mastery === null ? "暂无" : `${Math.round(analytics.average_mastery)}%`}
                />
                <Metric label="薄弱学生" value={`${analytics.affected_students} 人`} />
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <BookOpen className="size-3.5 text-primary" />
                  <span className="truncate">{analytics.chapter_title || point.chapterTitle || "未归属章节"}</span>
                </p>
                <p className="flex items-center gap-2">
                  <UsersRound className="size-3.5 text-primary" />
                  <span>课程内已有 {analytics.students.length} 名学生的掌握度记录</span>
                </p>
              </div>
            </>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              该知识点还没有可展示的学情记录。
            </div>
          )}

          <Link
            className="mt-4 flex h-9 items-center justify-between rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            href={buildPointHref(point.id, {
              courseId,
              from: "graph",
              resourceId: point.chapterDocumentId ?? undefined,
              tab: "overview",
            })}
          >
            查看详细学情
            <ArrowUpRight className="size-4" />
          </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}
