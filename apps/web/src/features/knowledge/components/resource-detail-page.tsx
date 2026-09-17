"use client";
import type { Chapter } from "@echo/shared-types";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  ExternalLink,
  FileText,
  Layers3,
  LockKeyhole,
  RefreshCw,
  ScanText,
  Sparkles,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChapterTree } from "@/features/knowledge/components/chapter-tree";
import { KnowledgeStructureEditor } from "@/features/knowledge/components/knowledge-structure-editor";
import { ParseStatusPanel } from "@/features/knowledge/components/parse-status-panel";
import { ResourceKindIcon } from "@/features/knowledge/components/resource-kind-icon";
import { useKnowledgeResourceData } from "@/features/knowledge/queries";
import type { ResourceDetailTab } from "@/features/knowledge/types";
import { buildPointHref, buildSourceHref, resourcePageCount } from "@/features/knowledge/view-model";
import { formatBytes, formatDate } from "@/features/courses/detail/utils";

const tabs = [
  { value: "parse", label: "解析状态" },
  { value: "overview", label: "内容概览" },
  { value: "chapters", label: "章节结构" },
  { value: "points", label: "知识点抽取" },
  { value: "index", label: "向量索引" },
  { value: "citations", label: "引用情况" },
  { value: "related", label: "相关资源" },
] as const;

export function KnowledgeResourceDetailPage({
  resourceId,
  initialTab,
  from,
  courseId: requestedCourseId,
}: {
  resourceId: string;
  initialTab: ResourceDetailTab;
  from: string;
  courseId?: string;
}) {
  const router = useRouter();
  const data = useKnowledgeResourceData(resourceId);
  const [activeTab, setActiveTab] = useState<ResourceDetailTab>(initialTab);
  const resource = data.resource;
  const course = data.course;
  const courseId = course?.id ?? requestedCourseId ?? "";
  const [page, setPage] = useState(1);
  const pageCount = resource ? resourcePageCount(resource.document) : 0;

  const chapterTree = useMemo(() => resource?.chapters ?? [], [resource?.chapters]);

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as ResourceDetailTab) : "parse";
    setActiveTab(next);
    const params = new URLSearchParams();
    params.set("from", from);
    if (courseId) params.set("courseId", courseId);
    params.set("tab", next);
    router.replace(`/knowledge/resources/${resourceId}?${params.toString()}`, { scroll: false });
  }

  if (data.isLoading) return <LoadingState label="正在加载资源详情..." />;
  if (data.isError) return <ErrorState description="资源详情加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  if (!resource || !course) {
    return (
      <EmptyState
        action={<Link className={buttonVariants()} href="/knowledge">返回知识库</Link>}
        description="资源不存在、已被删除，或不属于当前教师账号。"
        title="未找到知识资源"
      />
    );
  }

  const breadcrumbs = from === "course"
    ? [{ label: "课程管理", href: "/courses" }, { label: course.name, href: `/courses/${course.id}?tab=materials` }, { label: resource.document.original_name }]
    : [{ label: "知识库", href: "/knowledge" }, { label: "资源详情" }, { label: resource.document.original_name }];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "outline" })} href={buildSourceHref(resourceId, { from: "resource", courseId, page: 1 })}>
              <ExternalLink data-icon="inline-start" />
              查看原文
            </Link>
            <Button disabled type="button" variant="outline"><RefreshCw data-icon="inline-start" />替换文件</Button>
          </>
        }
        breadcrumbs={breadcrumbs}
        description="文件详情、AI 解析状态和课程知识来源处理中心。"
        title={resource.document.original_name}
      />

      <ResourceHeader resource={resource} />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b border-border px-0" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 flex-none px-4" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "parse" ? (
            <div className="space-y-5">
              <ParseStatusPanel
                chapterCount={resource.chapters.length}
                courseId={course.id}
                document={resource.document}
                knowledgePointCount={resource.knowledgePointCount}
                onChanged={data.refetch}
              />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                <DocumentPreviewPanel page={page} pageCount={pageCount} setPage={setPage} title={resource.document.original_name} />
                <ChapterAndPointPreview courseId={course.id} resourceId={resourceId} chapters={chapterTree} />
              </div>
            </div>
          ) : null}

          {activeTab === "overview" ? <OverviewTab resource={resource} /> : null}
          {activeTab === "chapters" ? <ChapterTree chapters={chapterTree} courseId={course.id} from="resource" resourceId={resourceId} /> : null}
          {activeTab === "points" ? (
            resource.chapters.length ? (
              <KnowledgeStructureEditor chapters={resource.chapters} courseId={course.id} documentId={resource.document.id} onChanged={data.refetch} />
            ) : <EmptyState description="该资源尚未解析出章节和知识点，请先执行解析。" title="暂无知识点" />
          ) : null}
          {activeTab === "index" ? <IndexTab resource={resource} /> : null}
          {activeTab === "citations" ? (
            <EmptyState
              description="当前后端没有按资源查询引用使用记录的接口；不会用演示数据替代真实引用。"
              title="引用记录暂不可用"
            />
          ) : null}
          {activeTab === "related" ? <RelatedResources course={course} /> : null}
        </TabsContent>
      </Tabs>

      <ResourceAside courseId={course.id} courseName={course.name} resource={resource} resourceId={resourceId} />
    </div>
  );
}

function ResourceHeader({ resource }: { resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]> }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div className="flex h-36 w-full shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#10233f_0%,#1559c6_60%,#50a7ff_100%)] text-white sm:w-44">
            <div className="text-center">
              <ResourceKindIcon className="mx-auto bg-white/15 text-white" document={resource.document} />
              <p className="mt-3 text-xs font-medium tracking-[0.16em] text-white/70">PDF RESOURCE</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={resource.statusTone}>{resource.statusLabel}</StatusBadge>
              <StatusBadge tone="info">{resource.kind}</StatusBadge>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{resource.document.original_name}</h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>{formatBytes(resource.document.size_bytes)}</span>
              <span>{resource.document.page_count ? `${resource.document.page_count} 页` : "页数未知"}</span>
              <span>上传于 {formatDate(resource.document.created_at)}</span>
              <span>{resource.chapters.length} 章 · {resource.knowledgePointCount} 个知识点</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className={buttonVariants({ variant: "outline" })} href={buildSourceHref(resource.document.id, { from: "resource", courseId: resource.document.course_id, page: 1 })}>
                查看解析原文
              </Link>
              <Button disabled type="button" variant="outline"><LockKeyhole data-icon="inline-start" />文件流未开放</Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-blue-50/35 p-5 xl:border-l xl:border-t-0 xl:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" />ECHO 资源摘要</div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {resource.document.status === "ready"
              ? `资料已进入课程知识结构，当前包含 ${resource.chapters.length} 个章节和 ${resource.knowledgePointCount} 个知识点。`
              : resource.document.status === "failed"
                ? "资料解析失败，请查看解析状态并重新执行，当前不会作为可用 AI 来源。"
                : "资料已上传，等待教师执行文档解析、章节抽取、文本切分和向量索引。"}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">资源处理状态来自后端 Document.status，未确认的索引阶段不会标记为完成。</p>
        </div>
      </div>
    </section>
  );
}

function DocumentPreviewPanel({
  page,
  pageCount,
  setPage,
  title,
}: {
  page: number;
  pageCount: number;
  setPage: (value: number) => void;
  title: string;
}) {
  const maxPage = Math.max(1, pageCount);
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>文档预览</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">当前后端未提供文件流接口，先保留正确页数、翻页和原文证据入口。</p>
          </div>
          <StatusBadge tone="warning">文件流待后端补齐</StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <Button disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))} size="icon-sm" type="button" variant="outline"><ArrowLeft /></Button>
            <span className="min-w-20 text-center text-sm tabular-nums">第 {Math.min(page, maxPage)} / {maxPage} 页</span>
            <Button disabled={page >= maxPage} onClick={() => setPage(Math.min(maxPage, page + 1))} size="icon-sm" type="button" variant="outline"><ArrowRight /></Button>
          </div>
          <p className="min-w-0 truncate text-xs text-muted-foreground">{title}</p>
        </div>
        <div className="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-border bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-8 text-center">
          <div className="max-w-md">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">第 {Math.min(page, maxPage)} 页定位已保留</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              PDF 文件流接口缺失，当前不伪造页面内容。原文引用和正确页码会在来源查看页根据检索结果展示。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChapterAndPointPreview({ courseId, resourceId, chapters }: { courseId: string; resourceId: string; chapters: Chapter[] }) {
  return (
    <div className="space-y-4">
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle>章节结构</CardTitle>
          <p className="text-xs text-muted-foreground">来自真实章节数据，点击知识点可进入正式详情页。</p>
        </CardHeader>
        <CardContent className="px-5">
          <ChapterTree chapters={chapters} courseId={courseId} from="resource" resourceId={resourceId} />
        </CardContent>
      </Card>
      <Card className="gap-3 py-5">
        <CardHeader className="px-5">
          <CardTitle>知识点摘要</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-5">
          {chapters.flatMap((chapter) => chapter.knowledge_points).slice(0, 5).map((point) => (
            <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 text-sm hover:border-blue-200" href={buildPointHref(point.id, { from: "resource", courseId, resourceId, tab: "overview" })} key={point.id}>
              <span className="min-w-0 truncate">{point.name}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {!chapters.some((chapter) => chapter.knowledge_points.length) ? <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">暂无知识点。</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewTab({ resource }: { resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]> }) {
  const lastChapter = resource.chapters.at(-1);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>内容概览</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-5 text-sm leading-7 text-muted-foreground">
          <p>该资源当前被识别为“{resource.kind}”，后端未提供版权、作者、出版社、摘要和关键词字段。</p>
          <p>已有解析结果包含 {resource.chapters.length} 个章节、{resource.knowledgePointCount} 个知识点，最后章节为“{lastChapter?.title ?? "暂无"}”。</p>
          <p>当前页面只展示可验证的文档元数据和课程结构，不补写教材摘要。</p>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>解析结果统计</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 px-5">
          <Metric icon={BookOpen} label="章节" value={resource.chapters.length} />
          <Metric icon={Layers3} label="知识点" value={resource.knowledgePointCount} />
          <Metric icon={ScanText} label="页数" value={resource.document.page_count ?? "未知"} />
          <Metric icon={Box} label="文件类型" value={resource.kind} />
        </CardContent>
      </Card>
    </div>
  );
}

function IndexTab({ resource }: { resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]> }) {
  const progress = resource.document.status === "ready" ? 100 : resource.document.status === "parsing" ? 55 : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="gap-5 py-5">
        <CardHeader className="px-5"><CardTitle>向量索引状态</CardTitle><p className="text-sm text-muted-foreground">后端目前只提供重建 Chunk 和 Embedding 的写接口，没有查询索引详情接口。</p></CardHeader>
        <CardContent className="space-y-5 px-5">
          <Progress value={progress} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={Box} label="文档状态" value={resource.statusLabel} />
            <Metric icon={Layers3} label="结构已完成" value={resource.chapters.length ? "是" : "否"} />
            <Metric icon={ScanText} label="索引详情" value="待接口" />
          </div>
        </CardContent>
      </Card>
      <Card className="gap-4 border-orange-100 bg-orange-50/35 py-5">
        <CardHeader className="px-5"><CardTitle className="text-orange-800">能力说明</CardTitle></CardHeader>
        <CardContent className="px-5 text-sm leading-6 text-orange-800/80">
          当前不会把 ready 状态单独解释为“向量索引已完成”。真实索引结论需要通过解析工作台重新运行构建流程。
        </CardContent>
      </Card>
    </div>
  );
}

function RelatedResources({ course }: { course: { id: string; name: string } }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>相关资源</CardTitle><p className="text-sm text-muted-foreground">当前资源属于课程“{course.name}”，其他资料需通过课程知识库列表查看。</p></CardHeader>
      <CardContent className="px-5">
        <EmptyState description="后端没有资源相似度或共享知识点关联接口，当前不伪造“相关资源”。" title="暂无相关资源" />
      </CardContent>
    </Card>
  );
}

function ResourceAside({
  courseId,
  courseName,
  resource,
  resourceId,
}: {
  courseId: string;
  courseName: string;
  resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]>;
  resourceId: string;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>资源信息</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <Info label="文件名" value={resource.document.original_name} />
          <Info label="文件大小" value={formatBytes(resource.document.size_bytes)} />
          <Info label="文件类型" value={resource.document.content_type || "PDF"} />
          <Info label="上传时间" value={formatDate(resource.document.created_at)} />
          <Info label="所属课程" value={courseName} />
          <Info label="状态" value={resource.statusLabel} />
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>快捷入口</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 px-5">
          <Link className={buttonVariants({ variant: "outline" })} href={buildSourceHref(resourceId, { from: "resource", courseId, page: 1 })}><ExternalLink data-icon="inline-start" />查看教材来源</Link>
          <Link className={buttonVariants({ variant: "outline" })} href={`/knowledge?courseId=${courseId}`}><BookOpen data-icon="inline-start" />返回知识库</Link>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>后端缺口</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-5 text-sm leading-6 text-muted-foreground">
          <p>原始 PDF 文件流、作者/出版社/版权元数据、资源标签、删除/回收站、被引用次数和索引详情查询暂无接口。</p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-4 py-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
