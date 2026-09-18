"use client";

import type { ReviewDecisionRequest, ReviewFlag } from "@echo/shared-types";
import { ArrowLeft, Check, ExternalLink, FileText, RefreshCw, Save, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useReviewDecision, useReviewFlag, useReviewQueue } from "@/features/ai-review/queries";
import type { ReviewQueueFilters } from "@/features/ai-review/types";
import {
  buildReviewWorkspaceHref,
  extractFlagEvidence,
  filterReviewFlags,
  reviewReasonLabels,
  reviewSeverityLabel,
  reviewSeverityTone,
  reviewStatusLabel,
  reviewStatusTone,
  sortReviewFlags,
} from "@/features/ai-review/view-model";
import { buildSourceHref } from "@/features/knowledge/view-model";
import { useTeacherConversationMessages } from "@/features/students/queries";
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
  const queueQuery = useReviewQueue(courseId);
  const allFlags = useMemo(() => queueQuery.data ?? [], [queueQuery.data]);
  const visibleFlags = useMemo(
    () => sortReviewFlags(filterReviewFlags(allFlags, filters), filters.sort),
    [allFlags, filters],
  );
  const current = allFlags.find((flag) => flag.id === reviewId) ?? visibleFlags[0] ?? null;
  const flagQuery = useReviewFlag(courseId, current?.id ?? null);
  const flag = flagQuery.data ?? current;
  const messagesQuery = useTeacherConversationMessages(courseId, flag?.conversation_id ?? "none");

  const message = messagesQuery.data?.find((item) => item.id === flag?.message_id) ?? null;
  const evidence = flag ? extractFlagEvidence(flag) : { knowledgePointIds: [], citations: [] };
  const knowledgePointIds = new Set([...evidence.knowledgePointIds, ...(message?.knowledgePointIds ?? [])]);
  const citations = [
    ...evidence.citations,
    ...(message?.citations ?? []).flatMap((citation) =>
      citation.document_id
        ? [{ documentId: citation.document_id, page: citation.page_start, chunkId: citation.chunk_id ?? undefined }]
        : [],
    ),
  ];

  function updateFilters(patch: Partial<ReviewQueueFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const nextReview = current && filterReviewFlags(allFlags, next).some((item) => item.id === current.id)
      ? current.id
      : null;
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
  if (queueQuery.isLoading) return <LoadingState label="正在加载审核工作台..." />;
  if (queueQuery.isError) return <ErrorState description="审核工作台加载失败，请确认后端服务后重试。" onRetry={() => void queueQuery.refetch()} />;
  if (!flag) {
    return (
      <EmptyState
        action={<Link className={buttonVariants({ variant: "outline" })} href={`/ai-review?courseId=${courseId}`}>返回审核总览</Link>}
        description="当前筛选条件下没有可审核的回答。"
        title="审核队列已完成"
      />
    );
  }
  if (flagQuery.isError) return <ErrorState description="当前审核项不存在或无法读取。" onRetry={() => void flagQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">AI 教学 / AI 回答审核 / 工作台</p>
          <h1 className="mt-2 text-2xl font-semibold">审核工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看真实问题、AI 回答、引用与学习证据，再提交教师决定。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
          <Link className={buttonVariants({ variant: "outline" })} href={`/ai-review?courseId=${courseId}`}>审核总览</Link>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_360px]">
        <ReviewQueueList
          courseId={courseId}
          currentId={flag.id}
          filters={filters}
          flags={visibleFlags}
          onFiltersChange={updateFilters}
        />

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{flag.student_display_name} · {reviewReasonLabels[flag.reason]}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">审核项 {flag.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
                <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <section className="rounded-lg border-2 border-border bg-muted/35 px-4 py-4">
              <p className="text-xs font-semibold text-muted-foreground">学生问题</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{flag.question || "当前 ReviewFlag 没有保存问题文本。"}</p>
            </section>

            <section className="rounded-lg border-2 border-blue-100 bg-blue-50/35 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-primary"><FileText className="size-3.5" />AI 原回答</p>
                <span className="text-[11px] text-muted-foreground">当前版本：原始回答</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{flag.answer}</p>
            </section>

            {flag.corrected_answer ? (
              <section className="rounded-lg border-2 border-emerald-100 bg-emerald-50/40 px-4 py-4">
                <p className="text-xs font-semibold text-emerald-700">教师修改版本</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{flag.corrected_answer}</p>
              </section>
            ) : null}

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

            <section className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground">引用来源</p>
              {citations.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {citations.map((citation, index) => (
                    <Link
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={buildSourceHref(citation.documentId, {
                        from: "review",
                        courseId,
                        knowledgePointId: Array.from(knowledgePointIds)[0],
                        page: citation.page,
                        chunkId: citation.chunkId,
                        conversationId: flag.conversation_id,
                        messageId: flag.message_id,
                        reviewId: flag.id,
                      })}
                      key={`${citation.documentId}-${citation.page}-${index}`}
                    >
                      来源 {index + 1} · 第 {citation.page} 页
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">当前回答没有可追溯 Citation，不能生成 PDF 来源。</p>}
            </section>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>风险证据</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5 text-sm">
              <EvidenceLine label="后端风险原因" value={reviewReasonLabels[flag.reason]} />
              <EvidenceLine label="严重级别" value={reviewSeverityLabel(flag.severity)} />
              <EvidenceLine label="当前状态" value={reviewStatusLabel(flag.status)} />
              <EvidenceLine label="关联消息" value={flag.message_id} mono />
              <EvidenceLine label="完整对话" value={messagesQuery.isLoading ? "加载中" : messagesQuery.isError ? "加载失败" : `${messagesQuery.data?.length ?? 0} 条消息`} />
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
                系统检测与教材证据分开显示。前端不会用回答长度、消息数量或模型分数推断风险。
              </p>
            </CardContent>
          </Card>

          <ReviewDecisionPanel
            courseId={courseId}
            flag={flag}
            key={flag.id}
            onCompleted={handleCompleted}
          />
        </aside>
      </div>
    </div>
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
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-4">
        <CardTitle>审核队列</CardTitle>
        <p className="text-xs text-muted-foreground">当前筛选 {flags.length} 条</p>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="relative">
          <Input className="pl-3" onChange={(event) => onFiltersChange({ search: event.target.value })} placeholder="搜索队列..." value={filters.search} />
        </div>
        <Select
          items={[
            { value: "all", label: "全部状态" },
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
            <SelectItem value="open">待审核</SelectItem>
            <SelectItem value="confirmed_correct">确认正确</SelectItem>
            <SelectItem value="marked_incorrect">已标记错误</SelectItem>
            <SelectItem value="dismissed">已忽略</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <div className="space-y-2">
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
        <Textarea onChange={(event) => setNote(event.target.value)} placeholder="审核备注或修改意见..." value={note} />
        <Textarea onChange={(event) => setCorrectedAnswer(event.target.value)} placeholder="标记错误时填写修改稿（可选）..." value={correctedAnswer} />
        <div className="grid gap-2">
          <Button disabled={decisionMutation.isPending} onClick={() => void handleDecision("confirm_correct")} type="button">
            <Check data-icon="inline-start" />确认回答正确
          </Button>
          <Button disabled={decisionMutation.isPending} onClick={() => void handleDecision("mark_incorrect")} type="button" variant="destructive">
            <Save data-icon="inline-start" />标记错误并提交修改稿
          </Button>
          <Button disabled={decisionMutation.isPending} onClick={() => void handleDecision("dismiss")} type="button" variant="outline">
            <X data-icon="inline-start" />忽略该风险
          </Button>
          <Button disabled type="button" variant="outline"><RefreshCw data-icon="inline-start" />重新生成（后端未提供接口）</Button>
        </div>
        {decisionMutation.isError ? <p className="text-sm text-destructive">{decisionMutation.error instanceof Error ? decisionMutation.error.message : "审核提交失败。"}</p> : null}
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
          当前后端没有重新生成接口和审核历史接口，因此不模拟生成过程，也不伪造审核历史。
        </p>
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
