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
  TrendingUp,
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
import { useExternalResources, useKnowledgePointData, useKnowledgePointErrorPatterns, useKnowledgePointMasteryTrend, useQuestionItems, useSourceEvidence } from "@/features/knowledge/queries";
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
  reviewId,
  conversationId,
  messageId,
  studentId,
}: {
  pointId: string;
  initialTab: KnowledgePointTab;
  from: string;
  courseId?: string;
  resourceId?: string;
  reviewId?: string;
  conversationId?: string;
  messageId?: string;
  studentId?: string;
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
  const masteryTrendQuery = useKnowledgePointMasteryTrend(courseId || null, pointId);
  const errorPatternsQuery = useKnowledgePointErrorPatterns(courseId || null, pointId);
  const questionItemsQuery = useQuestionItems(courseId || null, pointId);
  const externalResourcesQuery = useExternalResources(courseId || null, pointId);

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as KnowledgePointTab) : "overview";
    setActiveTab(next);
    const params = new URLSearchParams();
    params.set("from", from);
    if (courseId) params.set("courseId", courseId);
    if (resourceId) params.set("resourceId", resourceId);
    if (reviewId) params.set("reviewId", reviewId);
    if (conversationId) params.set("conversationId", conversationId);
    if (messageId) params.set("messageId", messageId);
    if (studentId) params.set("studentId", studentId);
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

  const breadcrumbs = knowledgePointBreadcrumbs({ from, courseId, courseName: context.course.name, chapterTitle: context.chapter.title, conversationId, messageId, reviewId, studentId });
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
        <TabsList className="grid h-auto w-full grid-cols-3 justify-start rounded-none border-b border-border px-0 sm:grid-cols-6" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <div className="space-y-4">
                <KnowledgeDescription context={context} />
                <TextbookLocation
                  context={context}
                  conversationId={conversationId}
                  evidence={evidence.evidence}
                  evidenceLoading={evidence.isLoading}
                  evidenceError={evidence.isError}
                  messageId={messageId}
                  reviewId={reviewId}
                />
                <StudentMasteryCard context={context} />
                <MasteryTrendCard query={masteryTrendQuery} />
                <ErrorPatternsCard query={errorPatternsQuery} />
              </div>
              <aside className="space-y-4">
                <RelatedPointsCard context={context} />
                <QuestionItemsSummaryCard query={questionItemsQuery} />
                <TeachingSuggestionCard mastery={mastery} />
              </aside>
            </div>
          ) : null}
          {activeTab === "related" ? <RelatedContentTab context={context} externalResourcesQuery={externalResourcesQuery} questionItemsQuery={questionItemsQuery} /> : null}
          {activeTab === "students" ? <StudentMasteryTab context={context} /> : null}
          {activeTab === "exercises" ? <QuestionItemsPanel query={questionItemsQuery} /> : null}
          {activeTab === "suggestions" ? <TeachingSuggestionDetail courseId={courseId} knowledgePointId={pointId} mastery={mastery} /> : null}
          {activeTab === "analysis" ? <AnalysisTab affectedStudents={affectedStudents} context={context} mastery={mastery} /> : null}
        </TabsContent>
      </Tabs>

      <nav className="flex items-center justify-between gap-3 border-t border-border pt-5">
        {context.previousPoint ? (
          <Link className={buttonVariants({ variant: "outline" })} href={buildPointHref(context.previousPoint.id, { from, courseId, resourceId, reviewId, conversationId, messageId, studentId })}>
            <ArrowLeft data-icon="inline-start" />上一个知识点
          </Link>
        ) : <span />}
        {context.nextPoint ? (
          <Link className={buttonVariants({ variant: "outline" })} href={buildPointHref(context.nextPoint.id, { from, courseId, resourceId, reviewId, conversationId, messageId, studentId })}>
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
  reviewId,
  conversationId,
  messageId,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  evidence: { page_start: number; page_end: number; content: string; chunk_id: string } | null;
  evidenceLoading: boolean;
  evidenceError: boolean;
  reviewId?: string;
  conversationId?: string;
  messageId?: string;
}) {
  const page = evidence?.page_start;
  const sourceHref = context.sourceDocument
    ? buildSourceHref(context.sourceDocument.id, {
        from: "point",
        courseId: context.course.id,
        knowledgePointId: context.point.id,
        page,
        chunkId: evidence?.chunk_id,
        reviewId,
        conversationId,
        messageId,
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
        <div className="space-y-4">
          <InfoLine label="受影响学生" value={`${analytics?.affected_students ?? 0} 人`} />
          <InfoLine label="已有学生证据" value={`${analytics?.students.length ?? 0} 人`} />
          <Progress value={mastery ?? 0} />
          <MasteryDistribution students={analytics?.students ?? []} />
        </div>
      </CardContent>
    </Card>
  );
}


function MasteryDistribution({ students }: { students: Array<{ score: number }> }) {
  const buckets = [
    { label: "掌握良好", min: 80, max: 101, tone: "bg-primary" },
    { label: "基本掌握", min: 65, max: 80, tone: "bg-emerald-500" },
    { label: "需要加强", min: 50, max: 65, tone: "bg-orange-400" },
    { label: "重点关注", min: 0, max: 50, tone: "bg-rose-300" },
  ].map((bucket) => ({
    ...bucket,
    count: students.filter((student) => student.score >= bucket.min && student.score < bucket.max).length,
  }));
  const total = students.length;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
      <p className="text-xs leading-5 text-muted-foreground">按真实学生掌握分数分为四档，阈值与全局学生学情保持一致；没有学生证据时不生成虚假分布。</p>
      {total ? buckets.map((bucket) => (
        <div className="space-y-1.5" key={bucket.label}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{bucket.label}</span>
            <span className="font-medium tabular-nums">{bucket.count} 人</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={bucket.tone} style={{ width: `${(bucket.count / total) * 100}%`, height: "100%" }} />
          </div>
        </div>
      )) : <p className="py-3 text-center text-xs text-muted-foreground">暂无学生证据，无法形成分布。</p>}
    </div>
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

function RelatedContentTab({
  context,
  questionItemsQuery,
  externalResourcesQuery,
}: {
  context: NonNullable<ReturnType<typeof useKnowledgePointData>["context"]>;
  questionItemsQuery: ReturnType<typeof useQuestionItems>;
  externalResourcesQuery: ReturnType<typeof useExternalResources>;
}) {
  const questions = questionItemsQuery.data?.items ?? [];
  const externalResources = externalResourcesQuery.data?.items ?? [];
  const loading = questionItemsQuery.isLoading || externalResourcesQuery.isLoading;
  const hasError = questionItemsQuery.isError || externalResourcesQuery.isError;

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
        <CardHeader className="px-5"><CardTitle>相关资源与证据</CardTitle><p className="mt-1 text-xs text-muted-foreground">来自当前知识点关联的习题和外部资源接口。</p></CardHeader>
        <CardContent className="space-y-5 px-5">
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">正在加载关联内容...</p> : null}
          {hasError ? <ErrorState description="关联习题或外部资源加载失败。" onRetry={() => { void questionItemsQuery.refetch(); void externalResourcesQuery.refetch(); }} /> : null}
          {!loading && !hasError && !questions.length && !externalResources.length ? (
            <EmptyState description="当前没有关联习题或外部资源，可由教师继续补充。" title="暂无更多关联资源" />
          ) : null}

          {questions.length ? (
            <section>
              <h3 className="text-sm font-semibold">关联习题</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {questions.slice(0, 6).map((item) => (
                  <div className="rounded-lg border-2 border-border px-4 py-3" key={item.id}>
                    <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{item.title}</p><StatusBadge tone="info">{questionTypeLabel(item.type)}</StatusBadge></div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.content}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{questionDifficultyLabel(item.difficulty)}{item.source_page ? ` · 来源第 ${item.source_page} 页` : ""}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {externalResources.length ? (
            <section>
              <h3 className="text-sm font-semibold">外部资源</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {externalResources.slice(0, 6).map((item) => (
                  <div className="flex items-start justify-between gap-4 rounded-lg border-2 border-border px-4 py-3" key={item.id}>
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.provider || "外部来源"}{item.description ? ` · ${item.description}` : ""}</p></div>
                    <a className={buttonVariants({ size: "sm", variant: "outline" })} href={item.url} rel="noreferrer" target="_blank"><ExternalLink data-icon="inline-start" />打开</a>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
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

function TeachingSuggestionDetail({ mastery, courseId, knowledgePointId }: { mastery: number | null; courseId: string; knowledgePointId: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <TeachingSuggestionCard mastery={mastery} />
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>建议执行边界</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
          <p>教学建议只作为教师判断依据；正式执行必须先生成并采纳教学策略，再创建教学执行计划。</p>
          <p>系统不会根据当前建议自动创建任务或向学生发布内容。</p>
          {courseId ? <Link className={buttonVariants({ variant: "outline" })} href={`/teaching-strategies?courseId=${courseId}&knowledgePointId=${knowledgePointId}`}><Sparkles data-icon="inline-start" />生成教学策略</Link> : null}
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
          <p>掌握趋势、错误模式和关联习题均来自真实接口；该页只汇总当前可追溯证据，不生成无法验证的因果结论。</p>
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

function MasteryTrendCard({ query }: { query: ReturnType<typeof useKnowledgePointMasteryTrend> }) {
  if (query.isLoading) return <Card className="gap-3 py-5"><CardContent className="px-5 text-sm text-muted-foreground">正在加载掌握趋势...</CardContent></Card>;
  if (query.isError) return <ErrorState description="掌握趋势加载失败。" onRetry={() => void query.refetch()} />;
  const points = query.data?.points.filter((point) => point.average_mastery !== null) ?? [];
  if (!points.length) {
    return <UnavailableCard description="当前时间窗口没有可追溯的掌握快照，暂不生成趋势线。" icon={AlertTriangle} title="暂无掌握趋势" />;
  }
  const width = 640;
  const height = 180;
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : (index / (points.length - 1)) * width,
    y: height - ((point.average_mastery ?? 0) / 100) * (height - 24) - 12,
  }));
  const latest = chartPoints.at(-1)!;
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5">
        <div><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4 text-primary" />掌握趋势</CardTitle><p className="mt-1 text-xs text-muted-foreground">近 {query.data?.range.days} 天真实快照，无快照日期不插值。</p></div>
        <StatusBadge tone="info">{`最新 ${Math.round(latest.average_mastery ?? 0)}%`}</StatusBadge>
      </CardHeader>
      <CardContent className="px-5">
        <div className="overflow-x-auto rounded-lg border border-border bg-muted/20 p-3">
          <svg className="h-48 min-w-[640px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="知识点掌握趋势">
            {[0, 25, 50, 75, 100].map((value) => <line key={value} stroke="#D5DFEC" strokeDasharray="4 5" strokeWidth="1" x1="0" x2={width} y1={height - (value / 100) * (height - 24) - 12} y2={height - (value / 100) * (height - 24) - 12} />)}
            <polyline fill="none" points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")} stroke="#2F7CF6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {chartPoints.map((point) => <circle cx={point.x} cy={point.y} fill="#FFFFFF" key={point.date} r="4" stroke="#2F7CF6" strokeWidth="2"><title>{point.date}: {Math.round(point.average_mastery ?? 0)}%</title></circle>)}
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{query.data?.range.start_date}</span><span>证据点 {points.reduce((sum, point) => sum + point.evidence_count, 0)}</span><span>{query.data?.range.end_date}</span></div>
      </CardContent>
    </Card>
  );
}

function ErrorPatternsCard({ query }: { query: ReturnType<typeof useKnowledgePointErrorPatterns> }) {
  if (query.isLoading) return <Card className="gap-3 py-5"><CardContent className="px-5 text-sm text-muted-foreground">正在分析常见错误...</CardContent></Card>;
  if (query.isError) return <ErrorState description="常见错误分析加载失败。" onRetry={() => void query.refetch()} />;
  const patterns = query.data?.patterns ?? [];
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><CircleHelp className="size-4 text-orange-500" />常见错误</CardTitle><p className="text-xs text-muted-foreground">来自近 {query.data?.window_days ?? 30} 天真实 LearningEvent 的错误模式。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        {patterns.length ? patterns.map((pattern) => (
          <div className="rounded-lg border border-border px-4 py-3" key={pattern.code}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{pattern.label}</p><StatusBadge tone={pattern.trend === "up" ? "danger" : pattern.trend === "down" ? "success" : "neutral"}>{patternTrendLabel(pattern.trend)}</StatusBadge></div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{pattern.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{pattern.occurrence_count} 次 · {pattern.affected_students} 名学生 · {pattern.sample_evidence_ids.length} 条样本证据</p>
          </div>
        )) : <p className="py-8 text-center text-sm text-muted-foreground">当前时间窗口没有重复错误模式。</p>}
      </CardContent>
    </Card>
  );
}

function QuestionItemsSummaryCard({ query }: { query: ReturnType<typeof useQuestionItems> }) {
  const items = query.data?.items ?? [];
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><FileQuestion className="size-4 text-primary" />相关习题</CardTitle><p className="text-xs text-muted-foreground">来自真实题库关联。</p></CardHeader>
      <CardContent className="space-y-2 px-5">
        {items.length ? items.slice(0, 3).map((item) => <div className="rounded-lg border border-border px-3 py-3" key={item.id}><p className="truncate text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{questionTypeLabel(item.type)} · {questionDifficultyLabel(item.difficulty)}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">当前知识点还没有关联习题。</p>}
        {items.length > 3 ? <p className="text-center text-xs text-muted-foreground">另有 {items.length - 3} 道题</p> : null}
      </CardContent>
    </Card>
  );
}

function QuestionItemsPanel({ query }: { query: ReturnType<typeof useQuestionItems> }) {
  if (query.isLoading) return <LoadingState label="正在加载相关习题..." />;
  if (query.isError) return <ErrorState description="相关习题加载失败。" onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (!items.length) return <EmptyState description="当前知识点还没有关联题目。" title="暂无相关习题" />;
  return <div className="grid gap-3">{items.map((item) => <Card className="gap-3 py-5" key={item.id}><CardHeader className="px-5"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{item.title}</CardTitle><div className="flex gap-2"><StatusBadge tone="info">{questionTypeLabel(item.type)}</StatusBadge><StatusBadge tone={item.difficulty === "hard" ? "danger" : item.difficulty === "medium" ? "warning" : "success"}>{questionDifficultyLabel(item.difficulty)}</StatusBadge></div></div></CardHeader><CardContent className="space-y-3 px-5 text-sm leading-6"><p className="whitespace-pre-wrap">{item.content}</p>{item.answer ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">答案：{item.answer}</p> : null}{item.explanation ? <p className="text-muted-foreground">解析：{item.explanation}</p> : null}{item.source_page ? <p className="text-xs text-muted-foreground">来源页码：第 {item.source_page} 页</p> : null}</CardContent></Card>)}</div>;
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
    <Card className="gap-3 border-dashed bg-muted/20 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5"><CardTitle className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" />{title}</CardTitle><StatusBadge tone="neutral">暂无证据</StatusBadge></CardHeader>
      <CardContent className="px-5 text-sm leading-6 text-muted-foreground">{description}</CardContent>
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

function patternTrendLabel(trend: "up" | "stable" | "down" | "unknown") {
  if (trend === "up") return "上升";
  if (trend === "down") return "下降";
  if (trend === "stable") return "稳定";
  return "未知";
}

function questionTypeLabel(type: string) {
  const labels: Record<string, string> = { single_choice: "单选", multiple_choice: "多选", true_false: "判断", short_answer: "简答", coding: "编程", experiment: "实验" };
  return labels[type] ?? type;
}

function questionDifficultyLabel(difficulty: string) {
  const labels: Record<string, string> = { easy: "基础", medium: "中等", hard: "困难" };
  return labels[difficulty] ?? difficulty;
}

function knowledgePointBreadcrumbs({
  from,
  courseId,
  courseName,
  chapterTitle,
  conversationId,
  messageId,
  reviewId,
  studentId,
}: {
  from: string;
  courseId: string;
  courseName: string;
  chapterTitle: string;
  conversationId?: string;
  messageId?: string;
  reviewId?: string;
  studentId?: string;
}) {
  if (from === "course") return [{ label: "课程管理", href: "/courses" }, { label: courseName }, { label: chapterTitle }];
  if (from === "dashboard") return [{ label: "总览 Dashboard", href: "/dashboard" }, { label: "知识点详情" }];
  if (from === "student") return [{ label: "学生学情", href: "/students" }, { label: "学生详情" }, { label: "知识点详情" }];
  if (from === "source") return [{ label: "知识库", href: "/knowledge" }, { label: "来源查看" }, { label: "知识点详情" }];
  if (from === "review" || from === "ai-review") {
    const reviewHref = reviewId ? `/ai-review/pending?reviewId=${reviewId}&courseId=${courseId}` : "/ai-review";
    return [{ label: "AI 回答审核", href: "/ai-review" }, { label: "审核工作台", href: reviewHref }, { label: "知识点详情" }];
  }
  if (from === "conversation" && studentId && conversationId) {
    const conversationHref = `/students/${studentId}/conversations/${conversationId}?from=conversation&courseId=${courseId}${messageId ? `&messageId=${messageId}` : ""}`;
    return [{ label: "学生学情", href: "/students" }, { label: "完整对话", href: conversationHref }, { label: "知识点详情" }];
  }
  return [{ label: "知识库", href: "/knowledge" }, { label: "知识点详情" }];
}

export type KnowledgePointPageRecord = KnowledgePoint;
