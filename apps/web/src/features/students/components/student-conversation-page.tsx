"use client";

import { AlertTriangle, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStudentDetail } from "@/features/students/queries";
import { buildSourceHref } from "@/features/knowledge/view-model";
import { groupConversationEvidence } from "@/features/students/view-model";
import { cn } from "@/lib/utils";

export function StudentConversationPage({
  studentId,
  conversationId,
  from,
  messageId,
  knowledgePointId,
}: {
  studentId: string;
  conversationId: string;
  from: string;
  messageId?: string;
  knowledgePointId?: string;
}) {
  const router = useRouter();
  const data = useStudentDetail(studentId);
  const [search, setSearch] = useState("");
  const conversations = groupConversationEvidence(data.reviewFlags);
  const current = conversations.find((conversation) => conversation.conversationId === conversationId) ?? null;
  const keyword = search.trim().toLowerCase();
  const visibleConversations = keyword
    ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(keyword))
    : conversations;

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

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <Card className="gap-3 py-5">
          <CardHeader className="px-4"><CardTitle>对话证据</CardTitle></CardHeader>
          <CardContent className="space-y-3 px-4">
            <Input onChange={(event) => setSearch(event.target.value)} placeholder="搜索对话..." value={search} />
            <div className="space-y-2">
              {visibleConversations.map((conversation) => (
                <Link
                  className={cn("block rounded-lg border px-3 py-3 transition-colors", conversation.conversationId === conversationId ? "border-blue-200 bg-blue-50" : "border-border hover:bg-muted/50")}
                  href={`/students/${studentId}/conversations/${conversation.conversationId}?from=${from}${messageId ? `&messageId=${messageId}` : ""}`}
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
            <p className="mt-1 text-xs text-muted-foreground">{data.member.display_name} · {data.course.name} · {current?.flags.length ?? 0} 条审核证据</p>
          </CardHeader>
          <CardContent className="space-y-5 px-5">
            {current ? current.flags.map((flag) => (
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
                    <StatusBadge tone={flag.status === "open" ? "warning" : flag.status === "marked_incorrect" ? "danger" : "success"}>
                      {flag.status === "open" ? "待审核" : flag.status === "marked_incorrect" ? "已判错" : "已审核"}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{flag.corrected_answer || flag.answer}</p>
<ReviewCitationLinks conversationId={conversationId} flag={flag} />
                  <p className="mt-2 break-all text-[11px] text-muted-foreground">messageId: {flag.message_id}</p>
                </div>
              </div>
            )) : <EmptyState description="当前 conversationId 没有可访问的审核证据。" title="暂无对话证据" />}
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
              <Metric label="审核证据" value={current?.flags.length ?? 0} />
              <Metric label="消息标识" value={current?.messageIds.length ?? 0} />
              <Metric label="待审核" value={current?.flags.filter((flag) => flag.status === "open").length ?? 0} />
              <Metric label="教师修正" value={current?.flags.filter((flag) => flag.corrected_answer).length ?? 0} />
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
