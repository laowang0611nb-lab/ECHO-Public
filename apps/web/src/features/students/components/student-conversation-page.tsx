"use client";

import { ArrowLeft, Bot, CircleUserRound, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ReviewFlag, ReviewReason, ReviewSeverity, ReviewStatus, TeacherMessage } from "@echo/shared-types";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudentDetail, useTeacherConversationMessages } from "@/features/students/queries";
import { eventLabel } from "@/features/students/view-model";
import { buildSourceHref } from "@/features/knowledge/view-model";
import type {
  ConversationEvidenceQuery,
  ConversationReasonFilter,
  ConversationSeverityFilter,
  ConversationStatusFilter,
  ConversationEvidenceGroup,
} from "@/features/students/types";
import { cn } from "@/lib/utils";

export function StudentConversationPage({
  studentId,
  conversationId,
  from,
  messageId,
  knowledgePointId,
  courseId,
  reviewId,
  initialQuery,
}: {
  studentId: string;
  conversationId: string;
  from: string;
  messageId?: string;
  knowledgePointId?: string;
  courseId?: string;
  reviewId?: string;
  initialQuery: ConversationEvidenceQuery;
}) {
  const router = useRouter();
  const data = useStudentDetail(studentId);
  const messagesQuery = useTeacherConversationMessages(data.course?.id ?? null, conversationId);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const [search, setSearch] = useState(initialQuery.search);
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>(initialQuery.status);
  const [reasonFilter, setReasonFilter] = useState<ConversationReasonFilter>(initialQuery.reason);
  const [severityFilter, setSeverityFilter] = useState<ConversationSeverityFilter>(initialQuery.severity);
  const conversations = data.conversations;
  const query = useMemo<ConversationEvidenceQuery>(
    () => ({ search, status: statusFilter, reason: reasonFilter, severity: severityFilter }),
    [reasonFilter, search, severityFilter, statusFilter],
  );
  const current = conversations.find((conversation) => conversation.conversationId === conversationId) ?? null;
  const conversationTitle = current?.title || messages.find((message) => message.role === "user")?.content.slice(0, 40) || "完整对话";
  const flagByMessageId = useMemo(() => new Map(data.reviewFlags.map((flag) => [flag.message_id, flag])), [data.reviewFlags]);
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversationMatchesQuery(conversation, query)),
    [conversations, query],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => messageMatchesQuery(message, flagByMessageId.get(message.id), query, conversationTitle)),
    [conversationTitle, flagByMessageId, messages, query],
  );
  const currentFlags = useMemo(
    () => current ? current.flags.filter((flag) => flagMatchesQuery(flag, query, conversationTitle)) : [],
    [conversationTitle, current, query],
  );
  const visibleKnowledgePointIds = useMemo(
    () => new Set(visibleMessages.flatMap((message) => message.knowledgePointIds)),
    [visibleMessages],
  );
  const visibleCitationCount = useMemo(
    () => visibleMessages.reduce((total, message) => total + message.citations.length, 0),
    [visibleMessages],
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
    if (courseId) params.set("courseId", courseId);
    if (reviewId) params.set("reviewId", reviewId);
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
    if (courseId) params.set("courseId", courseId);
    if (reviewId) params.set("reviewId", reviewId);
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
  }, [current?.conversationId, messageId, messagesQuery.dataUpdatedAt, visibleMessages.length]);

  if (data.isLoading || (data.course && messagesQuery.isPending)) return <LoadingState label="正在加载完整对话证据..." />;
  if (data.isError || messagesQuery.isError) {
    return <ErrorState description="完整对话证据加载失败，请确认教师会话权限和后端服务。" onRetry={() => { data.refetch(); void messagesQuery.refetch(); }} />;
  }
  if (!data.course || !data.member) {
    return <EmptyState description="学生不存在，或不属于当前教师账号。" title="无法打开对话" />;
  }

  const reviewWorkspaceHref = reviewId ? `/ai-review/pending?reviewId=${reviewId}${courseId ? `&courseId=${courseId}` : ""}` : "/ai-review";
  const breadcrumbs = from === "ai-review"
    ? [{ label: "AI 回答审核", href: "/ai-review" }, { label: "审核工作台", href: reviewWorkspaceHref }, { label: "完整对话" }]
    : [{ label: "学生学情", href: "/students" }, { label: "学生详情", href: `/students/${studentId}?from=student&courseId=${data.course.id}&tab=conversations` }, { label: "完整对话" }];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={<Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>}
        breadcrumbs={breadcrumbs}
        description="教师侧完整对话证据查看器；消息、Citation 和知识点均来自教师权限接口。"
        title={conversationTitle}
      />

      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-900">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>完整消息、Citation、知识点和审核状态均来自真实教师权限接口；引用缺失时保持明确空状态，不补造来源。</p>
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
                    <StatusBadge tone={conversationStatusTone(conversation.status)}>{conversationStatusLabel(conversation.status)}</StatusBadge>
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
            <CardTitle>{conversationTitle}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{data.member.display_name} · {data.course.name} · 筛选后 {visibleMessages.length} / {messages.length} 条消息 · {current?.flags.length ?? 0} 条审核证据</p>
          </CardHeader>
          <CardContent className="space-y-5 px-5">
            {visibleMessages.length ? visibleMessages.map((message) => (
              <ConversationMessageCard
                conversationId={conversationId}
                courseId={data.course!.id}
                flag={flagByMessageId.get(message.id) ?? null}
                key={message.id}
                message={message}
                studentId={studentId}
              />
            )) : <EmptyState description="当前筛选条件下没有匹配的消息。" title="暂无对话消息" />}
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
              <Metric label="完整消息" value={`${visibleMessages.length}/${messages.length}`} />
              <Metric label="待审核" value={currentFlags.filter((flag) => flag.status === "open").length} />
              <Metric label="关联知识点" value={visibleKnowledgePointIds.size} />
              <Metric label="教材引用" value={visibleCitationCount} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>最近学习事件</CardTitle><p className="text-xs text-muted-foreground">学生级最近事件；当前接口未提供会话级过滤，不表示由当前对话产生。</p></CardHeader>
            <CardContent className="space-y-3 px-5">
              {data.recentEvidence.slice(0, 5).map((event) => (
                <div className="flex items-start gap-3" key={event.event_id}>
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0"><p className="text-sm font-medium">{eventLabel(event.event_type)}</p><p className="mt-1 text-xs text-muted-foreground">{event.knowledge_point_name || event.evidence || "课程学习事件"}</p><p className="mt-1 text-[11px] text-muted-foreground">{event.created_at.slice(0, 16).replace("T", " ")}</p></div>
                </div>
              ))}
              {!data.recentEvidence.length ? <p className="py-6 text-center text-sm text-muted-foreground">暂无 LearningEvent。</p> : null}
            </CardContent>
          </Card>

          <Card className="gap-3 py-5">
            <CardHeader className="px-5"><CardTitle>知识点与来源</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5 text-sm text-muted-foreground">
              <MessageEvidenceLinks
                conversationId={conversationId}
                courseId={data.course.id}
                explicitPointId={knowledgePointId}
                messages={messages}
                studentId={studentId}
              />
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
  if (status === "generating") return "重新生成中";
  if (status === "pending_rereview") return "待再次审核";
  if (status === "regeneration_failed") return "重新生成失败";
  if (status === "confirmed_correct") return "确认正确";
  if (status === "marked_incorrect") return "已判错";
  return "已忽略";
}

function reviewStatusTone(status: ReviewStatus) {
  if (status === "open") return "warning" as const;
  if (status === "generating") return "info" as const;
  if (status === "pending_rereview") return "warning" as const;
  if (status === "regeneration_failed") return "danger" as const;
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

function conversationStatusLabel(status: ConversationEvidenceGroup["status"]) {
  if (status === "pending") return "待审核";
  if (status === "rejected") return "已判错";
  if (status === "reviewed") return "已审核";
  return "未审核";
}

function conversationStatusTone(status: ConversationEvidenceGroup["status"]) {
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "reviewed") return "success" as const;
  return "neutral" as const;
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
  if (!conversation.flags.length) {
    return query.status === "all" && query.reason === "all" && query.severity === "all"
      && (!query.search.trim() || conversation.title.toLowerCase().includes(query.search.trim().toLowerCase()));
  }
  return conversation.flags.some((flag) => flagMatchesQuery(flag, query, conversation.title));
}

function messageMatchesQuery(message: TeacherMessage, flag: ReviewFlag | undefined, query: ConversationEvidenceQuery, conversationTitle: string) {
  const keyword = query.search.trim().toLowerCase();
  const searchText = [conversationTitle, message.content, flag?.question ?? "", flag?.answer ?? "", flag?.teacher_note ?? ""].join("\n").toLowerCase();
  const matchesSearch = !keyword || searchText.includes(keyword);
  const matchesStatus = query.status === "all" || flag?.status === query.status;
  const matchesReason = query.reason === "all" || flag?.reason === query.reason;
  const matchesSeverity = query.severity === "all" || flag?.severity === query.severity;
  return matchesSearch && matchesStatus && matchesReason && matchesSeverity;
}

function ConversationMessageCard({
  message,
  flag,
  studentId,
  conversationId,
  courseId,
}: {
  message: TeacherMessage;
  flag: ReviewFlag | null;
  studentId: string;
  conversationId: string;
  courseId: string;
}) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  const Icon = isAssistant ? Bot : isSystem ? FileText : CircleUserRound;
  const label = isAssistant ? "AI 回答" : isSystem ? "系统教学事件" : "学生消息";
  const citationLinks = message.citations.filter((citation) => citation.document_id);

  return (
    <article
      className={cn(
        "rounded-xl border px-4 py-4 transition-shadow data-[highlighted=true]:border-blue-400 data-[highlighted=true]:ring-2 data-[highlighted=true]:ring-blue-200",
        isAssistant ? "border-border bg-card" : isSystem ? "border-dashed border-border bg-muted/40" : "border-blue-100 bg-blue-50/40",
      )}
      id={`message-${message.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn("flex items-center gap-2 text-xs font-medium", isAssistant ? "text-primary" : "text-foreground")}><Icon className="size-3.5" />{label}</p>
        <span className="text-[11px] text-muted-foreground">{message.created_at.slice(0, 19).replace("T", " ")}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{message.content}</p>

      {flag ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={reviewStatusTone(flag.status)}>{reviewStatusLabel(flag.status)}</StatusBadge>
            <StatusBadge tone={reviewSeverityTone(flag.severity)}>{reviewSeverityLabel(flag.severity)}</StatusBadge>
            <span className="text-xs text-muted-foreground">审核原因：{reviewReasonLabel(flag.reason)}</span>
          </div>
          {flag.teacher_note ? <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-sm leading-6 text-orange-900">教师备注：{flag.teacher_note}</div> : null}
        </div>
      ) : null}

      {message.knowledgePointIds.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.knowledgePointIds.map((pointId) => (
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/knowledge/points/${pointId}?from=conversation&studentId=${studentId}&conversationId=${conversationId}&messageId=${message.id}`} key={pointId}>关联知识点</Link>
          ))}
        </div>
      ) : null}

      {citationLinks.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium">引用来源（{citationLinks.length}）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {citationLinks.map((citation) => (
              <Link
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={buildSourceHref(citation.document_id!, { from: "conversation", courseId, knowledgePointId: message.knowledgePointIds[0], page: citation.page_start, chunkId: citation.chunk_id ?? undefined, conversationId, messageId: message.id })}
                key={`${message.id}-${citation.citation_index}`}
              >
                来源 {citation.citation_index} · 第 {citation.page_start} 页
              </Link>
            ))}
          </div>
        </div>
      ) : isAssistant ? (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">本条回答没有可追溯 Citation。</p>
      ) : null}
      <p className="mt-3 break-all text-[11px] text-muted-foreground">messageId: {message.id}</p>
    </article>
  );
}

function MessageEvidenceLinks({
  messages,
  explicitPointId,
  studentId,
  conversationId,
  courseId,
}: {
  messages: TeacherMessage[];
  explicitPointId?: string;
  studentId: string;
  conversationId: string;
  courseId: string;
}) {
  const pointIds = new Set<string>(explicitPointId ? [explicitPointId] : []);
  messages.forEach((message) => message.knowledgePointIds.forEach((id) => pointIds.add(id)));
  const citations = messages.flatMap((message) => message.citations.map((citation) => ({ ...citation, messageId: message.id, knowledgePointId: message.knowledgePointIds[0] })));
  if (!pointIds.size && !citations.length) return <p>当前对话没有返回知识点或 Citation，因此不生成猜测链接。</p>;
  return (
    <div className="space-y-3">
      {pointIds.size ? <div className="flex flex-wrap gap-2">{Array.from(pointIds).map((id) => <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/knowledge/points/${id}?from=conversation&studentId=${studentId}&conversationId=${conversationId}`} key={id}>查看知识点</Link>)}</div> : null}
      {citations.length ? <div className="flex flex-wrap gap-2">{citations.map((citation) => citation.document_id ? <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={buildSourceHref(citation.document_id, { from: "conversation", courseId, knowledgePointId: citation.knowledgePointId, page: citation.page_start, chunkId: citation.chunk_id ?? undefined, conversationId, messageId: citation.messageId })} key={`${citation.messageId}-${citation.citation_index}`}>第 {citation.page_start} 页来源</Link> : null)}</div> : null}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg bg-muted/60 px-3 py-3"><p className="text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}
