"use client";
import type { Chapter, CourseDocument } from "@echo/shared-types";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  Download,
  ExternalLink,
  FileUp,
  Layers3,
  Pencil,
  ScanText,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChapterTree } from "@/features/knowledge/components/chapter-tree";
import { KnowledgeStructureEditor } from "@/features/knowledge/components/knowledge-structure-editor";
import { ParseStatusPanel } from "@/features/knowledge/components/parse-status-panel";
import { ResourceKindIcon } from "@/features/knowledge/components/resource-kind-icon";
import { useDocumentCitations, useDocumentFileBlob, useDocumentIndexStatus, useDocumentPageEvidence, useKnowledgeResourceData, useUpdateDocumentMetadata } from "@/features/knowledge/queries";
import type { ResourceDetailTab } from "@/features/knowledge/types";
import { buildPointHref, buildSourceHref, resourcePageCount } from "@/features/knowledge/view-model";
import { formatBytes, formatDate } from "@/features/courses/detail/utils";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const tabs = [
  { value: "parse", label: "解析状态" },
  { value: "overview", label: "内容概览" },
  { value: "chapters", label: "章节结构" },
  { value: "points", label: "知识点抽取" },
  { value: "index", label: "向量索引" },
  { value: "citations", label: "引用情况" },
  { value: "related", label: "相关资源" },
] as const;

function resourceDisplayName(document: CourseDocument) {
  return document.display_name?.trim() || document.original_name;
}

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
    ? [{ label: "课程管理", href: "/courses" }, { label: course.name, href: `/courses/${course.id}?tab=materials` }, { label: resourceDisplayName(resource.document) }]
    : [{ label: "知识库", href: "/knowledge" }, { label: "资源详情" }, { label: resourceDisplayName(resource.document) }];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "outline" })} href={buildSourceHref(resourceId, { from: "resource", courseId, page: 1 })}>
              <ExternalLink data-icon="inline-start" />
              查看原文
            </Link>
          </>
        }
        breadcrumbs={breadcrumbs}
        description="文件详情、AI 解析状态和课程知识来源处理中心。"
        title={resourceDisplayName(resource.document)}
      />

      <ResourceHeader onMetadataChanged={data.refetch} resource={resource} />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border px-0 sm:grid-cols-4 xl:grid-cols-7" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
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
                <DocumentPreviewPanel courseId={course.id} documentId={resource.document.id} page={page} pageCount={pageCount} setPage={setPage} title={resourceDisplayName(resource.document)} />
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
          {activeTab === "index" ? <IndexTab courseId={course.id} documentId={resource.document.id} resource={resource} /> : null}
          {activeTab === "citations" ? <CitationsTab courseId={course.id} documentId={resource.document.id} /> : null}
          {activeTab === "related" ? <RelatedResources course={course} /> : null}
        </TabsContent>
      </Tabs>

      <ResourceAside courseId={course.id} courseName={course.name} resource={resource} resourceId={resourceId} />
    </div>
  );
}

function ResourceHeader({
  resource,
  onMetadataChanged,
}: {
  resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]>;
  onMetadataChanged: () => void;
}) {
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={resource.statusTone}>{resource.statusLabel}</StatusBadge>
                <StatusBadge tone="info">{resource.kind}</StatusBadge>
              </div>
              <div className="flex flex-wrap gap-2">
                <ResourceVersionDialog document={resource.document} onChanged={onMetadataChanged} />
                <ResourceMetadataDialog document={resource.document} onChanged={onMetadataChanged} />
              </div>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{resourceDisplayName(resource.document)}</h2>
            {resource.document.display_name && resource.document.display_name !== resource.document.original_name ? <p className="mt-1 text-xs text-muted-foreground">原始文件：{resource.document.original_name}</p> : null}
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
              <ResourceFileButton courseId={resource.document.course_id} documentId={resource.document.id} fileName={resource.document.original_name} />
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-blue-50/35 p-5 xl:border-l xl:border-t-0 xl:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" />ECHO 资源摘要</div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {resource.document.summary || (resource.document.status === "ready"
              ? `资料已进入课程知识结构，当前包含 ${resource.chapters.length} 个章节和 ${resource.knowledgePointCount} 个知识点。`
              : resource.document.status === "failed"
                ? "资料解析失败，请查看解析状态并重新执行，当前不会作为可用 AI 来源。"
                : "资料已上传，等待教师执行文档解析、章节抽取、文本切分和向量索引。")}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">资源处理状态来自后端 Document.status；摘要和版权元数据可独立编辑，不会触发重新解析。</p>
        </div>
      </div>
    </section>
  );
}

interface ResourceMetadataForm {
  displayName: string;
  summary: string;
  keywords: string;
  author: string;
  publisher: string;
  copyright: string;
}

function metadataForm(document: CourseDocument): ResourceMetadataForm {
  return {
    displayName: document.display_name ?? document.original_name,
    summary: document.summary ?? "",
    keywords: document.keywords.join(", "),
    author: document.author ?? "",
    publisher: document.publisher ?? "",
    copyright: document.copyright ?? "",
  };
}


function ResourceVersionDialog({ document, onChanged }: { document: CourseDocument; onChanged: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setPending(false);
    setStep("");
    setCreatedId(null);
    setError(null);
  }

  async function uploadNewVersion() {
    if (!file || !user) return;
    setPending(true);
    setError(null);
    setCreatedId(null);
    try {
      setStep("上传新资源");
      const created = await apiClient.uploadCourseDocument(
        user.id,
        document.course_id,
        file,
        file.name,
        document.resource_type,
      );
      setCreatedId(created.id);
      setStep("解析文档");
      await apiClient.parseCourseDocument(user.id, created.id);
      setStep("生成知识结构");
      await apiClient.generateKnowledgeStructure(user.id, created.id);
      setStep("建立文本块");
      await apiClient.createDocumentChunks(user.id, created.id);
      setStep("生成向量索引");
      await apiClient.createDocumentEmbeddings(user.id, created.id);
      await queryClient.invalidateQueries({ queryKey: ["teacher", "knowledge"] });
      onChanged();
      router.push(`/knowledge/resources/${created.id}?from=resource&courseId=${document.course_id}&tab=parse`);
      setOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新版本处理失败。");
    } finally {
      setPending(false);
      setStep("");
    }
  }

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }} type="button" variant="outline">
        <FileUp data-icon="inline-start" />
        上传新版本
      </Button>
      <Dialog onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen && !pending) reset(); }} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上传资源新版本</DialogTitle>
            <DialogDescription>
              系统会先创建新资源并重新解析、生成结构、切块和向量化。旧资源不会被自动删除，已有 Citation 和学习证据继续保留。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">新文件（PDF）</span>
              <Input
                accept="application/pdf,.pdf"
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }}
                ref={inputRef}
                type="file"
              />
            </label>
            <div className="rounded-lg border border-blue-200 bg-blue-50/45 px-3 py-3 text-xs leading-5 text-blue-900">
              处理流程：上传 → 文档解析 → 章节与知识点 → 文本块 → 向量索引。处理失败时新资源仍会保留，可进入资源详情继续重试。
            </div>
            {step ? <p className="text-sm text-muted-foreground">当前步骤：{step}...</p> : null}
            {error ? (
              <div className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p>{error}</p>
                {createdId ? <Button className="mt-2" onClick={() => router.push(`/knowledge/resources/${createdId}?from=resource&courseId=${document.course_id}&tab=parse`)} size="sm" type="button" variant="outline">打开已上传资源</Button> : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">取消</Button>
            <Button disabled={pending || !file} onClick={() => void uploadNewVersion()} type="button">
              <FileUp data-icon="inline-start" />
              {pending ? "正在处理..." : "上传并处理"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function ResourceMetadataDialog({ document, onChanged }: { document: CourseDocument; onChanged: () => void }) {
  const mutation = useUpdateDocumentMetadata(document.course_id, document.id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ResourceMetadataForm>(() => metadataForm(document));
  const [error, setError] = useState<string | null>(null);

  function openMetadataDialog() {
    setForm(metadataForm(document));
    setError(null);
    setOpen(true);
  }

  function updateField<Key extends keyof ResourceMetadataForm>(key: Key, value: ResourceMetadataForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function saveMetadata() {
    const keywords = Array.from(
      new Set(form.keywords.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean)),
    );
    if (keywords.length > 50) {
      setError("关键词最多保留 50 项。");
      return;
    }
    mutation.mutate(
      {
        display_name: form.displayName.trim() || null,
        summary: form.summary.trim() || null,
        keywords,
        author: form.author.trim() || null,
        publisher: form.publisher.trim() || null,
        copyright: form.copyright.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          onChanged();
        },
        onError: (requestError) => setError(requestError.message || "资源元数据保存失败。"),
      },
    );
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Button onClick={openMetadataDialog} type="button" variant="outline">
        <Pencil data-icon="inline-start" />
        编辑元数据
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑资源元数据</DialogTitle>
          <DialogDescription>只更新展示信息，不重新解析文件，也不会改动页面、Chunk、Embedding 或引用。</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto py-2 pr-1 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">展示名称</span><Input maxLength={255} onChange={(event) => updateField("displayName", event.target.value)} value={form.displayName} /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">摘要</span><Textarea className="min-h-24 resize-y" maxLength={5000} onChange={(event) => updateField("summary", event.target.value)} value={form.summary} /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">关键词</span><Input onChange={(event) => updateField("keywords", event.target.value)} placeholder="用逗号分隔，例如：软件测试, 边界值" value={form.keywords} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">作者</span><Input maxLength={255} onChange={(event) => updateField("author", event.target.value)} value={form.author} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">出版社</span><Input maxLength={255} onChange={(event) => updateField("publisher", event.target.value)} value={form.publisher} /></label>
          <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs text-muted-foreground">版权说明</span><Input maxLength={255} onChange={(event) => updateField("copyright", event.target.value)} value={form.copyright} /></label>
          {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button disabled={mutation.isPending} onClick={() => setOpen(false)} type="button" variant="outline">取消</Button>
          <Button disabled={mutation.isPending} onClick={saveMetadata} type="button">{mutation.isPending ? "正在保存..." : "保存元数据"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentPreviewPanel({
  page,
  pageCount,
  setPage,
  title,
  courseId,
  documentId,
}: {
  page: number;
  pageCount: number;
  setPage: (value: number) => void;
  title: string;
  courseId: string;
  documentId: string;
}) {
  const pageEvidenceQuery = useDocumentPageEvidence(courseId, documentId, page);
  const maxPage = Math.max(1, pageCount);
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>文档预览</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">页面尺寸、文本块和真实坐标来自文档页级证据接口。</p>
          </div>
          <StatusBadge tone="success">页级证据已接入</StatusBadge>
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
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          {pageEvidenceQuery.isLoading ? <p className="py-16 text-center text-sm text-muted-foreground">正在加载页面证据...</p> : null}
          {pageEvidenceQuery.isError ? <p className="py-16 text-center text-sm text-destructive">页面证据加载失败。</p> : null}
          {pageEvidenceQuery.data ? (
            <div className="mx-auto max-w-3xl rounded-sm bg-white p-6 text-left shadow-sm ring-1 ring-border">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><p className="text-xs text-muted-foreground">Page {pageEvidenceQuery.data.page_number}</p><p className="text-[11px] text-muted-foreground">{pageEvidenceQuery.data.width && pageEvidenceQuery.data.height ? `${pageEvidenceQuery.data.width} × ${pageEvidenceQuery.data.height}` : "尺寸未知"}</p></div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{pageEvidenceQuery.data.text || "当前页没有文本内容。"}</p>
              <p className="mt-4 text-xs text-muted-foreground">{pageEvidenceQuery.data.blocks.length} 个文本块，{pageEvidenceQuery.data.blocks.filter((block) => block.bbox).length} 个坐标块。</p>
            </div>
          ) : null}
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
          <p>该资源当前被识别为“{resource.kind}”，展示名称、摘要、关键词、作者、出版社和版权说明均可通过元数据接口维护。</p>
          <div className="grid gap-3 rounded-lg border-2 border-border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <Info label="展示名称" value={resourceDisplayName(resource.document)} />
            <Info label="作者" value={resource.document.author || "未填写"} />
            <Info label="出版社" value={resource.document.publisher || "未填写"} />
            <Info label="版权" value={resource.document.copyright || "未填写"} />
          </div>
          <p>{resource.document.summary || "当前资源尚未填写摘要。"}</p>
          {resource.document.keywords.length ? <div className="flex flex-wrap gap-2">{resource.document.keywords.map((keyword) => <span className="inline-flex items-center gap-1 rounded-full border-2 border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-900" key={keyword}><Tag className="size-3" />{keyword}</span>)}</div> : <p>当前资源尚未填写关键词。</p>}
          <p>文件更新采用“上传新版本”流程：新资源解析完成后由教师确认，旧资源和历史引用继续保留。</p>
          <p>已有解析结果包含 {resource.chapters.length} 个章节、{resource.knowledgePointCount} 个知识点，最后章节为“{lastChapter?.title ?? "暂无"}”。</p>
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

function IndexTab({ courseId, documentId, resource }: { courseId: string; documentId: string; resource: NonNullable<ReturnType<typeof useKnowledgeResourceData>["resource"]> }) {
  const indexQuery = useDocumentIndexStatus(courseId, documentId);
  const index = indexQuery.data;
  const progress = index && index.chunks_total ? Math.round((index.chunks_embedded / index.chunks_total) * 100) : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="gap-5 py-5">
        <CardHeader className="px-5"><CardTitle>向量索引状态</CardTitle><p className="text-sm text-muted-foreground">页解析、Chunk 和 Embedding 状态来自后端索引接口。</p></CardHeader>
        <CardContent className="space-y-5 px-5">
          {indexQuery.isLoading ? <p className="text-sm text-muted-foreground">正在加载索引状态...</p> : null}
          {indexQuery.isError ? <ErrorState description="索引状态加载失败。" onRetry={() => void indexQuery.refetch()} /> : null}
          {index ? (
            <>
              <Progress value={progress} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric icon={Box} label="文档状态" value={index.status} />
                <Metric icon={Layers3} label="已解析页" value={`${index.pages_parsed}/${index.pages_total}`} />
                <Metric icon={ScanText} label="已向量化 Chunk" value={`${index.chunks_embedded}/${index.chunks_total}`} />
              </div>
              {index.error ? <p className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">{index.error}</p> : null}
              <p className="text-xs text-muted-foreground">最近索引：{index.last_indexed_at?.slice(0, 16).replace("T", " ") ?? "尚无记录"}</p>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Card className="gap-4 border-blue-100 bg-blue-50/40 py-5">
        <CardHeader className="px-5"><CardTitle className="text-blue-900">结构摘要</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm leading-6 text-blue-900/80">
          <p>当前资源包含 {resource.chapters.length} 个章节、{resource.knowledgePointCount} 个知识点。</p>
          <p>空白索引不会被解释为完成；进度以真实 Chunk 和 Embedding 数量计算。</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CitationsTab({ courseId, documentId }: { courseId: string; documentId: string }) {
  const citationsQuery = useDocumentCitations(courseId, documentId);
  if (citationsQuery.isLoading) return <LoadingState label="正在加载引用记录..." />;
  if (citationsQuery.isError) return <ErrorState description="引用记录加载失败。" onRetry={() => void citationsQuery.refetch()} />;
  const citations = citationsQuery.data?.items ?? [];
  if (!citations.length) return <EmptyState description="当前资源还没有被 AI 回答引用。" title="暂无引用记录" />;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4"><CardTitle>引用情况</CardTitle><p className="text-xs text-muted-foreground">共 {citationsQuery.data?.total ?? citations.length} 条真实消息引用。</p></CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {citations.map((citation) => <div className="grid gap-3 px-5 py-4 lg:grid-cols-[120px_minmax(0,1fr)_120px]" key={citation.id}><StatusBadge tone="info">{`第 ${citation.page_start} 页`}</StatusBadge><div className="min-w-0"><p className="line-clamp-3 text-sm leading-6">{citation.quote}</p><p className="mt-1 text-[11px] text-muted-foreground">Chunk {citation.chunk_id ?? "未知"}</p></div><p className="text-right text-xs text-muted-foreground">{citation.created_at.slice(0, 10)}</p></div>)}
      </CardContent>
    </Card>
  );
}

function ResourceFileButton({ courseId, documentId, fileName }: { courseId: string; documentId: string; fileName: string }) {
  const fileQuery = useDocumentFileBlob(courseId, documentId);
  const url = useMemo(() => fileQuery.data ? URL.createObjectURL(fileQuery.data) : null, [fileQuery.data]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  if (fileQuery.isError) {
    return <Button disabled type="button" variant="outline"><Download data-icon="inline-start" />文件读取失败</Button>;
  }
  if (!url) {
    return <Button disabled type="button" variant="outline"><Download data-icon="inline-start" />正在加载文件...</Button>;
  }
  return <a className={buttonVariants({ variant: "outline" })} download={fileName} href={url}><Download data-icon="inline-start" />打开 PDF</a>;
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
          <Info label="展示名称" value={resourceDisplayName(resource.document)} />
          <Info label="原始文件" value={resource.document.original_name} />
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
        <CardHeader className="px-5"><CardTitle>能力边界</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-5 text-sm leading-6 text-muted-foreground">
          <p>元数据编辑不会触发重新解析。文件更新采用“上传新版本”流程，旧资源、旧 Citation 和历史学习证据会保留，由教师确认后再回收旧版本。</p>
          <p>相关资源推荐尚未提供独立相似度接口，因此不生成无依据的关联。</p>
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
