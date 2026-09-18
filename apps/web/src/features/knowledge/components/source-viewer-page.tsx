"use client";
import { ArrowLeft, ArrowRight, Copy, Download, FileText, Highlighter, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChapterTree } from "@/features/knowledge/components/chapter-tree";
import { useDocumentFileBlob, useDocumentPageEvidence, useKnowledgeResourceData, useSourceEvidence } from "@/features/knowledge/queries";
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
  const pageEvidenceQuery = useDocumentPageEvidence(data.course?.id ?? null, resourceId, page);
  const fileBlobQuery = useDocumentFileBlob(data.course?.id ?? null, resourceId);
  const fileUrl = useMemo(() => fileBlobQuery.data ? URL.createObjectURL(fileBlobQuery.data) : null, [fileBlobQuery.data]);
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);


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
            <a className={buttonVariants({ variant: "outline" })} download={resource.document.original_name} href={fileUrl ?? undefined}>
              <Download data-icon="inline-start" />打开 PDF
            </a>
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
          <StatusBadge tone="success">PDF 文件流已接入</StatusBadge>
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
                {pageEvidenceQuery.isLoading ? <p className="text-sm text-muted-foreground">正在加载第 {page} 页证据...</p> : null}
                {pageEvidenceQuery.isError ? <p className="text-sm text-destructive">页面证据加载失败，请稍后重试。</p> : null}
                {pageEvidenceQuery.data ? (
                  <div className="relative w-full max-w-[720px] self-start rounded-sm bg-white p-8 shadow-sm ring-1 ring-border" style={{ aspectRatio: pageEvidenceQuery.data.width && pageEvidenceQuery.data.height ? `${pageEvidenceQuery.data.width} / ${pageEvidenceQuery.data.height}` : "3 / 4" }}>
                    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                      <p className="text-xs font-medium text-muted-foreground">第 {pageEvidenceQuery.data.page_number} 页证据</p>
                      <p className="text-[11px] text-muted-foreground">{pageEvidenceQuery.data.blocks.filter((block) => block.bbox).length} 个坐标块 · {pageEvidenceQuery.data.blocks.length} 个文本块</p>
                    </div>
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground">{pageEvidenceQuery.data.text || "当前页没有可展示文本。"}</p>
                    {pageEvidenceQuery.data.blocks.map((block) => block.bbox && pageEvidenceQuery.data.width && pageEvidenceQuery.data.height ? (
                      <div
                        className="pointer-events-none absolute rounded-sm border-2 border-blue-400/55 bg-blue-200/20"
                        key={block.chunk_id}
                        style={{
                          left: `${(block.bbox[0] / pageEvidenceQuery.data.width) * 100}%`,
                          top: `${(block.bbox[1] / pageEvidenceQuery.data.height) * 100}%`,
                          width: `${((block.bbox[2] - block.bbox[0]) / pageEvidenceQuery.data.width) * 100}%`,
                          height: `${((block.bbox[3] - block.bbox[1]) / pageEvidenceQuery.data.height) * 100}%`,
                        }}
                        title={block.text}
                      />
                    ) : null)}
                  </div>
                ) : null}
                {!pageEvidenceQuery.isLoading && !pageEvidenceQuery.isError && !pageEvidenceQuery.data ? (
                  <div className="max-w-md text-center">
                    <FileText className="mx-auto size-10 text-muted-foreground" />
                    <p className="mt-4 text-sm font-medium">第 {Math.min(page, maxPage)} 页暂无解析证据</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">请确认文档已完成页级解析。</p>
                  </div>
                ) : null}
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
          hasBBox={Boolean(pageEvidenceQuery.data?.blocks.some((block) => block.bbox))}
          pageEvidenceReady={Boolean(pageEvidenceQuery.data)}
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
  hasBBox,
  pageEvidenceReady,
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
  hasBBox: boolean;
  pageEvidenceReady: boolean;
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

      <Card className="gap-3 border-blue-100 bg-blue-50/50 py-5">
        <CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-blue-800"><Highlighter className="size-4" />页级定位</CardTitle></CardHeader>
        <CardContent className="px-5 text-sm leading-6 text-blue-900/80">
          {pageEvidenceReady
            ? hasBBox
              ? "已使用后端返回的真实页面尺寸和 bbox 绘制证据高亮。"
              : "已加载真实页码和页面文本；后端未返回 bbox，因此不绘制高亮框。"
            : "页面证据加载后将在这里显示定位状态。"
          }
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
