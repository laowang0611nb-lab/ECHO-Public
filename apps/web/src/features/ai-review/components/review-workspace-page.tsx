"use client";

import type {
  ReviewDecisionRequest,
  ReviewFlag,
  ReviewVersion,
} from "@echo/shared-types";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ExternalLink,
  FileText,
  History,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useReviewContext,
  useReviewDecision,
  useReviewFlag,
  useReviewQuery,
  useReviewRegeneration,
  useReviewRegenerationStatus,
} from "@/features/ai-review/queries";
import type { ReviewQueueFilters } from "@/features/ai-review/types";
import {
  buildReviewWorkspaceHref,
  reviewReasonLabels,
  reviewSeverityLabel,
  reviewSeverityTone,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/features/ai-review/view-model";
import { buildSourceHref } from "@/features/knowledge/view-model";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

export function ReviewWorkspacePage({
  initialCourseId,
  initialFilters,
  reviewId,
}: {
  initialCourseId?: string;
  initialFilters: ReviewQueueFilters;
  reviewId?: string;
}) {
  const router = useRouter();
  const { courses, selectedCourseId } = useCourseWorkspace();
  const [filters, setFilters] = useState(initialFilters);
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const deferredSearch = useDeferredValue(filters.search);
  const queueQuery = useReviewQuery(courseId, {
    status: filters.status === "all" ? undefined : filters.status,
    severity: filters.severity === "all" ? undefined : filters.severity,
    reason: filters.reason === "all" ? undefined : filters.reason,
    q: deferredSearch.trim() || undefined,
    sort: filters.sort,
    limit: 100,
  });
  const visibleFlags = queueQuery.data?.items ?? [];
  const requestedId = reviewId ?? visibleFlags[0]?.id ?? null;
  const flagQuery = useReviewFlag(courseId, requestedId);
  const flag = flagQuery.data ?? null;
  const contextQuery = useReviewContext(courseId, flag?.id ?? null);
  const knowledgePointIds = new Set(contextQuery.data?.knowledgePointIds ?? flag?.knowledgePointIds ?? []);
  const citations = Array.from(
    new Map((contextQuery.data?.citations ?? flag?.citations ?? []).map((citation) => [
      `${citation.document_id}:${citation.page_start}:${citation.chunk_id ?? ""}`,
      citation,
    ])).values(),
  );
  const currentVersion = contextQuery.data?.current_version
    ?? flag?.versions.find((version) => version.version === flag.current_version)
    ?? null;


  function matchesFilters(flag: ReviewFlag, next: ReviewQueueFilters) {
    const keyword = next.search.trim().toLowerCase();
    return (
      (!keyword
        || flag.student_display_name.toLowerCase().includes(keyword)
        || (flag.question ?? "").toLowerCase().includes(keyword)
        || flag.answer.toLowerCase().includes(keyword))
      && (next.status === "all" || flag.status === next.status)
      && (next.reason === "all" || flag.reason === next.reason)
      && (next.severity === "all" || flag.severity === next.severity)
    );
  }

  function updateFilters(patch: Partial<ReviewQueueFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const nextReview = visibleFlags.find((item) => matchesFilters(item, next))?.id ?? null;
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    if (nextReview) params.set("reviewId", nextReview);
    if (next.search.trim()) params.set("q", next.search.trim());
    if (next.status !== "all") params.set("status", next.status);
    if (next.reason !== "all") params.set("reason", next.reason);
    if (next.severity !== "all") params.set("severity", next.severity);
    if (next.sort !== "priority") params.set("sort", next.sort);
    router.replace(`/ai-review/pending?${params.toString()}`, { scroll: false });
  }

  function handleCompleted(completedId: string) {
    if (!courseId) return;
    const remaining = visibleFlags.filter((item) => item.id !== completedId);
    const nextId = remaining[0]?.id ?? null;
    if (nextId) {
      router.replace(buildReviewWorkspaceHref(nextId, courseId, filters), { scroll: false });
    } else {
      const params = new URLSearchParams({ courseId });
      if (filters.search.trim()) params.set("q", filters.search.trim());
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.reason !== "all") params.set("reason", filters.reason);
      if (filters.severity !== "all") params.set("severity", filters.severity);
      router.replace(`/ai-review?${params.toString()}`, { scroll: false });
    }
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，再进入 AI 回答审核工作台。" title="尚未选择课程" />;
  }
  if (queueQuery.isLoading || (requestedId && flagQuery.isLoading)) return <LoadingState label="正在加载审核工作台..." />;
  if (queueQuery.isError || flagQuery.isError) return <ErrorState description="审核工作台加载失败，请确认后端服务后重试。" onRetry={() => { void queueQuery.refetch(); void flagQuery.refetch(); }} />;
  if (reviewId && !flag) {
    return (
      <EmptyState
        action={<Link className={buttonVariants({ variant: "outline" })} href={`/ai-review?courseId=${courseId}`}>返回审核总览</Link>}
        description="审核项不存在，或已被其他教师处理并移出当前队列。"
        title="未找到审核项"
      />
    );
  }
  if (!flag) {
    return (
      <EmptyState
        action={<Link className={buttonVariants({ variant: "outline" })} href={`/ai-review?courseId=${courseId}`}>返回审核总览</Link>}
        description="当前筛选条件下没有可审核的回答。"
        title="审核队列已完成"
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border-2 border-border bg-card px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">AI 教学 / AI 回答审核 / 工作台</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">审核工作台</h1>
              <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
              <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground" title={`${flag.student_display_name} · ${reviewReasonLabels[flag.reason]}`}>
              {flag.student_display_name} · {reviewReasonLabels[flag.reason]} · 审核项 {flag.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
            <Link className={buttonVariants({ variant: "outline" })} href={`/ai-review?courseId=${courseId}`}>审核总览</Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)_340px] xl:items-start">
        <ReviewQueueList
          courseId={courseId}
          currentId={flag.id}
          filters={filters}
          flags={visibleFlags}
          onFiltersChange={updateFilters}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <ReviewContentCard
            citations={citations}
            courseId={courseId}
            currentVersion={currentVersion}
            flag={flag}
            knowledgePointIds={knowledgePointIds}
          />
          <ReviewHistoryPanel history={contextQuery.data?.review_history ?? flag.review_history} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20">
          <ReviewEvidenceCard contextQuery={contextQuery} flag={flag} />
          <ReviewDecisionPanel
            courseId={courseId}
            flag={flag}
            key={flag.id}
            onCompleted={handleCompleted}
          />
          <ReviewRegenerationPanel
            courseId={courseId}
            flag={flag}
            key={`regenerate-${flag.id}`}
            onChanged={() => { void flagQuery.refetch(); void queueQuery.refetch(); void contextQuery.refetch(); }}
          />
        </aside>
      </div>
    </div>
  );
}

function ReviewContentCard({
  citations,
  courseId,
  currentVersion,
  flag,
  knowledgePointIds,
}: {
  citations: ReviewFlag["citations"];
  courseId: string;
  currentVersion: ReviewVersion | null;
  flag: ReviewFlag;
  knowledgePointIds: Set<string>;
}) {
  const originalVersion = flag.versions.find((version) => version.version === 1) ?? null;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle>当前审核内容</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {flag.student_display_name} 的提问与 AI 回答版本，教师决定前不会被覆盖。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
            <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ReviewSection icon={MessageSquareText} label="学生问题">
          <p className="whitespace-pre-wrap text-sm leading-7">{flag.question || "当前审核项没有保存问题文本。"}</p>
        </ReviewSection>

        <ReviewSection icon={FileText} label="AI 原回答" meta="version 1">
          <p className="whitespace-pre-wrap text-sm leading-7">{originalVersion?.answer ?? flag.answer}</p>
        </ReviewSection>

        {currentVersion && currentVersion.version > 1 ? (
          <ReviewSection icon={Sparkles} label="当前生成版本" meta={`version ${currentVersion.version}`} tone="current">
            <p className="whitespace-pre-wrap text-sm leading-7">{currentVersion.answer}</p>
            {currentVersion.instruction ? (
              <p className="mt-3 rounded-md bg-card/80 px-3 py-2 text-xs leading-5 text-muted-foreground">
                修改意见：{currentVersion.instruction}
              </p>
            ) : null}
          </ReviewSection>
        ) : null}

        {flag.corrected_answer ? (
          <ReviewSection icon={Check} label="教师修改稿" tone="success">
            <p className="whitespace-pre-wrap text-sm leading-7">{flag.corrected_answer}</p>
          </ReviewSection>
        ) : null}

        <ReviewSection icon={BookOpenCheck} label="证据入口">
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/students/${flag.student_id}/conversations/${flag.conversation_id}?from=ai-review&courseId=${courseId}&reviewId=${flag.id}&messageId=${flag.message_id}`}
            >
              查看完整学生对话 <ExternalLink className="size-3.5" />
            </Link>
            {knowledgePointIds.size ? Array.from(knowledgePointIds).map((pointId) => (
              <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/knowledge/points/${pointId}?from=review&courseId=${courseId}&reviewId=${flag.id}&messageId=${flag.message_id}`} key={pointId}>
                关联知识点
              </Link>
            )) : <span className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">未关联知识点</span>}
          </div>
        </ReviewSection>

        <ReviewSection icon={BookOpenCheck} label="引用来源">
          {citations.length ? (
            <div className="flex flex-wrap gap-2">
              {citations.map((citation, index) => (
                citation.document_id ? (
                  <Link
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={buildSourceHref(citation.document_id, {
                      from: "review",
                      courseId,
                      knowledgePointId: Array.from(knowledgePointIds)[0],
                      page: citation.page_start,
                      chunkId: citation.chunk_id ?? undefined,
                      conversationId: flag.conversation_id,
                      messageId: flag.message_id,
                      reviewId: flag.id,
                    })}
                    key={`${citation.document_id}-${citation.page_start}-${index}`}
                  >
                    来源 {index + 1} · 第 {citation.page_start} 页
                  </Link>
                ) : null
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">当前回答没有可追溯的教材引用。</p>}
        </ReviewSection>

        <ReviewVersionsPanel currentVersion={flag.current_version} versions={flag.versions} />
      </CardContent>
    </Card>
  );
}

function ReviewSection({
  children,
  icon: Icon,
  label,
  meta,
  tone = "default",
}: {
  children: React.ReactNode;
  icon: typeof MessageSquareText;
  label: string;
  meta?: string;
  tone?: "default" | "current" | "success";
}) {
  return (
    <section className={`border-b px-5 py-5 last:border-b-0 ${tone === "current" ? "bg-blue-50/35" : tone === "success" ? "bg-emerald-50/30" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={`flex items-center gap-2 text-xs font-semibold ${tone === "current" ? "text-primary" : tone === "success" ? "text-emerald-700" : "text-muted-foreground"}`}>
          <Icon className="size-3.5" />
          {label}
        </p>
        {meta ? <span className="text-[11px] text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ReviewEvidenceCard({
  contextQuery,
  flag,
}: {
  contextQuery: ReturnType<typeof useReviewContext>;
  flag: ReviewFlag;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4 text-orange-500" />审核依据</CardTitle>
        <p className="text-xs text-muted-foreground">系统信号、上下文和教师决定分开记录。</p>
      </CardHeader>
      <CardContent className="space-y-3 px-5 text-sm">
        <EvidenceLine label="风险原因" value={reviewReasonLabels[flag.reason]} />
        <EvidenceLine label="严重级别" value={reviewSeverityLabel(flag.severity)} />
        <EvidenceLine label="当前状态" value={reviewStatusLabel(flag.status)} />
        <EvidenceLine
          label="近期学习证据"
          value={
            contextQuery.isLoading
              ? "加载中"
              : contextQuery.isError
                ? "读取失败"
                : `${contextQuery.data?.recent_learning_events.length ?? 0} 条`
          }
        />
        <details className="rounded-lg border border-border bg-muted/35 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">查看关联标识</summary>
          <div className="mt-2 flex flex-col gap-1 break-all text-[11px] text-muted-foreground">
            <span>审核项：{flag.id}</span>
            <span>消息：{flag.message_id}</span>
          </div>
        </details>
        {contextQuery.isError ? (
          <Button onClick={() => void contextQuery.refetch()} size="sm" type="button" variant="outline">
            重新读取上下文
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReviewQueueList({
  courseId,
  currentId,
  filters,
  flags,
  onFiltersChange,
}: {
  courseId: string;
  currentId: string;
  filters: ReviewQueueFilters;
  flags: ReviewFlag[];
  onFiltersChange: (patch: Partial<ReviewQueueFilters>) => void;
}) {
  const currentVisible = flags.some((item) => item.id === currentId);
  return (
    <Card className="gap-0 py-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
      <CardHeader className="border-b px-4 py-4">
        <CardTitle>审核队列</CardTitle>
        <p className="text-xs text-muted-foreground">当前筛选 {flags.length} 条</p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3 p-4">
        <Input onChange={(event) => onFiltersChange({ search: event.target.value })} placeholder="搜索队列..." value={filters.search} />
        <Select
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
          onValueChange={(value) => value && onFiltersChange({ status: value as ReviewQueueFilters["status"] })}
          value={filters.status}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="generating">重新生成中</SelectItem>
            <SelectItem value="pending_rereview">待再次审核</SelectItem>
            <SelectItem value="regeneration_failed">重新生成失败</SelectItem>
            <SelectItem value="open">待审核</SelectItem>
            <SelectItem value="confirmed_correct">确认正确</SelectItem>
            <SelectItem value="marked_incorrect">已标记错误</SelectItem>
            <SelectItem value="dismissed">已忽略</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        {!currentVisible ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
            当前审核项已移出这个筛选结果，完成后会自动进入下一条匹配记录。
          </p>
        ) : null}
        <div className="flex max-h-[calc(100vh-19rem)] flex-col gap-2 overflow-y-auto pr-0.5">
          {flags.map((item) => (
            <Link
              className={`block rounded-lg border-2 px-3 py-3 transition-colors ${item.id === currentId ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/45"}`}
              href={buildReviewWorkspaceHref(item.id, courseId, filters)}
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge tone={reviewSeverityTone(item.severity)}>{reviewSeverityLabel(item.severity)}</StatusBadge>
                <span className="text-[11px] text-muted-foreground">{item.updated_at.slice(5, 10)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium">{item.question || "未保存问题"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.student_display_name} · {reviewReasonLabels[item.reason]}</p>
            </Link>
          ))}
          {!flags.length ? <EmptyState description="当前筛选下没有审核记录。" title="没有待审核项" /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDecisionPanel({
  courseId,
  flag,
  onCompleted,
}: {
  courseId: string;
  flag: ReviewFlag;
  onCompleted: (reviewId: string) => void;
}) {
  const [note, setNote] = useState(flag.teacher_note ?? "");
  const [correctedAnswer, setCorrectedAnswer] = useState(flag.corrected_answer ?? "");
  const decisionMutation = useReviewDecision(courseId);
  const isGenerating = flag.status === "generating";

  async function handleDecision(decision: ReviewDecisionRequest["decision"]) {
    const payload: ReviewDecisionRequest = {
      decision,
      note: note.trim() || undefined,
      corrected_answer: decision === "mark_incorrect" ? correctedAnswer.trim() || undefined : undefined,
    };
    await decisionMutation.mutateAsync({ flagId: flag.id, payload });
    onCompleted(flag.id);
  }


  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>教师审核决定</CardTitle><p className="text-xs text-muted-foreground">决定会写入真实审核接口并保留原回答。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        {isGenerating ? <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">当前回答正在重新生成，完成后会进入待再次审核。</p> : null}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">审核备注</span>
          <Textarea onChange={(event) => setNote(event.target.value)} placeholder="填写判断依据或后续处理说明..." value={note} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">教师修改稿</span>
          <Textarea onChange={(event) => setCorrectedAnswer(event.target.value)} placeholder="标记错误时填写修改稿（可选）..." value={correctedAnswer} />
        </label>
        <div className="grid gap-2">
          <Button disabled={decisionMutation.isPending || isGenerating} onClick={() => void handleDecision("confirm_correct")} type="button">
            <Check data-icon="inline-start" />确认回答正确
          </Button>
          <Button disabled={decisionMutation.isPending || isGenerating} onClick={() => void handleDecision("mark_incorrect")} type="button" variant="destructive">
            <Save data-icon="inline-start" />标记错误并提交修改稿
          </Button>
          <Button disabled={decisionMutation.isPending || isGenerating} onClick={() => void handleDecision("dismiss")} type="button" variant="outline">
            <X data-icon="inline-start" />忽略该风险
          </Button>
        </div>
        {decisionMutation.isError ? <p className="text-sm text-destructive">{decisionMutation.error instanceof Error ? decisionMutation.error.message : "审核提交失败。"}</p> : null}
      </CardContent>
    </Card>
  );
}

function ReviewVersionsPanel({
  currentVersion,
  versions,
}: {
  currentVersion: number;
  versions: ReviewFlag["versions"];
}) {
  if (!versions.length) return null;
  const labels = { original: "原始回答", regenerated: "AI 重新生成", teacher: "教师修改稿" } as const;
  return (
    <section className="border-t border-border px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">回答版本</p>
        <span className="text-[11px] text-muted-foreground">共 {versions.length} 个版本</span>
      </div>
      <div className="mt-4 space-y-3">
        {versions.map((version) => (
          <details className="rounded-lg border-2 border-border bg-muted/20 px-4 py-3.5" key={version.version}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                version {version.version}
                {version.version === currentVersion ? <StatusBadge tone="info">当前版本</StatusBadge> : null}
              </span>
              <span className="text-xs text-muted-foreground">{labels[version.source]} · {version.created_at.slice(0, 16).replace("T", " ")}</span>
            </summary>
            <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm leading-7">{version.answer}</p>
            {version.instruction ? <p className="mt-2 text-xs leading-5 text-muted-foreground">修改意见：{version.instruction}</p> : null}
            <p className="mt-2 text-[11px] text-muted-foreground">知识点 {version.knowledgePointIds.length} · Citation {version.citations.length}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ReviewHistoryPanel({ history }: { history: ReviewFlag["review_history"] }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><History className="size-4 text-muted-foreground" />审核历史</CardTitle><p className="text-xs text-muted-foreground">来自后端持久化记录。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        {history.length ? history.map((entry) => (
          <div className="rounded-lg border-2 border-border px-3 py-3" key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">version {entry.version} · {entry.action === "regenerate" ? "重新生成" : reviewStatusLabel(entry.to_status)}</span>
              <span className="text-[11px] text-muted-foreground">{entry.created_at.slice(0, 16).replace("T", " ")}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{reviewStatusLabel(entry.from_status)} → {reviewStatusLabel(entry.to_status)}{entry.teacher_display_name ? ` · ${entry.teacher_display_name}` : ""}</p>
            {entry.note ? <p className="mt-2 text-sm leading-6">{entry.note}</p> : null}
          </div>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">暂无审核记录。</p>}
      </CardContent>
    </Card>
  );
}

function ReviewRegenerationPanel({
  courseId,
  flag,
  onChanged,
}: {
  courseId: string;
  flag: ReviewFlag;
  onChanged: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const regenerationMutation = useReviewRegeneration(courseId);
  const regenerationStatusQuery = useReviewRegenerationStatus(courseId, flag.id);
  const generationStatus = regenerationStatusQuery.data;
  const isGenerating = regenerationMutation.isPending
    || generationStatus?.status === "generating"
    || flag.status === "generating";
  const generationError = generationStatus?.error
    ?? (flag.status === "regeneration_failed" ? "重新生成失败，请调整要求后重试。" : null);

  async function handleRegeneration() {
    const normalized = instruction.trim();
    if (!normalized) return;
    await regenerationMutation.mutateAsync({
      flagId: flag.id,
      payload: { instruction: normalized, base_version: flag.current_version },
    });
    onChanged();
  }

  return (
    <Card className="gap-3 border-dashed bg-muted/15 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><RefreshCw className="size-4 text-muted-foreground" />需要重新生成</CardTitle><p className="text-xs text-muted-foreground">生成新版本并进入待再次审核，不覆盖原回答。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        <Textarea onChange={(event) => setInstruction(event.target.value)} placeholder="填写修改要求，例如：更简洁、补充教材依据..." value={instruction} />
        {isGenerating ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>正在生成新版本，完成后进入待再次审核</span>
              <span>{generationStatus?.progress ?? 5}%</span>
            </div>
            <Progress value={generationStatus?.progress ?? 5} />
          </div>
        ) : null}
        <Button
          disabled={isGenerating || !instruction.trim()}
          onClick={() => void handleRegeneration()}
          type="button"
          variant="outline"
        >

          <RefreshCw data-icon="inline-start" />
          {isGenerating ? "重新生成中" : generationError ? "重试重新生成" : "重新生成回答"}
        </Button>
        {regenerationMutation.isError ? <p className="text-sm text-destructive">{regenerationMutation.error instanceof Error ? regenerationMutation.error.message : "重新生成失败。"}</p> : null}
        {generationError ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{generationError}</p> : null}
      </CardContent>
    </Card>
  );
}

function EvidenceLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? "break-all text-xs" : ""}`}>{value}</span>
    </div>
  );
}
