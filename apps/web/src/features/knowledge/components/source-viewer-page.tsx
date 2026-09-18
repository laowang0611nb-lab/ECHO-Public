"use client";
import { AlertTriangle, ArrowLeft, ArrowRight, Copy, FileText, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChapterTree } from "@/features/knowledge/components/chapter-tree";
import { useKnowledgeResourceData, useSourceEvidence } from "@/features/knowledge/queries";
import { buildPointHref, buildResourceHref } from "@/features/knowledge/view-model";

export function SourceViewerPage({
  resourceId,
  from,
  initialPage,
  chunkId,
  knowledgePointId,
  messageId,
  reviewId,
}: {
  resourceId: string;
  from: string;
  initialPage?: number;
  chunkId?: string;
  knowledgePointId?: string;
  messageId?: string;
  reviewId?: string;
}) {
  const router = useRouter();
  const data = useKnowledgeResourceData(resourceId);
  const resource = data.resource;
  const currentPoint = resource?.knowledgePoints.find((point) => point.id === knowledgePointId) ?? null;
  const currentChapter = resource?.chapters.find((chapter) => chapter.id === currentPoint?.chapter_id) ?? null;
  const evidenceQuery = currentPoint?.name ?? currentChapter?.title ?? "";
  const evidence = useSourceEvidence({
    courseId: data.course?.id,
    documentId: resourceId,
    query: evidenceQuery,
    chunkId,
  });
  const pageCount = resource?.document.page_count ?? 0;
  const [manualPage, setManualPage] = useState<number | null>(initialPage ?? null);
  const page = manualPage ?? evidence.evidence?.page_start ?? 1;
  const [zoom, setZoom] = useState(100);


  const relatedPoints = useMemo(
    () => currentChapter?.knowledge_points.filter((point) => point.id !== currentPoint?.id) ?? [],
    [currentChapter?.knowledge_points, currentPoint?.id],
  );

  if (data.isLoading) return <LoadingState label="正在加载教材来源..." />;
  if (data.isError) return <ErrorState description="教材来源加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  if (!resource || !data.course) {
    return <EmptyState description="资源不存在、已被删除，或不属于当前教师账号。" title="无法打开教材来源" />;
  }

  const breadcrumbs = sourceBreadcrumbs(from, resource.document.original_name, currentPoint?.name);
  const maxPage = Math.max(1, pageCount);

  async function copyQuote() {
    if (evidence.evidence?.content) {
      await navigator.clipboard.writeText(evidence.evidence.content);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <>
            <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
            <Link className={buttonVariants({ variant: "outline" })} href={buildResourceHref(resourceId, { from: "source", courseId: data.course.id })}>资源详情</Link>
          </>
        }
        breadcrumbs={breadcrumbs}
        description="将知识点、引用和检索结果追溯到教材页码与原文片段。"
        title="教材来源查看"
      />

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary"><FileText className="size-6" /></span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{resource.document.original_name}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{resource.document.page_count ? `${resource.document.page_count} 页` : "页数未知"}</span>
              <span>{resource.chapters.length} 章</span>
              <span>{resource.knowledgePointCount} 个知识点</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <StatusBadge tone="warning">PDF 文件流待后端补齐</StatusBadge>
          {currentPoint ? <StatusBadge tone="info">{currentPoint.name}</StatusBadge> : null}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        <Card className="gap-3 py-5">
          <CardHeader className="px-4"><CardTitle>教材结构</CardTitle></CardHeader>
          <CardContent className="px-4">
            <ChapterTree chapters={resource.chapters} courseId={data.course.id} currentPointId={currentPoint?.id} from="source" resourceId={resourceId} />
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{currentPoint?.name || currentChapter?.title || "教材页面"}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">页码来自检索结果的 Chunk 元数据，不根据文本内容估算。</p>
              </div>
              <div className="flex items-center gap-1">
<Button aria-label="上一页" disabled={page <= 1} onClick={() => setManualPage(Math.max(1, page - 1))} size="icon-sm" type="button" variant="outline"><ArrowLeft /></Button>
                <span className="min-w-24 px-2 text-center text-sm tabular-nums">第 {Math.min(page, maxPage)} / {maxPage} 页</span>
<Button aria-label="下一页" disabled={page >= maxPage} onClick={() => setManualPage(Math.min(maxPage, page + 1))} size="icon-sm" type="button" variant="outline"><ArrowRight /></Button>
                <Button onClick={() => setZoom((value) => Math.max(75, value - 10))} size="icon-sm" type="button" variant="outline"><ZoomOut /></Button>
                <span className="w-12 text-center text-xs">{zoom}%</span>
                <Button onClick={() => setZoom((value) => Math.min(150, value + 10))} size="icon-sm" type="button" variant="outline"><ZoomIn /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex min-h-[620px] items-center justify-center overflow-auto rounded-lg border border-dashed border-border bg-muted/20 p-8">
              <div
                className="relative flex min-h-[560px] w-full max-w-[720px] items-center justify-center rounded-sm bg-white p-10 shadow-sm ring-1 ring-border"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
              >
                {evidence.evidence?.content ? (
                  <div className="max-w-2xl text-left">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Evidence excerpt · Page {evidence.evidence.page_start}</p>
                    <blockquote className="mt-6 text-lg leading-9 text-foreground">{evidence.evidence.content}</blockquote>
                    <p className="mt-8 text-sm text-muted-foreground">当前后端未提供 PDF 文件流或 bbox，无法在此处渲染真实页面和高亮框。</p>
                  </div>
                ) : (
                  <div className="max-w-md text-center">
                    <FileText className="mx-auto size-10 text-muted-foreground" />
                    <p className="mt-4 text-sm font-medium">第 {Math.min(page, maxPage)} 页定位已保留</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">没有可用的原文 Chunk，或检索服务未返回结果。</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <SourceEvidenceAside
          chunkId={evidence.evidence?.chunk_id ?? chunkId}
          chapterTitle={currentChapter?.title}
          evidence={evidence.evidence}
          isLoading={evidence.isLoading}
          isError={evidence.isError}
          messageId={messageId}
          reviewId={reviewId}
          onCopy={() => void copyQuote()}
          pointName={currentPoint?.name}
          resourceName={resource.document.original_name}
        />
      </div>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>相关知识点</CardTitle></CardHeader>
        <CardContent className="grid gap-2 px-5 sm:grid-cols-2 xl:grid-cols-4">
          {relatedPoints.length ? relatedPoints.map((point) => (
            <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm hover:border-blue-200" href={buildPointHref(point.id, { from: "source", courseId: data.course!.id, resourceId })} key={point.id}>
              <span className="truncate">{point.name}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )) : <p className="col-span-full rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">暂无同章节知识点。</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function SourceEvidenceAside({
  resourceName,
  chapterTitle,
  pointName,
  chunkId,
  evidence,
  isLoading,
  isError,
  messageId,
  reviewId,
  onCopy,
}: {
  resourceName: string;
  chapterTitle?: string;
  pointName?: string;
  chunkId?: string;
  evidence: ReturnType<typeof useSourceEvidence>["evidence"];
  isLoading: boolean;
  isError: boolean;
  messageId?: string;
  reviewId?: string;
  onCopy: () => void;
}) {
  return (
    <aside className="space-y-4">
      <Card className="gap-3 py-5">
        <CardHeader className="px-5"><CardTitle>当前来源</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <SourceLine label="来源文件" value={resourceName} />
          <SourceLine label="所在章节" value={chapterTitle ?? "暂无"} />
          <SourceLine label="关联知识点" value={pointName ?? "暂无"} />
          <SourceLine label="页码" value={evidence ? `${evidence.page_start}-${evidence.page_end}` : "待检索"} />
          <SourceLine label="Chunk ID" value={chunkId ?? "暂无"} />
          {messageId ? <SourceLine label="消息 ID" value={messageId} /> : null}
          {reviewId ? <SourceLine label="审核项 ID" value={reviewId} /> : null}
        </CardContent>
      </Card>

      <Card className="gap-3 py-5">
        <CardHeader className="px-5"><CardTitle>原文引用</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5">
          {isLoading ? <p className="text-sm text-muted-foreground">正在检索真实教材片段...</p> : null}
          {isError ? <p className="text-sm text-destructive">引用检索失败，可先查看页码或返回来源资源。</p> : null}
          {!isLoading && !isError && evidence ? (
            <>
              <blockquote className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-foreground">{evidence.content}</blockquote>
              <Button onClick={onCopy} type="button" variant="outline"><Copy data-icon="inline-start" />复制引用内容</Button>
            </>
          ) : null}
          {!isLoading && !isError && !evidence ? <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">当前引用片段不可用，但仍保留对应页码与资源入口。</p> : null}
        </CardContent>
      </Card>

      <Card className="gap-3 border-orange-100 bg-orange-50/35 py-5">
        <CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-orange-800"><AlertTriangle className="size-4" />精确高亮不可用</CardTitle></CardHeader>
        <CardContent className="px-5 text-sm leading-6 text-orange-800/80">
          当前数据只有页码和 Chunk 文本，没有 bbox。因此不绘制虚假高亮框，只定位正确页并显示原文。
        </CardContent>
      </Card>
    </aside>
  );
}

function SourceLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="max-w-48 break-all text-right font-medium">{value}</span></div>;
}

function sourceBreadcrumbs(from: string, resourceName: string, pointName?: string) {
  if (from === "point") return [{ label: "知识库", href: "/knowledge" }, { label: pointName ?? "知识点详情" }, { label: "来源查看" }];
  if (from === "ai-review" || from === "review") return [{ label: "AI 回答审核", href: "/ai-review" }, { label: "审核工作台" }, { label: "来源查看" }];
  if (from === "conversation") return [{ label: "学生学情", href: "/students" }, { label: "完整对话" }, { label: "来源查看" }];
  return [{ label: "知识库", href: "/knowledge" }, { label: resourceName }, { label: "来源查看" }];
}
