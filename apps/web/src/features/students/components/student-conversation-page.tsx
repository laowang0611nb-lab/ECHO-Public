"use client";

import { AlertTriangle, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ReviewFlag, ReviewReason, ReviewSeverity, ReviewStatus } from "@echo/shared-types";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudentDetail } from "@/features/students/queries";
import { buildSourceHref } from "@/features/knowledge/view-model";
import type {
  ConversationEvidenceQuery,
  ConversationReasonFilter,
  ConversationSeverityFilter,
  ConversationStatusFilter,
  ConversationEvidenceGroup,
} from "@/features/students/types";
import { groupConversationEvidence } from "@/features/students/view-model";
import { cn } from "@/lib/utils";

export function StudentConversationPage({
  studentId,
  conversationId,
  from,
  messageId,
  knowledgePointId,
  initialQuery,
}: {
  studentId: string;
  conversationId: string;
  from: string;
  messageId?: string;
  knowledgePointId?: string;
  initialQuery: ConversationEvidenceQuery;
}) {
  const router = useRouter();
  const data = useStudentDetail(studentId);
  const [search, setSearch] = useState(initialQuery.search);
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>(initialQuery.status);
  const [reasonFilter, setReasonFilter] = useState<ConversationReasonFilter>(initialQuery.reason);
  const [severityFilter, setSeverityFilter] = useState<ConversationSeverityFilter>(initialQuery.severity);
  const conversations = useMemo(() => groupConversationEvidence(data.reviewFlags), [data.reviewFlags]);
  const query = useMemo<ConversationEvidenceQuery>(
    () => ({ search, status: statusFilter, reason: reasonFilter, severity: severityFilter }),
    [reasonFilter, search, severityFilter, statusFilter],
  );
  const current = conversations.find((conversation) => conversation.conversationId === conversationId) ?? null;
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversationMatchesQuery(conversation, query)),
    [conversations, query],
  );
  const currentFlags = useMemo(
    () => current ? current.flags.filter((flag) => flagMatchesQuery(flag, query, current.title)) : [],
    [current, query],
  );

  function replaceQuery(patch: Partial<ConversationEvidenceQuery>) {
    const next = {
      search: patch.search ?? search,
      status: patch.status ?? statusFilter,
      reason: patch.reason ?? reasonFilter,
      severity: patch.severity ?? severityFilter,
    };
    if (patch.search !== undefined) setSearch(patch.search);
    if (patch.status !== undefined) setStatusFilter(patch.status);
    if (patch.reason !== undefined) setReasonFilter(patch.reason);
    if (patch.severity !== undefined) setSeverityFilter(patch.severity);

    const params = new URLSearchParams();
    params.set("from", from);
    if (messageId) params.set("messageId", messageId);
    if (knowledgePointId) params.set("knowledgePointId", knowledgePointId);
    if (next.search.trim()) params.set("q", next.search.trim());
    if (next.status !== "all") params.set("status", next.status);
    if (next.reason !== "all") params.set("reason", next.reason);
    if (next.severity !== "all") params.set("severity", next.severity);
    router.replace(`/students/${studentId}/conversations/${conversationId}?${params.toString()}`, { scroll: false });
  }

  function buildConversationHref(nextConversationId: string) {
    const params = new URLSearchParams();
    params.set("from", from);
    if (messageId && nextConversationId === conversationId) params.set("messageId", messageId);
    if (knowledgePointId) params.set("knowledgePointId", knowledgePointId);
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (reasonFilter !== "all") params.set("reason", reasonFilter);
    if (severityFilter !== "all") params.set("severity", severityFilter);
    return `/students/${studentId}/conversations/${nextConversationId}?${params.toString()}`;
  }

  useEffect(() => {
    if (!messageId) return;
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.dataset.highlighted = "true";
    const timer = window.setTimeout(() => {
      delete element.dataset.highlighted;
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [current?.conversationId, messageId]);

  if (data.isLoading) return <LoadingState label="正在加载对话证据..." />;
  if (data.isError) return <ErrorState description="对话证据加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  if (!data.course || !data.member) {
    return <EmptyState description="学生不存在，或不属于当前教师账号。" title="无法打开对话" />;
  }

  const breadcrumbs = from === "ai-review"
    ? [{ label: "AI 回答审核", href: "/ai-review" }, { label: "审核工作台" }, { label: "完整对话" }]
    : [{ label: "学生学情", href: "/students" }, { label: data.member.display_name, href: `/students/${studentId}?from=student&courseId=${data.course.id}&tab=conversations` }, { label: "对话证据" }];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={<Button onClick={() => router.back()} type="button" variant="ghost"><ArrowLeft data-icon="inline-start" />返回</Button>}
        breadcrumbs={breadcrumbs}
        description="教师侧对话证据查看器，展示后端当前开放的审核证据，不冒充完整消息流。"
        title={current?.title ?? "对话证据"}
      />

      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-orange-800">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>P0 能力缺口：后端只允许学生会话所有者读取完整消息，教师账号会返回 403。当前页面展示真实 ReviewFlag 中的问题、回答、messageId 和审核状态，不伪造多轮消息与 Citation。</p>
      </div>

      <div className="grid gap-2 rounded-xl border border-border bg-card p-4 lg:grid-cols-[minmax(240px,1fr)_180px_220px_150px_auto] lg:items-center">
        <div className="relative">
          <Input className="pl-3" onChange={(event) => replaceQuery({ search: event.target.value })} placeholder="搜索问题、回答或备注..." value={search} />
        </div>
        <Select
          items={[
            { value: "all", label: "全部审核状态" },
            { value: "open", label: "待审核" },
            { value: "confirmed_correct", label: "确认正确" },
            { value: "marked_incorrect", label: "已判错" },
            { value: "dismissed", label: "已忽略" },
          ]}
          onValueChange={(value) => value && replaceQuery({ status: value as ConversationStatusFilter })}
          value={statusFilter}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">全部审核状态</SelectItem>
            <SelectItem value="open">待审核</SelectItem>
            <SelectItem value="confirmed_correct">确认正确</SelectItem>
            <SelectItem value="marked_incorrect">已判错</SelectItem>
            <SelectItem value="dismissed">已忽略</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <Select
          items={[
            { value: "all", label: "全部审核原因" },
            { value: "missing_course_basis", label: "缺少课程依据" },
            { value: "outside_material_heavy", label: "课程外内容偏重" },
            { value: "repeated_follow_up", label: "多次追问" },
            { value: "student_not_resolved", label: "学生未解决" },
            { value: "teacher_rule_violation", label: "违反教师规则" },
          ]}
          onValueChange={(value) => value && replaceQuery({ reason: value as ConversationReasonFilter })}
          value={reasonFilter}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">全部审核原因</SelectItem>
            <SelectItem value="missing_course_basis">缺少课程依据</SelectItem>
            <SelectItem value="outside_material_heavy">课程外内容偏重</SelectItem>
            <SelectItem value="repeated_follow_up">多次追问</SelectItem>
            <SelectItem value="student_not_resolved">学生未解决</SelectItem>
            <SelectItem value="teacher_rule_violation">违反教师规则</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <Select
          items={[
            { value: "all", label: "全部严重级别" },
            { value: "high", label: "高" },
            { value: "medium", label: "中" },
            { value: "low", label: "低" },
          ]}
          onValueChange={(value) => value && replaceQuery({ severity: value as ConversationSeverityFilter })}
          value={severityFilter}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="all">全部严重级别</SelectItem>
            <SelectItem value="high">高</SelectItem>
            <SelectItem value="medium">中</SelectItem>
            <SelectItem value="low">低</SelectItem>
          </SelectGroup></SelectContent>
        </Select>
        <Button
          disabled={!search && statusFilter === "all" && reasonFilter === "all" && severityFilter === "all"}
          onClick={() => replaceQuery({ search: "", status: "all", reason: "all", severity: "all" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          清除筛选
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <Card className="gap-3 py-5">
          <CardHeader className="px-4"><CardTitle>对话证据</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-4">
            <p className="text-xs text-muted-foreground">筛选后 {visibleConversations.length} / {conversations.length} 个会话</p>
            <div className="space-y-2">
              {visibleConversations.map((conversation) => (
                <Link
                  className={cn("block rounded-lg border px-3 py-3 transition-colors", conversation.conversationId === conversationId ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/50")}
                  href={buildConversationHref(conversation.conversationId)}
                  key={conversation.conversationId}
                >
                  <p className="line-clamp-2 text-sm font-medium">{conversation.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge tone={conversation.status === "pending" ? "warning" : conversation.status === "rejected" ? "danger" : "success"}>
                      {conversation.status === "pending" ? "待审核" : conversation.status === "rejected" ? "已判错" : "已审核"}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">{conversation.flags.length} 条证据</span>
                  </div>
                </Link>
              ))}
              {!visibleConversations.length ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">暂无对话证据。</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>{current?.title ?? "对话证据"}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{data.member.display_name} · {data.course.name} · 筛选后 {currentFlags.length} / {current?.flags.length ?? 0} 条审核证据</p>
          </CardHeader>
          <CardContent className="space-y-5 px-5">
            {current && currentFlags.length ? currentFlags.map((flag) => (
              <div className="space-y-3" key={flag.id}>
                <div className="rounded-xl bg-muted/70 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">学生问题</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{flag.question || "当前审核记录没有保存学生问题。"}</p>
                </div>
                <div
                  className="rounded-xl border border-border bg-card px-4 py-4 transition-shadow data-[highlighted=true]:border-blue-400 data-[highlighted=true]:ring-2 data-[highlighted=true]:ring-blue-200"
                  id={`message-${flag.message_id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-medium text-primary"><Sparkles className="size-3.5" />AI 回答</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
                      <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{flag.corrected_answer || flag.answer}</p>
                  <p className="mt-3 text-xs text-muted-foreground">审核原因：{reviewReasonLabel(flag.reason)}</p>
                  {flag.teacher_note ? <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-sm leading-6 text-orange-900">教师备注：{flag.teacher_note}</div> : null}
<ReviewCitationLinks conversationId={conversationId} flag={flag} />
                  <p className="mt-2 break-all text-[11px] text-muted-foreground">messageId: {flag.message_id}</p>
                </div>
              </div>
            )) : <EmptyState description={current ? "当前筛选条件下没有匹配的审核证据。" : "当前 conversationId 没有可访问的审核证据。"} title="暂无对话证据" />}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>学生信息</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5 text-sm">
              <InfoLine label="学生" value={data.member.display_name} />
              <InfoLine label="课程" value={data.course.name} />
              <InfoLine label="掌握度" value={data.detail?.average_mastery === null || data.detail?.average_mastery === undefined ? "暂无" : `${Math.round(data.detail.average_mastery)}%`} />
              <Link className={buttonVariants({ variant: "outline" })} href={`/students/${studentId}?from=conversation&courseId=${data.course.id}&tab=conversations`}>
                查看学生详情
              </Link>
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>对话概览</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 px-5">
              <Metric label="筛选后证据" value={currentFlags.length} />
              <Metric label="待审核" value={currentFlags.filter((flag) => flag.status === "open").length} />
              <Metric label="高严重级" value={currentFlags.filter((flag) => flag.severity === "high").length} />
              <Metric label="教师修正" value={currentFlags.filter((flag) => flag.corrected_answer).length} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>知识点与来源</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5 text-sm text-muted-foreground">
              <ReviewKnowledgeLinks conversationId={conversationId} explicitPointId={knowledgePointId} flags={current?.flags ?? []} studentId={studentId} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>教师备注</CardTitle></CardHeader>
            <CardContent className="px-5 text-sm text-muted-foreground">
              当前没有 conversation-scoped 教师备注接口；学生级备注可在学生详情中新增。
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function reviewStatusLabel(status: ReviewStatus) {
  if (status === "open") return "待审核";
  if (status === "confirmed_correct") return "确认正确";
  if (status === "marked_incorrect") return "已判错";
  return "已忽略";
}

function reviewStatusTone(status: ReviewStatus) {
  if (status === "open") return "warning" as const;
  if (status === "marked_incorrect") return "danger" as const;
  if (status === "confirmed_correct") return "success" as const;
  return "neutral" as const;
}

function reviewReasonLabel(reason: ReviewReason) {
  const labels: Record<ReviewReason, string> = {
    missing_course_basis: "缺少课程依据",
    outside_material_heavy: "课程外内容偏重",
    repeated_follow_up: "多次追问",
    student_not_resolved: "学生未解决",
    teacher_rule_violation: "违反教师规则",
  };
  return labels[reason];
}

function reviewSeverityLabel(severity: ReviewSeverity) {
  if (severity === "high") return "高严重级";
  if (severity === "medium") return "中严重级";
  return "低严重级";
}

function reviewSeverityTone(severity: ReviewSeverity) {
  if (severity === "high") return "danger" as const;
  if (severity === "medium") return "warning" as const;
  return "info" as const;
}

function flagMatchesQuery(flag: ReviewFlag, query: ConversationEvidenceQuery, conversationTitle: string) {
  const keyword = query.search.trim().toLowerCase();
  const searchText = [conversationTitle, flag.question ?? "", flag.answer, flag.teacher_note ?? ""].join("\n").toLowerCase();
  const matchesSearch = !keyword || searchText.includes(keyword);
  const matchesStatus = query.status === "all" || flag.status === query.status;
  const matchesReason = query.reason === "all" || flag.reason === query.reason;
  const matchesSeverity = query.severity === "all" || flag.severity === query.severity;
  return matchesSearch && matchesStatus && matchesReason && matchesSeverity;
}

function conversationMatchesQuery(conversation: ConversationEvidenceGroup, query: ConversationEvidenceQuery) {
  return conversation.flags.some((flag) => flagMatchesQuery(flag, query, conversation.title));
}

function extractReviewLinks(flag: { details: Record<string, unknown> }) {
  const knowledgePointIds = Array.isArray(flag.details.knowledge_point_ids)
    ? flag.details.knowledge_point_ids.filter((value): value is string => typeof value === "string")
    : [];
  const citations = Array.isArray(flag.details.citations)
    ? flag.details.citations.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        if (typeof item.document_id !== "string" || typeof item.page_start !== "number") return [];
        return [{ documentId: item.document_id, page: item.page_start, chunkId: typeof item.chunk_id === "string" ? item.chunk_id : undefined }];
      })
    : [];
  return { knowledgePointIds, citations };
}

function ReviewCitationLinks({ flag, conversationId }: { flag: { id: string; message_id: string; details: Record<string, unknown> }; conversationId: string }) {
  const { citations } = extractReviewLinks(flag);
  if (!citations.length) {
    return <div className="mt-4 border-t border-border pt-3"><p className="text-xs text-muted-foreground">当前后端未向教师返回该消息的 Citation，因此不能生成教材来源链接。</p></div>;
  }
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs font-medium">引用来源（{citations.length}）</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {citations.map((citation, index) => (
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={buildSourceHref(citation.documentId, { from: "conversation", page: citation.page, chunkId: citation.chunkId, messageId: flag.message_id, conversationId })} key={`${flag.id}-${index}`}>
            来源 {index + 1} · 第 {citation.page} 页
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReviewKnowledgeLinks({ flags, explicitPointId, studentId, conversationId }: { flags: Array<{ details: Record<string, unknown> }>; explicitPointId?: string; studentId: string; conversationId: string }) {
  const pointIds = new Set<string>(explicitPointId ? [explicitPointId] : []);
  flags.forEach((flag) => extractReviewLinks(flag).knowledgePointIds.forEach((id) => pointIds.add(id)));
  if (!pointIds.size) return <p>当前审核数据没有返回 knowledgePointIds 和 Citation，因此不生成猜测链接。</p>;
  return <div className="flex flex-wrap gap-2">{Array.from(pointIds).map((id) => <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/knowledge/points/${id}?from=conversation&studentId=${studentId}&conversationId=${conversationId}`} key={id}>查看知识点</Link>)}</div>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/60 px-3 py-3"><p className="text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}
