"use client";

import type { ReviewFlagSummary } from "@echo/shared-types";
import { AlertTriangle, ArrowRight, Clock, FileWarning, Inbox, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { AnimatedNumber } from "@/components/common/animated-number";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewQueueFilters } from "@/features/ai-review/types";
import {
  buildReviewWorkspaceHref,
  reviewReasonLabels,
  reviewSeverityLabel,
  reviewSeverityTone,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/features/ai-review/view-model";
import { useReviewInfiniteQuery, useReviewSummary } from "@/features/ai-review/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { cn } from "@/lib/utils";

export function ReviewOverviewPage({
  initialCourseId,
  initialFilters,
}: {
  initialCourseId?: string;
  initialFilters: ReviewQueueFilters;
}) {
  const router = useRouter();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const [filters, setFilters] = useState(initialFilters);
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const deferredSearch = useDeferredValue(filters.search);
  const queueQuery = useReviewInfiniteQuery(courseId, {
    status: filters.status === "all" ? undefined : filters.status,
    severity: filters.severity === "all" ? undefined : filters.severity,
    reason: filters.reason === "all" ? undefined : filters.reason,
    q: deferredSearch.trim() || undefined,
    sort: filters.sort,
    limit: 100,
  });
  const summaryQuery = useReviewSummary(courseId);
  const visibleFlags = queueQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const summary = summaryQuery.data ?? queueQuery.data?.pages[0]?.summary ?? null;
  const summaryData: ReviewFlagSummary = summary ?? {
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
  const highRiskShare = summaryData.pending > 0
    ? Math.min(100, Math.round((summaryData.high_risk / summaryData.pending) * 100))
    : 0;
  const firstReviewPending = Math.max(0, summaryData.pending - summaryData.pending_rereview);

  function updateQuery(patch: Partial<ReviewQueueFilters> & { courseId?: string }) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const params = new URLSearchParams();
    const nextCourseId = patch.courseId ?? courseId;
    if (nextCourseId) params.set("courseId", nextCourseId);
    if (next.search.trim()) params.set("q", next.search.trim());
    if (next.status !== "all") params.set("status", next.status);
    if (next.reason !== "all") params.set("reason", next.reason);
    if (next.severity !== "all") params.set("severity", next.severity);
    if (next.sort !== "priority") params.set("sort", next.sort);
    router.replace(`/ai-review?${params.toString()}`, { scroll: false });
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，AI 回答审核会基于当前课程真实数据展示。" title="尚未选择课程" />;
  }
  if (queueQuery.isLoading || (summaryQuery.isLoading && !queueQuery.data?.pages[0]?.summary)) return <LoadingState label="正在加载 AI 回答审核队列..." />;
  if (queueQuery.isError || (summaryQuery.isError && !queueQuery.data?.pages[0]?.summary)) {
    return <ErrorState description="审核队列加载失败，请确认后端服务后重试。" onRetry={() => { void queueQuery.refetch(); void summaryQuery.refetch(); }} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Select
            items={courses.map((course) => ({ value: course.id, label: course.name }))}
            onValueChange={(value) => {
              if (!value) return;
              setSelectedCourseId(value);
              updateQuery({ courseId: value });
            }}
            value={courseId}
          >
            <SelectTrigger className="w-[min(280px,60vw)]"><SelectValue className="truncate" /></SelectTrigger>
            <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        }
        breadcrumbs={[{ label: "AI 教学" }, { label: "AI 回答审核" }]}
        description="集中查看需要教师判断的 AI 回答，区分风险来源与证据，再进入工作台完成审核。"
        title="AI 回答审核"
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="grid lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,2.15fr)]">
          <Link
            className="group relative flex min-h-36 flex-col justify-between overflow-hidden bg-sidebar px-5 py-5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            href={`/ai-review?courseId=${courseId}&status=open`}
          >
            <span className="pointer-events-none absolute inset-y-5 left-0 w-0.5 rounded-r-full bg-primary" />
            <span className="flex items-start justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground/70">
                <Inbox className="size-4 text-[#7fb4ff]" />
                待审核
              </span>
              <ArrowRight className="size-4 text-sidebar-foreground/45 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sidebar-foreground" />
            </span>
            <span>
              <span className="flex items-end gap-2">
                <span className="text-4xl font-semibold leading-none tracking-tight"><AnimatedNumber value={summaryData.pending} /></span>
                <span className="pb-1 text-xs text-sidebar-foreground/60">条记录</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-sidebar-foreground/60">首次审核与再次审核合计</span>
            </span>
          </Link>
          <div className="grid sm:grid-cols-3">
            <ReviewSignal
              detail={`占待审核记录 ${highRiskShare}%`}
              href={`/ai-review?courseId=${courseId}&severity=high`}
              icon={AlertTriangle}
              label="高风险回答"
              tone="danger"
              value={summaryData.high_risk}
            />
            <ReviewSignal
              detail="未检索到教材来源"
              href={`/ai-review?courseId=${courseId}&reason=missing_course_basis`}
              icon={FileWarning}
              label="缺少课程依据"
              tone="warning"
              value={summaryData.reasons.missing_course_basis}
            />
            <ReviewSignal
              detail="学生主动标记或连续追问"
              href={`/ai-review?courseId=${courseId}&reason=student_not_resolved`}
              icon={ShieldCheck}
              label="学生未解决"
              tone="info"
              value={summaryData.reasons.student_not_resolved}
            />
          </div>
        </div>
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle>风险摘要</CardTitle>
          <p className="text-xs text-muted-foreground">风险信号只来自后端 ReviewFlag，不在前端自行计算高风险分数。</p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 md:grid-cols-2 xl:grid-cols-4">
          <RiskSummaryCard
            count={firstReviewPending}
            detail="等待首次教师判断"
            href={`/ai-review?courseId=${courseId}&status=open`}
            title="待首次审核"
          />
          <RiskSummaryCard
            count={summaryData.pending_rereview}
            detail="重新生成后等待教师复核"
            href={`/ai-review?courseId=${courseId}&status=pending_rereview`}
            title="待再次审核"
          />
          <RiskSummaryCard
            count={summaryData.generating}
            detail="AI 正在生成新版本"
            href={`/ai-review?courseId=${courseId}&status=generating`}
            title="重新生成中"
            tone="info"
          />
          <RiskSummaryCard
            count={summaryData.regeneration_failed}
            detail="生成失败，可进入工作台重试"
            href={`/ai-review?courseId=${courseId}&status=regeneration_failed`}
            title="重新生成失败"
            tone="danger"
          />
        </CardContent>
      </Card>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <div className="flex flex-col gap-3">
            <div>
              <CardTitle>审核队列</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">总览只做筛选和预览；审核决定请进入工作台完成。</p>
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_150px_180px_140px_150px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" onChange={(event) => updateQuery({ search: event.target.value })} placeholder="搜索学生、问题或回答..." value={filters.search} />
              </div>
              <ReviewFilterSelect
                items={[
                  { value: "all", label: "全部状态" },
                  { value: "generating", label: "重新生成中" },
                  { value: "pending_rereview", label: "待再次审核" },
                  { value: "regeneration_failed", label: "重新生成失败" },
                  { value: "open", label: "待审核" },
                  { value: "confirmed_correct", label: "确认正确" },
                  { value: "marked_incorrect", label: "已标记错误" },
                  { value: "dismissed", label: "已忽略" },
                ]}
                onValueChange={(value) => updateQuery({ status: value as ReviewQueueFilters["status"] })}
                value={filters.status}
              />
              <ReviewFilterSelect
                items={[
                  { value: "all", label: "全部原因" },
                  ...Object.entries(reviewReasonLabels).map(([value, label]) => ({ value, label })),
                ]}
                onValueChange={(value) => updateQuery({ reason: value as ReviewQueueFilters["reason"] })}
                value={filters.reason}
              />
              <ReviewFilterSelect
                items={[
                  { value: "all", label: "全部级别" },
                  { value: "high", label: "高风险" },
                  { value: "medium", label: "中风险" },
                  { value: "low", label: "低风险" },
                ]}
                onValueChange={(value) => updateQuery({ severity: value as ReviewQueueFilters["severity"] })}
                value={filters.severity}
              />
              <ReviewFilterSelect
                items={[
                  { value: "priority", label: "优先级排序" },
                  { value: "newest", label: "最新优先" },
                  { value: "oldest", label: "最早优先" },
                  { value: "severity", label: "风险级别" },
                ]}
                onValueChange={(value) => updateQuery({ sort: value as ReviewQueueFilters["sort"] })}
                value={filters.sort}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>显示 {visibleFlags.length} / {queueQuery.data?.pages[0]?.total ?? 0} 条</span>
              <span>·</span>
              <span>待审核 {summaryData.pending}</span>
              <span>·</span>
              <span>高风险 {summaryData.high_risk}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-border px-0">
          {visibleFlags.length ? visibleFlags.map((flag) => (
            <Link
              className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[130px_minmax(0,1fr)_130px_110px]"
              href={buildReviewWorkspaceHref(flag.id, courseId, filters)}
              key={flag.id}
            >
              <div className="flex flex-wrap items-start gap-2">
                <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
                <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{flag.student_display_name} · {reviewReasonLabels[flag.reason]}</p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">{flag.question || "未保存学生问题"}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{flag.corrected_answer || flag.answer}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground lg:block">
                <Clock className="size-3.5 lg:hidden" />
                <span className="block">{flag.updated_at.slice(0, 10)}</span>
                <span className="mt-1 block">{flag.reviewed_at ? "已有审核记录" : "等待教师决定"}</span>
              </div>
              <span className="flex items-center justify-end gap-1 text-sm font-medium text-primary">
                进入工作台 <ArrowRight className="size-4" />
              </span>
            </Link>
          )) : <EmptyState description="调整筛选条件，或等待新的风险回答进入队列。" title="当前筛选下没有审核记录" />}
        </CardContent>
        {queueQuery.hasNextPage ? (
          <div className="border-t border-border px-5 py-4 text-center">
            <Button onClick={() => void queueQuery.fetchNextPage()} type="button" variant="outline">
              {queueQuery.isFetchingNextPage ? "正在加载..." : "加载更多审核记录"}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ReviewFilterSelect({
  items,
  onValueChange,
  value,
}: {
  items: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select items={items} onValueChange={(next) => next && onValueChange(next)} value={value}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  );
}
function ReviewSignal({
  label,
  detail,
  href,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  detail: string;
  href: string;
  value: number;
  icon: LucideIcon;
  tone: "danger" | "warning" | "info";
}) {
  return (
    <Link
      className="group relative flex min-h-36 flex-col justify-between gap-5 border-t border-border px-5 py-4 transition-colors first:border-t-0 hover:bg-muted/35 sm:border-l sm:border-t-0"
      href={href}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            tone === "danger" && "bg-red-50 text-red-600",
            tone === "warning" && "bg-amber-50 text-amber-600",
            tone === "info" && "bg-blue-50 text-blue-700",
          )}
        >
          <Icon className="size-4" />
        </span>
      </span>
      <span className="block">
        <span className="block text-2xl font-semibold leading-none"><AnimatedNumber value={value} /></span>
        <span className="mt-2 block pr-6 text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
      <ArrowRight className="absolute bottom-4 right-4 size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
    </Link>
  );
}

function RiskSummaryCard({
  title,
  detail,
  href,
  count,
  tone = "default",
}: {
  title: string;
  detail: string;
  href: string;
  count: number;
  tone?: "default" | "info" | "danger";
}) {
  return (
    <Link className="group flex min-w-0 items-start justify-between gap-4 rounded-lg border-2 border-border bg-muted/20 px-4 py-4 transition-colors hover:border-primary/35 hover:bg-muted/45" href={href}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">查看队列 <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </span>
      <span className={cn(
        "shrink-0 rounded-lg px-3 py-2 text-xl font-semibold",
        tone === "info" && "bg-blue-50 text-blue-700",
        tone === "danger" && "bg-red-50 text-red-700",
        tone === "default" && "bg-background text-foreground",
      )}>{count}</span>
    </Link>
  );
}
