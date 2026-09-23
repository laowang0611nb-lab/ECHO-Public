"use client";

import { ArrowRight, BookOpen, ShieldCheck, Sparkles, Users, Waypoints } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReviewSummary } from "@/features/ai-review/queries";
import { AnalysisConnectors } from "@/features/ai-insights/components/analysis-connectors";
import { AnalysisEngine, type SecondaryAnalysisState } from "@/features/ai-insights/components/analysis-engine";
import { AnalysisResultPanel } from "@/features/ai-insights/components/analysis-result-panel";
import { EvidenceFlow } from "@/features/ai-insights/components/evidence-flow";
import { buildAiTeachingModel, type AiTeachingTone } from "@/features/ai-insights/view-model";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { localizeInsightSummary } from "@/features/dashboard/view-model";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { summarizeKnowledgeBase } from "@/features/knowledge/view-model";
import { useStudentAnalytics } from "@/features/students/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

const ANALYSIS_PHASE_COUNT = 5;

const focusToneClasses: Record<AiTeachingTone, string> = {
  blue: "border-blue-200 bg-blue-50/45",
  emerald: "border-emerald-200 bg-emerald-50/45",
  amber: "border-amber-200 bg-amber-50/55",
  rose: "border-rose-200 bg-rose-50/45",
  violet: "border-violet-200 bg-violet-50/45",
  neutral: "border-border bg-muted/25",
};

export function AiInsightsPage({ initialCourseId }: { initialCourseId?: string }) {
  const router = useRouter();
  const { user } = useTeacherSession();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const dashboard = useTeacherDashboardOverview(user?.id, courseId);
  const students = useStudentAnalytics(courseId);
  const knowledge = useKnowledgeBaseData(courseId);
  const reviewSummary = useReviewSummary(courseId);
  const [analysisState, setAnalysisState] = useState<SecondaryAnalysisState>("completed");
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (analysisState !== "analyzing") return;
    const timer = window.setTimeout(() => {
      if (phaseIndex >= ANALYSIS_PHASE_COUNT - 1) {
        setAnalysisState("completed");
        return;
      }
      setPhaseIndex((current) => current + 1);
    }, 680);
    return () => window.clearTimeout(timer);
  }, [analysisState, phaseIndex]);

  const overview = dashboard.data;
  const resourceSummary = summarizeKnowledgeBase(knowledge.resources);
  const model = useMemo(() => {
    if (!courseId || !overview) return null;
    return buildAiTeachingModel({
      courseId,
      overview,
      students: students.items,
      reviewSummary: reviewSummary.data ?? null,
      readyResources: resourceSummary.ready,
      totalResources: resourceSummary.total,
      pendingResources: resourceSummary.pending + resourceSummary.processing,
      failedResources: resourceSummary.failed,
    });
  }, [courseId, overview, resourceSummary.failed, resourceSummary.pending, resourceSummary.processing, resourceSummary.ready, resourceSummary.total, reviewSummary.data, students.items]);

  function handleCourseChange(value: string) {
    setSelectedCourseId(value);
    router.replace(`/ai-insights?courseId=${value}`, { scroll: false });
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，AI 教学会围绕当前课程真实学习证据展开。" title="尚未选择课程" />;
  }
  if (dashboard.isLoading || students.isLoading || knowledge.isLoading || reviewSummary.isLoading) {
    return <LoadingState label="正在准备 AI 教学证据..." />;
  }
  if (dashboard.isError || students.isError || knowledge.isError || reviewSummary.isError) {
    return (
      <ErrorState
        description="AI 教学证据加载失败，请确认后端服务后重试。"
        onRetry={() => {
          void dashboard.refetch();
          students.refetch();
          knowledge.refetch();
          void reviewSummary.refetch();
        }}
      />
    );
  }
  if (!overview || !model) {
    return <EmptyState description="当前课程还没有可用于 AI 教学的证据。" title="暂无分析证据" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className={buttonVariants({ variant: "outline" })} href={`/teaching-strategies?courseId=${courseId}`}>
              <Waypoints data-icon="inline-start" />教学策略
            </Link>
            <Select
              items={courses.map((course) => ({ value: course.id, label: course.name }))}
              onValueChange={(value) => value && handleCourseChange(value)}
              value={courseId}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
        }
        breadcrumbs={[{ label: "AI 教学" }]}
        description="ECHO 在已有学习分析上继续追问原因、影响和下一步行动。"
        title="AI 教学主页"
      />

      <section className="relative overflow-hidden rounded-xl border-2 border-blue-100 bg-gradient-to-br from-white via-blue-50/55 to-cyan-50/45 px-4 py-5 xl:px-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />AI 二次分析工作台</p>
            <p className="mt-1 text-xs text-muted-foreground">证据 → 初次分析 → 进一步分析 → 原因 → 建议 → 行动</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={analysisState === "analyzing" ? "info" : "success"}>
              {analysisState === "analyzing" ? "二次分析进行中" : "当前分析结果"}
            </StatusBadge>
            <StatusBadge tone="neutral">{`基于 ${model.evidenceNodes.length} 类证据`}</StatusBadge>
          </div>
        </div>
        <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.76fr)_minmax(0,1fr)] xl:items-stretch">
          <AnalysisConnectors analyzing={analysisState === "analyzing"} />
          <EvidenceFlow analyzing={analysisState === "analyzing"} nodes={model.evidenceNodes} />
          <AnalysisEngine
            onAnalyze={() => {
              setPhaseIndex(0);
              setAnalysisState("analyzing");
            }}
            phaseIndex={phaseIndex}
            state={analysisState}
          />
          <AnalysisResultPanel analyzing={analysisState === "analyzing"} outcomes={model.outcomes} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>当前关注</CardTitle>
            <p className="text-xs text-muted-foreground">只展示当前可以追溯到真实学习证据的事项。</p>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 md:grid-cols-2">
            {model.focusItems.length ? model.focusItems.slice(0, 4).map((item) => (
              <Link className={cn("rounded-lg border-2 px-4 py-4 transition-colors hover:border-primary/35", focusToneClasses[item.tone])} href={item.href} key={item.id}>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                <p className="mt-3 text-xs font-medium">{item.evidence}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">查看依据 <ArrowRight className="size-3.5" /></span>
              </Link>
            )) : <div className="md:col-span-2"><EmptyState description="当前没有达到风险阈值的事项。" title="暂无需要关注的问题" /></div>}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>为什么得到这个结论</CardTitle>
            <p className="text-xs text-muted-foreground">每条结论都可以回查证据来源，不生成无依据推断。</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            {model.evidenceReasons.map((reason) => (
              <Link className="flex items-start justify-between gap-4 rounded-lg border-2 border-border px-3.5 py-3 transition-colors hover:border-primary/35" href={reason.href} key={reason.id}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{reason.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.description}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primary">{reason.value}</span>
              </Link>
            ))}
            <div className="rounded-lg border-2 border-border bg-muted/25 px-3.5 py-3">
              <p className="text-xs font-semibold text-muted-foreground">当前后端洞察</p>
              <p className="mt-2 text-sm leading-6">{localizeInsightSummary(overview.insight.summary)}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">生成时间 {overview.insight.generated_at.slice(0, 16).replace("T", " ")}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <EntryCard
          description="从学生、知识点、LearningEvent 和长期掌握状态继续下钻。"
          href={`/students?courseId=${courseId}&tab=students`}
          icon={Users}
          title="查看完整学习分析"
        />
        <EntryCard
          description="结合引用、完整对话与风险原因判断 AI 回答是否可靠。"
          href={`/ai-review?courseId=${courseId}&status=open`}
          icon={ShieldCheck}
          title="进入 AI 回答审核"
        />
        <EntryCard
          description="把分析结果带入正式策略，由教师采纳、调整并发布执行。"
          href={`/teaching-strategies?courseId=${courseId}`}
          icon={Waypoints}
          title="生成教学行动"
        />
      </section>
    </div>
  );
}

function EntryCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link className="group rounded-xl border-2 border-border bg-card px-5 py-4 transition-colors hover:border-primary/35" href={href}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="size-5" /></span>
      <p className="mt-4 text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">进入 <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
