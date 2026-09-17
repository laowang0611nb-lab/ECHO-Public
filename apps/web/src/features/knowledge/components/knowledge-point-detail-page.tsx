"use client";
import type { KnowledgePoint } from "@echo/shared-types";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileQuestion,
  Lightbulb,
  Pencil,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgePointData, useSourceEvidence } from "@/features/knowledge/queries";
import type { KnowledgePointTab } from "@/features/knowledge/types";
import { buildPointHref, buildResourceHref, buildSourceHref } from "@/features/knowledge/view-model";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "知识点概览" },
  { value: "related", label: "关联内容" },
  { value: "students", label: "学生掌握情况" },
  { value: "exercises", label: "相关习题" },
  { value: "suggestions", label: "教学建议" },
  { value: "analysis", label: "AI 分析" },
] as const;

export function KnowledgePointDetailPage({
  pointId,
  initialTab,
  from,
  courseId: requestedCourseId,
  resourceId: requestedResourceId,
}: {
  pointId: string;
  initialTab: KnowledgePointTab;
  from: string;
  courseId?: string;
  resourceId?: string;
}) {
  const router = useRouter();
  const data = useKnowledgePointData(pointId);
  const [activeTab, setActiveTab] = useState<KnowledgePointTab>(initialTab);
  const context = data.context;
  const courseId = context?.course.id ?? requestedCourseId ?? "";
  const resourceId = context?.sourceDocument?.id ?? requestedResourceId ?? "";
  const evidence = useSourceEvidence({
    courseId,
    documentId: resourceId,
    query: context?.point.name,
  });

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as KnowledgePointTab) : "overview";
    setActiveTab(next);
    const params = new URLSearchParams();
    params.set("from", from);
    if (courseId) params.set("courseId", courseId);
    if (resourceId) params.set("resourceId", resourceId);
    params.set("tab", next);
    router.replace(`/knowledge/points/${pointId}?${params.toString()}`, { scroll: false });
  }

  if (data.isLoading) return <LoadingState label="正在加载知识点详情..." />;
  if (data.isError) return <ErrorState description="知识点数据加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  if (!context) {
    return (
      <EmptyState
        action={<Link className={buttonVariants()} href="/knowledge">返回知识库</Link>}
        description="知识点不存在、已被合并删除，或不属于当前教师账号。"
        title="未找到知识点"
      />
    );
  }

  const breadcrumbs = knowledgePointBreadcrumbs(from, context.course.name, context.chapter.title);
  const mastery = context.analytics?.average_mastery ?? null;
  const affectedStudents = context.analytics?.affected_students ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <>
            <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
            <EditKnowledgePointDialog context={context} onChanged={data.refetch} />
          </>
        }
        breadcrumbs={breadcrumbs}
        description={`${context.course.name} · ${context.chapter.title}`}
        title={context.point.name}
      />

      <KnowledgePointHeader
        affectedStudents={affectedStudents}
        context={context}
        mastery={mastery}
      />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b border-border px-0" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 flex-none px-4" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <div className="space-y-4">
                <KnowledgeDescription context={context} />
                <TextbookLocation
                  context={context}
                  evidence={evidence.evidence}
                  evidenceLoading={evidence.isLoading}
                  evidenceError={evidence.isError}
                />
                <StudentMasteryCard context={context} />
                <UnavailableCard
                  description="后端没有知识点随时间的掌握度聚合接口，当前不使用虚构趋势。"
                  icon={AlertTriangle}
                  title="掌握趋势暂不可用"
                />
                <UnavailableCard
                  description="常见错误聚类依赖学生学习证据与错误模式分析接口，当前阶段不生成无依据结论。"
                  icon={CircleHelp}
                  title="常见错误暂不可用"
                />
              </div>
              <aside className="space-y-4">
                <RelatedPointsCard context={context} />
                <UnavailableCard
                  description="当前后端没有题库或知识点与题目关联接口。"
                  icon={FileQuestion}
                  title="相关习题暂不可用"
                />
                <TeachingSuggestionCard mastery={mastery} />
              </aside>
            </div>
          ) : null}
          {activeTab === "related" ? <RelatedContentTab context={context} /> : null}
          {activeTab === "students" ? <StudentMasteryTab context={context} /> : null}
          {activeTab === "exercises" ? <EmptyState description="当前后端未提供题库和知识点关联接口。" title="暂无相关习题" /> : null}
          {activeTab === "suggestions" ? <TeachingSuggestionDetail mastery={mastery} /> : null}
          {activeTab === "analysis" ? <AnalysisTab affectedStudents={affectedStudents} context={context} mastery={mastery} /> : null}
        </TabsContent>
      </Tabs>

      <nav className="flex items-center justify-between gap-3 border-t border-border pt-5">
        {context.previousPoint ? (
          <Link className={buttonVariants({ variant: "outline" })} href={buildPointHref(context.previousPoint.id, { from, courseId, resourceId })}>
            <ArrowLeft data-icon="inline-start" />上一个知识点
          </Link>
        ) : <span />}
        {context.nextPoint ? (
          <Link className={buttonVariants({ variant: "outline" })} href={buildPointHref(context.nextPoint.id, { from, courseId, resourceId })}>
            下一个知识点<ArrowRight data-icon="inline-end" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

function KnowledgePointHeader({
  context,
  mastery,
  affectedStudents,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  mastery: number | null;
  affectedStudents: number;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5 xl:grid-cols-[minmax(0,1fr)_520px] xl:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="info">课程知识点</StatusBadge>
          <StatusBadge tone={context.sourceDocument ? "success" : "warning"}>{context.sourceDocument ? "已有来源资源" : "无来源资源"}</StatusBadge>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          {context.point.description || "当前知识点只有名称，尚未填写详细定义。"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeaderMetric label="学生掌握度" value={mastery === null ? "暂无" : `${Math.round(mastery)}%`} tone={mastery !== null && mastery < 60 ? "warning" : "default"} />
        <HeaderMetric label="受影响学生" value={affectedStudents} />
        <HeaderMetric label="所属章节" value={context.chapter.order_index + 1} />
        <HeaderMetric label="同章知识点" value={context.chapter.knowledge_points.length} />
      </div>
    </section>
  );
}

function KnowledgeDescription({ context }: { context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]> }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>知识点描述</CardTitle></CardHeader>
      <CardContent className="space-y-4 px-5 text-sm leading-7 text-muted-foreground">
        <p>{context.point.description || "当前没有教师或 ECHO 整理的定义。"}</p>
        <div className="rounded-lg bg-muted/60 px-4 py-4">
          <p className="font-medium text-foreground">当前可用信息</p>
          <ul className="mt-2 flex flex-col gap-2">
            <li>知识点名称：{context.point.name}</li>
            <li>所属课程：{context.course.name}</li>
            <li>所属章节：{context.chapter.title}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function TextbookLocation({
  context,
  evidence,
  evidenceLoading,
  evidenceError,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  evidence: { page_start: number; page_end: number; content: string; chunk_id: string } | null;
  evidenceLoading: boolean;
  evidenceError: boolean;
}) {
  const page = evidence?.page_start;
  const sourceHref = context.sourceDocument
    ? buildSourceHref(context.sourceDocument.id, {
        from: "point",
        courseId: context.course.id,
        knowledgePointId: context.point.id,
        page,
        chunkId: evidence?.chunk_id,
      })
    : null;

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>知识点在教材中的位置</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">通过知识点名称检索真实教材 Chunk；不猜测页码。</p>
          </div>
          {sourceHref ? <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={sourceHref}><ExternalLink data-icon="inline-start" />查看原文</Link> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {!context.sourceDocument ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">没有可用的来源教材。</p> : null}
        {context.sourceDocument ? (
          <div className="rounded-lg border border-border px-4 py-4">
            <div className="flex items-center gap-3">
              <BookOpen className="size-4 text-primary" />
              <p className="min-w-0 truncate text-sm font-medium">{context.sourceDocument.original_name}</p>
              <StatusBadge tone="success">已上传</StatusBadge>
            </div>
            {evidenceLoading ? <p className="mt-4 text-sm text-muted-foreground">正在检索教材来源...</p> : null}
            {evidenceError ? <p className="mt-4 text-sm text-destructive">来源检索失败，但仍可通过资源页查看教材。</p> : null}
            {!evidenceLoading && !evidenceError && evidence ? (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">检索到页面：第 {evidence.page_start}-{evidence.page_end} 页</p>
                <blockquote className="mt-3 line-clamp-5 border-l-2 border-blue-400 bg-blue-50/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {evidence.content}
                </blockquote>
              </div>
            ) : null}
            {!evidenceLoading && !evidenceError && !evidence ? <p className="mt-4 text-sm text-muted-foreground">当前检索范围内没有匹配到教材片段。</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StudentMasteryCard({ context }: { context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]> }) {
  const analytics = context.analytics;
  const mastery = analytics?.average_mastery ?? null;
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>学生掌握情况</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">来自知识点班级分析接口，不代表永久能力标签。</p>
          </div>
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/students?knowledgePointId=${context.point.id}&courseId=${context.course.id}`}>查看学生学情</Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
        <div
          className="relative mx-auto flex size-40 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#2f7cf6 ${mastery ?? 0}%, #e5eaf2 ${mastery ?? 0}% 100%)` }}
        >
          <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card">
            <span className="text-3xl font-semibold">{mastery === null ? "暂无" : `${Math.round(mastery)}%`}</span>
            <span className="mt-1 text-xs text-muted-foreground">总体掌握度</span>
          </div>
        </div>
        <div className="space-y-3">
          <InfoLine label="受影响学生" value={`${analytics?.affected_students ?? 0} 人`} />
          <InfoLine label="已有学生证据" value={`${analytics?.students.length ?? 0} 人`} />
          <Progress value={mastery ?? 0} />
          <p className="text-xs leading-5 text-muted-foreground">后端没有已掌握/基本掌握/部分掌握/未掌握四档分类接口，因此不创建虚假分布。</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RelatedPointsCard({ context }: { context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]> }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>同章节相关知识点</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-5">
        {context.relatedPoints.length ? context.relatedPoints.map((point) => (
          <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 text-sm hover:border-blue-200" href={buildPointHref(point.id, { from: "point", courseId: context.course.id, resourceId: context.sourceDocument?.id })} key={point.id}>
            <span className="min-w-0 truncate">{point.name}</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )) : <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">暂无同章节知识点。</p>}
      </CardContent>
    </Card>
  );
}

function TeachingSuggestionCard({ mastery }: { mastery: number | null }) {
  const suggestions = mastery === null
    ? ["当前没有学生证据，先完成课堂提问或学习事件采集后再判断教学策略。"]
    : mastery < 50
      ? ["先补充基础概念与典型例题，安排短周期检查。", "优先关注受影响学生，避免直接进入综合题。"]
      : mastery < 70
        ? ["增加对比练习和变式题，检查概念边界。", "用课堂快速反馈确认学生是否能迁移知识。"]
        : ["保持当前教学节奏，增加综合应用与迁移任务。"];
  return (
    <Card className="gap-3 border-blue-100 bg-blue-50/35 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-primary" />教学建议</CardTitle></CardHeader>
      <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
        {suggestions.map((suggestion) => <p className="flex gap-2" key={suggestion}><CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />{suggestion}</p>)}
        <p className="text-xs">建议基于真实掌握度规则生成，不冒充后端 AI 分析结果。</p>
      </CardContent>
    </Card>
  );
}

function RelatedContentTab({ context }: { context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]> }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>教材来源</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5">
          {context.sourceDocument ? (
            <Link className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-4 hover:border-blue-200" href={buildResourceHref(context.sourceDocument.id, { from: "point", courseId: context.course.id })}>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{context.sourceDocument.original_name}</span><span className="mt-1 block text-xs text-muted-foreground">{context.chapter.title}</span></span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : <EmptyState description="当前知识点没有关联来源教材。" title="暂无来源" />}
        </CardContent>
      </Card>
      <RelatedPointsCard context={context} />
      <Card className="gap-4 py-5 xl:col-span-2">
        <CardHeader className="px-5"><CardTitle>相关资源与证据</CardTitle></CardHeader>
        <CardContent className="px-5">
          <EmptyState description="后端没有知识点与题库、视频、案例或外部资源的关联接口。" title="暂无更多关联资源" />
        </CardContent>
      </Card>
    </div>
  );
}

function StudentMasteryTab({ context }: { context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]> }) {
  const students = context.analytics?.students ?? [];
  if (!students.length) return <EmptyState description="当前知识点还没有学生掌握证据。" title="暂无学生数据" />;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4"><CardTitle>学生掌握情况</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {students.map((student) => (
          <Link className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40" href={`/students/${student.student_id}?from=knowledge-point&knowledgePointId=${context.point.id}&courseId=${context.course.id}`} key={student.student_id}>
            <span className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-primary">{student.display_name.slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{student.display_name}</span><span className="mt-1 block text-xs text-muted-foreground">掌握度 {Math.round(student.score)}%</span></span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function TeachingSuggestionDetail({ mastery }: { mastery: number | null }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <TeachingSuggestionCard mastery={mastery} />
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>建议执行边界</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
          <p>当前教学策略和执行计划接口未在本阶段实现，建议先作为教师参考，不自动创建任务。</p>
          <p>后续接入教学策略模块后，可将建议转为策略或补充任务。</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalysisTab({
  context,
  mastery,
  affectedStudents,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  mastery: number | null;
  affectedStudents: number;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="gap-4 border-blue-100 bg-blue-50/35 py-5">
        <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />ECHO 当前状态摘要</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-5 text-sm leading-7 text-muted-foreground">
          <p>知识点“{context.point.name}”位于“{context.chapter.title}”。</p>
          <p>{mastery === null ? "当前没有可用于分析的掌握度证据。" : `当前平均掌握度为 ${Math.round(mastery)}%，受影响学生 ${affectedStudents} 人。`}</p>
          <p>趋势、错误模式和习题数据暂未接入，因此不输出无法验证的 AI 结论。</p>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>可用证据入口</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2 px-5">
          {context.sourceDocument ? <Link className={buttonVariants({ variant: "outline" })} href={buildResourceHref(context.sourceDocument.id, { from: "point", courseId: context.course.id })}><BookOpen data-icon="inline-start" />查看来源资源</Link> : null}
          <Link className={buttonVariants({ variant: "outline" })} href={`/students?knowledgePointId=${context.point.id}&courseId=${context.course.id}`}><Users data-icon="inline-start" />查看学生证据</Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EditKnowledgePointDialog({
  context,
  onChanged,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  onChanged: () => void;
}) {
  const { user } = useTeacherSession();
  const [name, setName] = useState(context.point.name);
  const [description, setDescription] = useState(context.point.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" />}><Pencil data-icon="inline-start" />编辑知识点</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑知识点</DialogTitle><DialogDescription>名称和说明会直接保存到当前知识点。</DialogDescription></DialogHeader>
        <div className="flex flex-col gap-3">
          <Input onChange={(event) => setName(event.target.value)} value={name} />
          <Textarea className="min-h-28" onChange={(event) => setDescription(event.target.value)} value={description} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !name.trim()}
            onClick={() => {
              setPending(true);
              setError(null);
              void apiClient.updateKnowledgePoint(user!.id, context.point.id, { name: name.trim(), description: description.trim() || null })
                .then(() => onChanged())
                .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "保存失败"))
                .finally(() => setPending(false));
            }}
            type="button"
          >
            {pending ? "正在保存..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UnavailableCard({ title, description, icon: Icon }: { title: string; description: string; icon: typeof AlertTriangle }) {
  return (
    <Card className="gap-3 border-orange-100 bg-orange-50/35 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-orange-800"><Icon className="size-4" />{title}</CardTitle></CardHeader>
      <CardContent className="px-5 text-sm leading-6 text-orange-800/80">{description}</CardContent>
    </Card>
  );
}

function HeaderMetric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warning" }) {
  return (
    <div className={cn("rounded-lg bg-muted/60 px-4 py-4", tone === "warning" && "bg-orange-50")}>
      <p className={cn("text-xl font-semibold", tone === "warning" && "text-orange-700")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function knowledgePointBreadcrumbs(from: string, courseName: string, chapterTitle: string) {
  if (from === "course") return [{ label: "课程管理", href: "/courses" }, { label: courseName }, { label: chapterTitle }];
  if (from === "dashboard") return [{ label: "总览 Dashboard", href: "/dashboard" }, { label: "知识点详情" }];
  if (from === "student") return [{ label: "学生学情", href: "/students" }, { label: "学生详情" }, { label: "知识点详情" }];
  if (from === "source") return [{ label: "知识库", href: "/knowledge" }, { label: "来源查看" }, { label: "知识点详情" }];
  return [{ label: "知识库", href: "/knowledge" }, { label: "知识点详情" }];
}

export type KnowledgePointPageRecord = KnowledgePoint;
