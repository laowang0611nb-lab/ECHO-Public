"use client";
import type { ResourceType } from "@echo/shared-types";
import type { KnowledgeBaseTab, KnowledgeResourceView } from "@/features/knowledge/types";
import {
  BookOpen,
  FileCheck2,
  FileClock,
  FileText,
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
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeGraphPreview } from "@/features/knowledge/components/knowledge-graph-preview";
import { KnowledgeGraphView } from "@/features/knowledge/graph-v2/knowledge-graph-view";
import { ExternalResourcesTab, QuestionItemsTab } from "@/features/knowledge/components/resource-management-tabs";
import { ResourceKindIcon } from "@/features/knowledge/components/resource-kind-icon";
import { knowledgeQueryKeys, useExternalResources, useKnowledgeBaseData, useKnowledgeGraph, useQuestionItems, useTrashedResources } from "@/features/knowledge/queries";
import { buildResourceHref, summarizeKnowledgeBase } from "@/features/knowledge/view-model";
import { formatBytes, formatDate } from "@/features/courses/detail/utils";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

const resourceTypeOptions: Array<{ value: ResourceType; label: string }> = [
  { value: "textbook", label: "教材文档" },
  { value: "outline", label: "教学大纲" },
  { value: "question_bank", label: "题库" },
  { value: "code_example", label: "代码示例" },
  { value: "lab", label: "实验资料" },
];
const tabs = [
  { value: "graph", label: "知识图谱" },
  { value: "resources", label: "资源管理" },
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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const { courses, selectedCourseId, selectedCourse, setSelectedCourseId } = useCourseWorkspace();
  const queryTab = searchParams.get("tab");
  const activeTab: KnowledgeBaseTab = tabs.some((tab) => tab.value === queryTab)
    ? queryTab as KnowledgeBaseTab
    : initialTab;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "ready" | "failed">("all");
  const [uploadResourceType, setUploadResourceType] = useState<ResourceType>("textbook");
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
    mutationFn: (file: File) => apiClient.uploadCourseDocument(user!.id, courseId!, file, file.name, uploadResourceType),
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
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex h-[calc(100dvh-7rem)] min-h-[560px] flex-col overflow-hidden"
      initial={{ opacity: 0, y: 6 }}
    >
      <Tabs className="min-h-0 flex-1" onValueChange={handleTabChange} value={activeTab}>
        <div className="shrink-0 border-b border-border">
          <TabsList className="grid h-11 w-full grid-cols-3 justify-start rounded-none px-0 sm:grid-cols-6" variant="line">
            {tabs.map((tab) => (
              <TabsTrigger className="h-full w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent className="min-h-0 flex-1 overflow-hidden pt-4" value={activeTab}>
          {activeTab === "graph" ? (
            <div className="h-full min-h-0">
              <KnowledgeGraphView
                chapters={data.chapters}
                courseId={courseId}
                courseName={course?.name ?? "课程"}
                graph={graphQuery.data}
                isError={graphQuery.isError}
                isLoading={graphQuery.isPending}
                key={courseId}
                onRetry={() => void graphQuery.refetch()}
              />
            </div>
          ) : null}

          {activeTab === "resources" ? (
            <div className="h-full space-y-4 overflow-y-auto pr-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">资源管理</h2>
                  <p className="mt-1 text-xs text-muted-foreground">上传 PDF 教材，解析章节与知识点后即可在知识图谱中查看。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    disabled={uploadMutation.isPending}
                    onChange={(event) => handleUpload(event.target.files)}
                    ref={fileRef}
                    type="file"
                  />
                  <Select
                    items={resourceTypeOptions}
                    onValueChange={(value) => value && setUploadResourceType(value as ResourceType)}
                    value={uploadResourceType}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{resourceTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                  <Button disabled={uploadMutation.isPending} onClick={() => fileRef.current?.click()} type="button">
                    <Plus data-icon="inline-start" />
                    {uploadMutation.isPending ? "正在上传..." : "上传资源"}
                  </Button>
                </div>
              </div>

              {uploadMutation.isError ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {uploadMutation.error instanceof Error ? uploadMutation.error.message : "资源上传失败，请重试。"}
                </p>
              ) : null}

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
                      <KnowledgeGraphPreview chapters={data.chapters} compact courseId={courseId} courseName={course?.name ?? "课程"} graph={graphQuery.data} />
                    </CardContent>
                  </Card>
                  <RecentUploads courseId={courseId} resources={data.resources} />
                </aside>
              </div>
            </div>
          ) : null}

          {activeTab === "textbooks" ? (
            <div className="h-full overflow-y-auto pr-1">
              {data.resources.length ? (
              <Card className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b px-5 py-4">
                  <CardTitle>教材与大纲</CardTitle>
                  <p className="text-xs text-muted-foreground">当前后端支持 PDF；资源类型优先使用正式 resource_type，旧数据再按文件名回退。</p>
                </CardHeader>
                <CardContent className="divide-y divide-border px-0">
                  {data.resources.filter((resource) => resource.document.resource_type === "textbook" || resource.document.resource_type === "outline").map((resource) => <ResourceRow courseId={courseId} key={resource.document.id} resource={resource} />)}
                </CardContent>
              </Card>
              ) : <EmptyState description="上传教材或教学大纲后，这里会显示正式知识来源。" title="暂无教材与大纲" />}
            </div>
          ) : null}

          {activeTab === "examples" ? (
            <div className="h-full overflow-y-auto pr-1">
              <QuestionItemsTab chapters={data.chapters} courseId={courseId} query={questionItemsQuery} />
            </div>
          ) : null}
          {activeTab === "external" ? (
            <div className="h-full overflow-y-auto pr-1">
              <ExternalResourcesTab chapters={data.chapters} courseId={courseId} query={externalResourcesQuery} />
            </div>
          ) : null}
          {activeTab === "recycle" ? (
            <div className="h-full overflow-y-auto pr-1">
              <ResourceTrashTab query={trashedResourcesQuery} courseId={courseId} onChanged={data.refetch} />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
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
  return <div className="space-y-3">
    {restoreMutation.isError || deleteMutation.isError ? (
      <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {(restoreMutation.error ?? deleteMutation.error) instanceof Error ? (restoreMutation.error ?? deleteMutation.error)?.message : "回收站操作失败。"}
      </p>
    ) : null}
    <div className="grid gap-3">{items.map((item) => <Card className="gap-3 py-5" key={`${item.item_type}-${item.id}`}><CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{item.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{resourceItemTypeLabel(item.item_type)} · 删除于 {item.trashed_at?.slice(0, 16).replace("T", " ") ?? "未知时间"}</p></div><div className="flex gap-2"><Button disabled={restoreMutation.isPending} onClick={() => restoreMutation.mutate(item.id)} size="sm" type="button" variant="outline"><RotateCcw data-icon="inline-start" />恢复</Button><Button disabled={deleteMutation.isPending} onClick={() => { if (window.confirm("永久删除后无法恢复，确定继续吗？")) deleteMutation.mutate(item.id); }} size="sm" type="button" variant="destructive"><Trash2 data-icon="inline-start" />永久删除</Button></div></div></CardHeader></Card>)}</div>
  </div>;
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
