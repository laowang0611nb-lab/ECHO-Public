"use client";
import type { KnowledgeBaseTab, KnowledgeResourceView } from "@/features/knowledge/types";
import {
  BookOpen,
  FileCheck2,
  FileClock,
  FileText,
  ExternalLink,
  Layers3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeGraphPreview } from "@/features/knowledge/components/knowledge-graph-preview";
import { ResourceKindIcon } from "@/features/knowledge/components/resource-kind-icon";
import { knowledgeQueryKeys, useExternalResources, useKnowledgeBaseData, useKnowledgeGraph, useQuestionItems, useTrashedResources } from "@/features/knowledge/queries";
import { buildResourceHref, summarizeKnowledgeBase } from "@/features/knowledge/view-model";
import { formatBytes, formatDate } from "@/features/courses/detail/utils";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "resources", label: "资源管理" },
  { value: "graph", label: "知识图谱" },
  { value: "textbooks", label: "教材与大纲" },
  { value: "examples", label: "示例与习题" },
  { value: "external", label: "外部资源" },
  { value: "recycle", label: "回收站" },
] as const;

export function KnowledgeBasePage({
  initialCourseId,
  initialTab,
}: {
  initialCourseId?: string;
  initialTab: KnowledgeBaseTab;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const { courses, selectedCourseId, selectedCourse, setSelectedCourseId } = useCourseWorkspace();
  const [activeTab, setActiveTab] = useState<KnowledgeBaseTab>(initialTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "ready" | "failed">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const course = courses.find((item) => item.id === courseId) ?? selectedCourse;
  const data = useKnowledgeBaseData(courseId);
  const questionItemsQuery = useQuestionItems(courseId);
  const externalResourcesQuery = useExternalResources(courseId);
  const trashedResourcesQuery = useTrashedResources(courseId);
  const graphQuery = useKnowledgeGraph(courseId);

  useEffect(() => {
    if (courseId && selectedCourseId !== courseId) {
      setSelectedCourseId(courseId);
    }
  }, [courseId, selectedCourseId, setSelectedCourseId]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadCourseDocument(user!.id, courseId!, file, file.name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.resources(user!.id, courseId!) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.chapters(user!.id, courseId!) });
      if (fileRef.current) fileRef.current.value = "";
    },
  });

  const summary = summarizeKnowledgeBase(data.resources);
  const filteredResources = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.resources.filter((resource) => {
      const matchesSearch =
        !keyword ||
        resource.document.original_name.toLowerCase().includes(keyword) ||
        resource.kind.toLowerCase().includes(keyword);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && ["uploaded", "parsing"].includes(resource.document.status)) ||
        (statusFilter === "ready" && resource.document.status === "ready") ||
        (statusFilter === "failed" && resource.document.status === "failed");
      return matchesSearch && matchesStatus;
    });
  }, [data.resources, search, statusFilter]);

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as KnowledgeBaseTab) : "resources";
    setActiveTab(next);
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    params.set("tab", next);
    router.replace(`/knowledge?${params.toString()}`, { scroll: false });
  }

  function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) uploadMutation.mutate(file);
  }

  if (!courseId) {
    return (
      <EmptyState
        action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>}
        description="请先创建或选择一门课程，再管理该课程的知识来源。"
        title="尚未选择课程"
      />
    );
  }

  if (data.isLoading) {
    return <LoadingState label="正在加载课程知识库..." />;
  }

  if (data.isError) {
    return <ErrorState description="知识库资源加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  }

  return (
    <motion.div animate={{ opacity: 1, y: 0 }} className="space-y-5" initial={{ opacity: 0, y: 6 }}>
      <PageHeader
        actions={
          <>
            <input
              accept=".pdf,application/pdf"
              className="sr-only"
              disabled={uploadMutation.isPending}
              onChange={(event) => handleUpload(event.target.files)}
              ref={fileRef}
              type="file"
            />
            <Button disabled={uploadMutation.isPending} onClick={() => fileRef.current?.click()} type="button">
              <Plus data-icon="inline-start" />
              {uploadMutation.isPending ? "正在上传..." : "上传资源"}
            </Button>
          </>
        }
        breadcrumbs={[{ label: "知识库" }]}
        description="构建高质量的教学知识体系，让 AI 更懂你的课程。"
        title="知识库"
      />

      {uploadMutation.isError ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {uploadMutation.error instanceof Error ? uploadMutation.error.message : "资源上传失败，请重试。"}
        </p>
      ) : null}

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 justify-start rounded-none border-b border-border px-0 sm:grid-cols-6" variant="line">
          {tabs.map((tab) => (
            <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "resources" ? (
            <div className="space-y-5">
              <ResourceStats summary={summary} />
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]">
                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <CardTitle>资源列表</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">资源类型、解析状态和知识结构均来自当前课程真实数据。</p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative min-w-64">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input className="pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="搜索资源名称..." value={search} />
                        </div>
                        <Select
                          items={[
                            { value: "all", label: "全部状态" },
                            { value: "pending", label: "待处理" },
                            { value: "ready", label: "已解析" },
                            { value: "failed", label: "解析失败" },
                          ]}
                          onValueChange={(value) => value && setStatusFilter(value as typeof statusFilter)}
                          value={statusFilter}
                        >
                          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">全部状态</SelectItem>
                              <SelectItem value="pending">待处理</SelectItem>
                              <SelectItem value="ready">已解析</SelectItem>
                              <SelectItem value="failed">解析失败</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5">
                    {filteredResources.length ? (
                      <div className="divide-y divide-border rounded-lg border border-border">
                        {filteredResources.map((resource) => (
                          <ResourceRow courseId={courseId} key={resource.document.id} resource={resource} />
                        ))}
                      </div>
                    ) : data.resources.length ? (
                      <EmptyState description="调整搜索关键词或状态筛选后重试。" title="没有匹配资源" />
                    ) : (
                      <EmptyState
                        action={<Button onClick={() => fileRef.current?.click()} type="button"><Upload data-icon="inline-start" />上传 PDF</Button>}
                        description="上传第一份 PDF 教材后，可继续解析章节、抽取知识点并建立可检索索引。"
                        title="还没有知识资源"
                      />
                    )}
                  </CardContent>
                </Card>

                <aside className="space-y-4">
                  <Card className="gap-4 py-5">
                    <CardHeader className="px-5">
                      <CardTitle>知识结构预览</CardTitle>
                      <p className="text-xs text-muted-foreground">当前由真实章节和知识点生成。</p>
                    </CardHeader>
                    <CardContent className="px-5">
                      <KnowledgeGraphPreview chapters={data.chapters} compact courseId={courseId} courseName={course?.name ?? "课程"} relationCount={graphQuery.data?.edges.length} />
                    </CardContent>
                  </Card>
                  <RecentUploads courseId={courseId} resources={data.resources} />
                </aside>
              </div>
            </div>
          ) : null}

          {activeTab === "graph" ? (
            <Card className="gap-5 py-5">
              <CardHeader className="px-5">
                <CardTitle>课程知识图谱预览</CardTitle>
                <p className="text-sm text-muted-foreground">跨知识点关系接口需求已登记，当前展示真实章节结构和知识点数量。</p>
              </CardHeader>
              <CardContent className="px-5">
                <KnowledgeGraphPreview chapters={data.chapters} courseId={courseId} courseName={course?.name ?? "课程"} relationCount={graphQuery.data?.edges.length} />
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "textbooks" ? (
            data.resources.length ? (
              <Card className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b px-5 py-4">
                  <CardTitle>教材与大纲</CardTitle>
                  <p className="text-xs text-muted-foreground">当前后端只支持 PDF 资源；类型来自文件名识别。</p>
                </CardHeader>
                <CardContent className="divide-y divide-border px-0">
                  {data.resources.map((resource) => <ResourceRow courseId={courseId} key={resource.document.id} resource={resource} />)}
                </CardContent>
              </Card>
            ) : <EmptyState description="上传教材或教学大纲后，这里会显示正式知识来源。" title="暂无教材与大纲" />
          ) : null}

          {activeTab === "examples" ? <QuestionItemsTab query={questionItemsQuery} /> : null}
          {activeTab === "external" ? <ExternalResourcesTab query={externalResourcesQuery} /> : null}
          {activeTab === "recycle" ? <ResourceTrashTab query={trashedResourcesQuery} courseId={courseId} onChanged={data.refetch} /> : null}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function QuestionItemsTab({ query }: { query: ReturnType<typeof useQuestionItems> }) {
  if (query.isLoading) return <LoadingState label="正在加载示例与习题..." />;
  if (query.isError) return <ErrorState description="示例与习题加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (!items.length) return <EmptyState description="当前课程还没有题库、代码示例或实验题目。" title="暂无示例与习题数据" />;
  return <div className="grid gap-3 xl:grid-cols-2">{items.map((item) => <Card className="gap-3 py-5" key={item.id}><CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{item.title}</CardTitle><div className="flex gap-2"><StatusBadge tone="info">{questionTypeLabel(item.type)}</StatusBadge><StatusBadge tone={item.difficulty === "hard" ? "danger" : item.difficulty === "medium" ? "warning" : "success"}>{questionDifficultyLabel(item.difficulty)}</StatusBadge></div></div></CardHeader><CardContent className="space-y-2 px-5 text-sm leading-6"><p className="line-clamp-4 whitespace-pre-wrap">{item.content}</p><p className="text-xs text-muted-foreground">关联知识点 {item.knowledge_point_ids.length} 个{item.source_page ? ` · 来源第 ${item.source_page} 页` : ""}</p></CardContent></Card>)}</div>;
}

function ExternalResourcesTab({ query }: { query: ReturnType<typeof useExternalResources> }) {
  if (query.isLoading) return <LoadingState label="正在加载外部资源..." />;
  if (query.isError) return <ErrorState description="外部资源加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (!items.length) return <EmptyState description="当前课程还没有登记外部链接或平台资源。" title="暂无外部资源" />;
  return <div className="grid gap-3">{items.map((item) => <Card className="gap-3 py-5" key={item.id}><CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate">{item.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{item.provider || "外部来源"} · {item.last_verified_at ? `校验于 ${item.last_verified_at.slice(0, 10)}` : "尚未校验"}</p></div><StatusBadge tone={externalStatusTone(item.check_status)}>{externalStatusLabel(item.check_status)}</StatusBadge></div></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3 px-5 text-sm"><p className="min-w-0 flex-1 text-muted-foreground">{item.description || "暂无描述"}</p><a className={buttonVariants({ size: "sm", variant: "outline" })} href={item.url} rel="noreferrer" target="_blank"><ExternalLink data-icon="inline-start" />打开链接</a></CardContent></Card>)}</div>;
}

function ResourceTrashTab({ query, courseId, onChanged }: { query: ReturnType<typeof useTrashedResources>; courseId: string; onChanged: () => void }) {
  const { user } = useTeacherSession();
  const queryClient = useQueryClient();
  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiClient.restoreResource(user!.id, courseId, id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.resourceList(user!.id, courseId, true) }); onChanged(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.permanentlyDeleteResource(user!.id, courseId, id),
    onSuccess: () => { void query.refetch(); onChanged(); },
  });
  if (query.isLoading) return <LoadingState label="正在加载回收站..." />;
  if (query.isError) return <ErrorState description="回收站加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (!items.length) return <EmptyState description="当前课程没有已删除的资源、章节、知识点、习题或外部链接。" title="回收站为空" />;
  return <div className="grid gap-3">{items.map((item) => <Card className="gap-3 py-5" key={`${item.item_type}-${item.id}`}><CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{item.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{resourceItemTypeLabel(item.item_type)} · 删除于 {item.trashed_at?.slice(0, 16).replace("T", " ") ?? "未知时间"}</p></div><div className="flex gap-2"><Button disabled={restoreMutation.isPending} onClick={() => restoreMutation.mutate(item.id)} size="sm" type="button" variant="outline"><RotateCcw data-icon="inline-start" />恢复</Button><Button disabled={deleteMutation.isPending} onClick={() => { if (window.confirm("永久删除后无法恢复，确定继续吗？")) deleteMutation.mutate(item.id); }} size="sm" type="button" variant="destructive"><Trash2 data-icon="inline-start" />永久删除</Button></div></div></CardHeader></Card>)}</div>;
}

function externalStatusLabel(status: "unchecked" | "valid" | "invalid" | "unknown") {
  return { unchecked: "未校验", valid: "链接有效", invalid: "链接失效", unknown: "状态未知" }[status];
}

function externalStatusTone(status: "unchecked" | "valid" | "invalid" | "unknown") {
  if (status === "valid") return "success" as const;
  if (status === "invalid") return "danger" as const;
  return "neutral" as const;
}

function questionTypeLabel(type: string) {
  const labels: Record<string, string> = { single_choice: "单选", multiple_choice: "多选", true_false: "判断", short_answer: "简答", coding: "编程", experiment: "实验" };
  return labels[type] ?? type;
}

function questionDifficultyLabel(difficulty: string) {
  return { easy: "基础", medium: "中等", hard: "困难" }[difficulty] ?? difficulty;
}

function resourceItemTypeLabel(type: string) {
  const labels: Record<string, string> = { document: "文档", chapter: "章节", knowledge_point: "知识点", question_item: "习题", external_resource: "外部资源" };
  return labels[type] ?? type;
}

function ResourceStats({ summary }: { summary: ReturnType<typeof summarizeKnowledgeBase> }) {
  const items = [
    { label: "资源总数", value: summary.total, icon: FileText, tone: "text-primary" },
    { label: "已解析", value: summary.ready, icon: FileCheck2, tone: "text-emerald-600" },
    { label: "待处理", value: summary.pending + summary.processing, icon: FileClock, tone: "text-orange-600" },
    { label: "解析失败", value: summary.failed, icon: FileText, tone: "text-red-600" },
    { label: "章节", value: summary.chapters, icon: BookOpen, tone: "text-primary" },
    { label: "知识点", value: summary.knowledgePoints, icon: Layers3, tone: "text-emerald-600" },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {items.map((item) => (
        <Card className="gap-3 py-4" key={item.label} size="sm">
          <CardContent className="px-4">
            <item.icon className={cn("size-4", item.tone)} />
            <p className="mt-3 text-2xl font-semibold">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ResourceRow({ courseId, resource }: { courseId: string; resource: KnowledgeResourceView }) {
  return (
    <Link
      className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
      href={buildResourceHref(resource.document.id, { from: "knowledge", courseId })}
    >
      <ResourceKindIcon document={resource.document} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{resource.document.original_name}</p>
          <StatusBadge tone={resource.statusTone}>{resource.statusLabel}</StatusBadge>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{resource.kind}</span>
          <span>{formatBytes(resource.document.size_bytes)}</span>
          <span>{formatDate(resource.document.created_at)}</span>
          <span>{resource.chapters.length} 章 · {resource.knowledgePointCount} 个知识点</span>
        </div>
      </div>
    </Link>
  );
}

function RecentUploads({ courseId, resources }: { courseId: string; resources: KnowledgeResourceView[] }) {
  const recent = [...resources].sort((a, b) => b.document.created_at.localeCompare(a.document.created_at)).slice(0, 5);
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle>最近上传</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border px-5">
        {recent.length ? recent.map((resource) => (
          <Link className="flex items-center gap-3 py-3" href={buildResourceHref(resource.document.id, { from: "knowledge", courseId })} key={resource.document.id}>
            <ResourceKindIcon className="size-8" document={resource.document} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{resource.document.original_name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{formatDate(resource.document.created_at)}</span>
            </span>
          </Link>
        )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无上传记录。</p>}
      </CardContent>
    </Card>
  );
}
