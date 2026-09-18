"use client";

import { AlertTriangle, ArrowRight, Clock, FileWarning, Inbox, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReviewQueueFilters } from "@/features/ai-review/types";
import {
  buildReviewWorkspaceHref,
  filterReviewFlags,
  reviewReasonLabels,
  reviewSeverityLabel,
  reviewSeverityTone,
  reviewStatusLabel,
  reviewStatusTone,
  sortReviewFlags,
  summarizeReviewFlags,
} from "@/features/ai-review/view-model";
import { useReviewQueue } from "@/features/ai-review/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

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
  const queueQuery = useReviewQueue(courseId);
  const allFlags = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);
  const summary = summarizeReviewFlags(allFlags);
  const visibleFlags = useMemo(
    () => sortReviewFlags(filterReviewFlags(allFlags, filters), filters.sort),
    [allFlags, filters],
  );

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
  if (queueQuery.isLoading) return <LoadingState label="正在加载 AI 回答审核队列..." />;
  if (queueQuery.isError) return <ErrorState description="审核队列加载失败，请确认后端服务后重试。" onRetry={() => void queueQuery.refetch()} />;

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
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        }
        breadcrumbs={[{ label: "AI 教学" }, { label: "AI 回答审核" }]}
        description="集中查看需要教师判断的 AI 回答，区分风险来源与证据，再进入工作台完成审核。"
        title="AI 回答审核"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="待审核" supporting="状态为待审核的真实记录" value={summary.pending} />
        <StatCard icon={AlertTriangle} label="高风险回答" supporting="后端 severity=high" tone="warning" value={summary.highRisk} />
        <StatCard icon={FileWarning} label="缺少课程依据" supporting="未检索到教材来源" value={summary.missingBasis} />
        <StatCard icon={ShieldCheck} label="学生未解决" supporting="学生主动标记或连续追问" value={summary.unresolved} />
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle>风险摘要</CardTitle>
          <p className="text-xs text-muted-foreground">风险信号只来自后端 ReviewFlag，不在前端自行计算高风险分数。</p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 md:grid-cols-3">
          <RiskSummaryCard
            detail={`${summary.pending} 条记录等待教师决定`}
            href="/ai-review?status=open"
            title="待处理队列"
          />
          <RiskSummaryCard
            detail={`${summary.highRisk} 条记录由后端标记为高风险`}
            href="/ai-review?severity=high"
            title="高优先级风险"
          />
          <RiskSummaryCard
            detail={`${summary.reviewed} 条记录已有教师审核结果`}
            href="/ai-review?status=confirmed_correct"
            title="已审核记录"
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
                  { value: "severity", label: "风险级别" },
                ]}
                onValueChange={(value) => updateQuery({ sort: value as ReviewQueueFilters["sort"] })}
                value={filters.sort}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>显示 {visibleFlags.length} / {summary.total} 条</span>
              <span>·</span>
              <span>待审核 {summary.pending}</span>
              <span>·</span>
              <span>高风险 {summary.highRisk}</span>
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

function RiskSummaryCard({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link className="rounded-lg border-2 border-border bg-muted/25 px-4 py-4 transition-colors hover:border-primary/35 hover:bg-muted/50" href={href}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">查看队列 <ArrowRight className="size-3.5" /></span>
    </Link>
  );
}
