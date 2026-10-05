"use client";

import type { ReviewFlagSummary } from "@echo/shared-types";
import {
  AlertTriangle,
  ArrowRight,
  FileWarning,
  Inbox,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { AnimatedNumber } from "@/components/common/animated-number";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewQueueFilters } from "@/features/ai-review/types";
import { useReviewSummary } from "@/features/ai-review/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { cn } from "@/lib/utils";

type CockpitView = "workflow" | "risk";
type CockpitKey =
  | "open"
  | "pending_rereview"
  | "generating"
  | "regeneration_failed"
  | "high"
  | "missing_course_basis"
  | "student_not_resolved";

type CockpitItem = {
  key: CockpitKey;
  label: string;
  detail: string;
  value: number;
  href: string;
  icon: LucideIcon;
  dotClassName: string;
  barClassName: string;
  iconClassName: string;
};

function getInitialCockpitState(filters: ReviewQueueFilters): { view: CockpitView; key: CockpitKey } {
  if (filters.severity !== "all") {
    return { view: "risk", key: "high" };
  }
  if (filters.reason === "missing_course_basis" || filters.reason === "student_not_resolved") {
    return { view: "risk", key: filters.reason };
  }
  if (
    filters.status === "pending_rereview"
    || filters.status === "generating"
    || filters.status === "regeneration_failed"
  ) {
    return { view: "workflow", key: filters.status };
  }
  return { view: "workflow", key: "open" };
}

export function ReviewCockpitPage({
  initialCourseId,
  initialFilters,
}: {
  initialCourseId?: string;
  initialFilters: ReviewQueueFilters;
}) {
  const router = useRouter();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const initialCockpitState = getInitialCockpitState(initialFilters);
  const [view, setView] = useState<CockpitView>(initialCockpitState.view);
  const [workflowKey, setWorkflowKey] = useState<CockpitKey>(
    initialCockpitState.view === "workflow" ? initialCockpitState.key : "open",
  );
  const [riskKey, setRiskKey] = useState<CockpitKey>(
    initialCockpitState.view === "risk" ? initialCockpitState.key : "high",
  );
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const summaryQuery = useReviewSummary(courseId);
  const summaryData: ReviewFlagSummary = summaryQuery.data ?? {
    pending: 0,
    high_risk: 0,
    reasons: {
      missing_course_basis: 0,
      outside_material_heavy: 0,
      repeated_follow_up: 0,
      student_not_resolved: 0,
      teacher_rule_violation: 0,
    },
    generating: 0,
    pending_rereview: 0,
    regeneration_failed: 0,
  };
  const firstReviewPending = Math.max(0, summaryData.pending - summaryData.pending_rereview);
  const querySuffix = courseId ? `courseId=${courseId}` : "";
  const workflowItems: CockpitItem[] = [
    {
      key: "open",
      label: "首次审核",
      detail: "等待教师第一次判断",
      value: firstReviewPending,
      href: `/ai-review/pending?${querySuffix}&status=open`,
      icon: Inbox,
      dotClassName: "bg-blue-500",
      barClassName: "bg-blue-500",
      iconClassName: "bg-blue-50 text-blue-600",
    },
    {
      key: "pending_rereview",
      label: "待再次审核",
      detail: "复核重新生成的回答",
      value: summaryData.pending_rereview,
      href: `/ai-review/pending?${querySuffix}&status=pending_rereview`,
      icon: RefreshCw,
      dotClassName: "bg-amber-500",
      barClassName: "bg-amber-500",
      iconClassName: "bg-amber-50 text-amber-600",
    },
    {
      key: "generating",
      label: "重新生成中",
      detail: "AI 正在生成新版本",
      value: summaryData.generating,
      href: `/ai-review/pending?${querySuffix}&status=generating`,
      icon: RefreshCw,
      dotClassName: "bg-sky-500",
      barClassName: "bg-sky-500",
      iconClassName: "bg-sky-50 text-sky-700",
    },
    {
      key: "regeneration_failed",
      label: "生成失败",
      detail: "进入工作台重试生成",
      value: summaryData.regeneration_failed,
      href: `/ai-review/pending?${querySuffix}&status=regeneration_failed`,
      icon: AlertTriangle,
      dotClassName: "bg-red-500",
      barClassName: "bg-red-500",
      iconClassName: "bg-red-50 text-red-600",
    },
  ];
  const riskItems: CockpitItem[] = [
    {
      key: "high",
      label: "高风险回答",
      detail: "严重级别为高风险",
      value: summaryData.high_risk,
      href: `/ai-review/pending?${querySuffix}&severity=high`,
      icon: AlertTriangle,
      dotClassName: "bg-red-500",
      barClassName: "bg-red-500",
      iconClassName: "bg-red-50 text-red-600",
    },
    {
      key: "missing_course_basis",
      label: "缺少课程依据",
      detail: "未检索到教材来源",
      value: summaryData.reasons.missing_course_basis,
      href: `/ai-review/pending?${querySuffix}&reason=missing_course_basis`,
      icon: FileWarning,
      dotClassName: "bg-amber-500",
      barClassName: "bg-amber-500",
      iconClassName: "bg-amber-50 text-amber-600",
    },
    {
      key: "student_not_resolved",
      label: "学生未解决",
      detail: "学生主动标记或连续追问",
      value: summaryData.reasons.student_not_resolved,
      href: `/ai-review/pending?${querySuffix}&reason=student_not_resolved`,
      icon: ShieldCheck,
      dotClassName: "bg-blue-500",
      barClassName: "bg-blue-500",
      iconClassName: "bg-blue-50 text-blue-700",
    },
  ];
  const selectedKey = view === "workflow" ? workflowKey : riskKey;
  const activeItems = view === "workflow" ? workflowItems : riskItems;
  const selectedItem = activeItems.find((item) => item.key === selectedKey) ?? activeItems[0]!;
  const workflowTotal = workflowItems.reduce((total, item) => total + item.value, 0);
  const riskMax = Math.max(...riskItems.map((item) => item.value), 1);

  function handleCourseChange(value: string) {
    setSelectedCourseId(value);
    router.replace(`/ai-review?courseId=${value}`, { scroll: false });
  }


  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，AI 回答审核会基于当前课程真实数据展示。" title="尚未选择课程" />;
  }
  if (summaryQuery.isLoading) return <LoadingState label="正在加载 AI 回答审核概览..." />;
  if (summaryQuery.isError) {
    return <ErrorState description="审核概览加载失败，请确认后端服务后重试。" onRetry={() => { void summaryQuery.refetch(); }} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Select
            items={courses.map((course) => ({ value: course.id, label: course.name }))}
            onValueChange={(value) => {
              if (value) handleCourseChange(value);
            }}
            value={courseId}
          >
            <SelectTrigger className="w-[min(280px,60vw)]"><SelectValue className="truncate" /></SelectTrigger>
            <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        }
        breadcrumbs={[{ label: "AI 教学" }, { label: "AI 回答审核" }]}
        description="用工作流和风险两个视角查看审核负载，再从统一入口进入审核工作台。"
        title="AI 回答审核"
      />

      <section className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="px-5 py-6 sm:px-6">
            <div>
              <p className="text-sm font-semibold">审核驾驶舱</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                先选择任务类型，再从唯一入口进入工作台。
              </p>
            </div>

            <div className="mt-7 flex flex-wrap items-end gap-x-5 gap-y-2">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold leading-none tracking-tight">
                  <AnimatedNumber value={summaryData.pending} />
                </span>
                <span className="pb-1 text-sm text-muted-foreground">条待审核</span>
              </div>
              <p className="pb-1 text-xs text-muted-foreground">
                首次审核 {firstReviewPending} + 再次审核 {summaryData.pending_rereview}
              </p>
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {view === "workflow" ? "待处理相关状态" : "风险信号相对量"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {view === "workflow" ? `${workflowTotal} 条记录` : "分类可重叠"}
                </p>
              </div>

              {view === "workflow" ? (
                <>
                  <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
                    {workflowItems.map((item) => {
                      const width = workflowTotal > 0 ? (item.value / workflowTotal) * 100 : 0;
                      return (
                        <button
                          aria-label={`${item.label} ${item.value} 条`}
                          className={cn(
                            "h-full transition-[width,opacity] duration-300",
                            item.barClassName,
                            item.value === 0 && "pointer-events-none opacity-0",
                            selectedKey === item.key && "opacity-100 ring-2 ring-background ring-inset",
                          )}
                          key={item.key}
                          onClick={() => {
                            setWorkflowKey(item.key);
                          }}
                          style={{ width: `${width}%` }}
                          title={`${item.label} ${item.value} 条`}
                          type="button"
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {workflowItems.map((item) => (
                      <button
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                          selectedKey === item.key
                            ? "border-primary/30 bg-primary/5"
                            : "border-transparent bg-muted/25 hover:bg-muted/55",
                        )}
                        key={item.key}
                        onClick={() => {
                          setWorkflowKey(item.key);
                        }}
                        type="button"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", item.dotClassName)} />
                        <span className="truncate text-xs text-muted-foreground">{item.label}</span>
                        <span className="ml-auto text-sm font-semibold">{item.value}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-4 space-y-4">
                  {riskItems.map((item) => (
                    <button
                      className="group block w-full text-left"
                      key={item.key}
                      onClick={() => {
                        setRiskKey(item.key);
                      }}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn("size-2 rounded-full", item.dotClassName)} />
                          {item.label}
                        </span>
                        <span className="text-sm font-semibold">{item.value}</span>
                      </span>
                      <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full transition-[width] duration-300", item.barClassName)}
                          style={{ width: `${(item.value / riskMax) * 100}%` }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-full flex-col border-t border-border bg-muted/20 px-5 py-6 sm:px-6 lg:border-l lg:border-t-0">
            <div>
              <p className="text-sm font-semibold">选择要处理的队列</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                切换选择只改变当前入口，不创建重复页面。
              </p>
            </div>

            <div className="mt-5 inline-flex rounded-lg bg-muted p-1">
              <button
                aria-pressed={view === "workflow"}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "workflow" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setView("workflow")}
                type="button"
              >
                工作流
              </button>
              <button
                aria-pressed={view === "risk"}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "risk" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setView("risk")}
                type="button"
              >
                风险
              </button>
            </div>

            <div className="mt-5">
              <Select
                items={activeItems.map((item) => ({ value: item.key, label: `${item.label} · ${item.value}` }))}
                onValueChange={(value) => {
                  if (!value) return;
                  if (view === "workflow") {
                    setWorkflowKey(value as CockpitKey);
                  } else {
                    setRiskKey(value as CockpitKey);
                  }
                }}
                value={selectedItem.key}
              >
                <SelectTrigger className="h-10 w-full bg-background"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {activeItems.map((item) => <SelectItem key={item.key} value={item.key}>{item.label} · {item.value}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </div>
            <div className="mt-auto pt-5">
              <div className="rounded-lg border border-border bg-background px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">当前选择</span>
                <span className="text-xs font-medium">{selectedItem.label}</span>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold leading-none"><AnimatedNumber value={selectedItem.value} /></span>
                <span className="pb-1 text-xs text-muted-foreground">条记录</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{selectedItem.detail}</p>
              </div>

              <Link className={buttonVariants({ className: "mt-4 w-full" })} href={selectedItem.href}>
              进入{selectedItem.label}
              <ArrowRight data-icon="inline-end" />
              </Link>
              <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
              所有选择共享一个审核工作台，筛选条件会随入口带入。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
