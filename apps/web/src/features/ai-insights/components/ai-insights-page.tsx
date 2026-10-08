"use client";

import { ArrowRight, BookOpen, ShieldCheck, Sparkles, TriangleAlert, Users, Waypoints, type LucideIcon } from "lucide-react";
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
import { EvidenceSummary, FindingCard } from "@/features/ai-insights/components/ai-insight-sections";
import { AiKnowledgeGraphPreview } from "@/features/ai-insights/components/ai-knowledge-graph-preview";
import { AnalysisEngine, type SecondaryAnalysisState } from "@/features/ai-insights/components/analysis-engine";
import { AnalysisResultPanel } from "@/features/ai-insights/components/analysis-result-panel";
import { EvidenceFlow } from "@/features/ai-insights/components/evidence-flow";
import { FlowBridge } from "@/features/ai-insights/components/flow-bridge";
import {
  useAIAnalysis,
  useAIAnalysisList,
  useAIAnalysisProgress,
  useCreateAIAnalysis,
  useCreateStrategyFromAIAnalysis,
  useReanalyzeAIAnalysis,
} from "@/features/ai-insights/queries";
import {
  applyAIAnalysisToTeachingModel,
  buildAiTeachingModel,
  type AiAnalysisOutcome,
} from "@/features/ai-insights/view-model";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { localizeInsightSummary } from "@/features/dashboard/view-model";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { summarizeKnowledgeBase } from "@/features/knowledge/view-model";
import { useStudentAnalytics } from "@/features/students/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const findingIcons: Record<AiAnalysisOutcome["id"], LucideIcon> = {
  "knowledge-point": TriangleAlert,
  "student-scope": Users,
  "error-pattern": ShieldCheck,
  strategy: Waypoints,
};

function createClientRequestId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomId}`;
}

export function AiInsightsPage({ initialCourseId }: { initialCourseId?: string }) {
  const router = useRouter();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;

  function handleCourseChange(value: string) {
    setSelectedCourseId(value);
    router.replace(`/ai-insights?courseId=${value}`, { scroll: false });
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，AI 教学会围绕当前课程真实学习证据展开。" title="尚未选择课程" />;
  }

  return (
    <AiInsightsWorkspace
      courseId={courseId}
      courses={courses.map((course) => ({ id: course.id, name: course.name }))}
      key={courseId}
      onCourseChange={handleCourseChange}
    />
  );
}

function AiInsightsWorkspace({
  courseId,
  courses,
  onCourseChange,
}: {
  courseId: string;
  courses: Array<{ id: string; name: string }>;
  onCourseChange: (value: string) => void;
}) {
  const router = useRouter();
  const { user } = useTeacherSession();
  const [analysisSelection, setAnalysisSelection] = useState<{ courseId: string; analysisId: string } | null>(null);
  const [strategySelection, setStrategySelection] = useState<{
    courseId: string;
    analysisId: string;
    strategyId: string;
  } | null>(null);
  const dashboard = useTeacherDashboardOverview(user?.id, courseId);
  const students = useStudentAnalytics(courseId);
  const knowledge = useKnowledgeBaseData(courseId);
  const reviewSummary = useReviewSummary(courseId);
  const analysisList = useAIAnalysisList(courseId);
  const analysisItems = analysisList.data?.items ?? [];
  const latestCompletedAnalysisId = analysisItems.find((item) => item.status === "completed")?.id
    ?? analysisItems[0]?.id
    ?? null;
  const selectedAnalysisId = analysisSelection?.courseId === courseId
    && analysisItems.some((item) => item.id === analysisSelection.analysisId)
    ? analysisSelection.analysisId
    : null;
  const activeAnalysisId = selectedAnalysisId ?? latestCompletedAnalysisId;
  const activeAnalysisSummary = analysisItems.find((item) => item.id === activeAnalysisId) ?? null;
  const createAnalysis = useCreateAIAnalysis(courseId);
  const reanalyzeAnalysis = useReanalyzeAIAnalysis(courseId);
  const analysisQuery = useAIAnalysis(courseId, activeAnalysisId);
  const progressQuery = useAIAnalysisProgress(courseId, activeAnalysisId);
  const refetchAnalysis = analysisQuery.refetch;
  const refetchAnalysisList = analysisList.refetch;
  const createStrategy = useCreateStrategyFromAIAnalysis(courseId, activeAnalysisId);
  const analysis = analysisQuery.data ?? null;
  const progress = progressQuery.data ?? analysis?.progress ?? activeAnalysisSummary?.progress ?? null;

  const overview = dashboard.data;
  const resourceSummary = summarizeKnowledgeBase(knowledge.resources);
  const baseModel = useMemo(() => {
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

  const model = useMemo(
    () => (baseModel ? applyAIAnalysisToTeachingModel(baseModel, analysis) : null),
    [analysis, baseModel],
  );

  const analysisPending = createAnalysis.isPending || reanalyzeAnalysis.isPending;
  const pendingAnalysisType = reanalyzeAnalysis.isPending
    ? "secondary"
    : createAnalysis.isPending
      ? "initial"
      : null;
  const analysisStatus = analysisPending
    ? "analyzing"
    : progressQuery.data?.status ?? analysis?.status ?? activeAnalysisSummary?.status ?? null;

  useEffect(() => {
    const status = progressQuery.data?.status;
    if (!status || status === "analyzing") return;
    void refetchAnalysis();
    void refetchAnalysisList();
  }, [progressQuery.data?.status, refetchAnalysis, refetchAnalysisList]);
  const analysisType = pendingAnalysisType ?? analysis?.analysis_type ?? activeAnalysisSummary?.analysis_type ?? null;
  const analysisState: SecondaryAnalysisState = analysisStatus === "analyzing"
    ? "analyzing"
    : analysisStatus === "failed"
      ? "failed"
      : analysisStatus === "completed"
        ? "completed"
        : "idle";
  const analysisError = createAnalysis.error ?? reanalyzeAnalysis.error ?? createStrategy.error ?? analysisQuery.error ?? progressQuery.error;
  const analysisDetailLoading = Boolean(activeAnalysisId) && (
    (analysisQuery.isPending && !analysis)
    || Boolean(progressQuery.data && analysis && analysis.status !== progressQuery.data.status)
  );
  const analysisEvidenceCount = analysis?.evidence.length ?? activeAnalysisSummary?.evidence_count ?? 0;
  const insufficientEvidence = analysis?.result?.insufficient_evidence ?? activeAnalysisSummary?.insufficient_evidence ?? false;
  const createdStrategyId = strategySelection?.courseId === courseId && strategySelection.analysisId === activeAnalysisId
    ? strategySelection.strategyId
    : null;
  const strategyId = analysis?.result?.strategy_id ?? createdStrategyId;
  const reanalyzeSourceId = analysis?.analysis_type === "secondary" ? analysis.previous_analysis_id : null;
  const showReanalyze = Boolean(analysis?.status === "completed" && reanalyzeSourceId);
  const actionLabel = (() => {
    if (analysisStatus === "analyzing") {
      return analysisType === "secondary" ? "正在进一步分析" : "正在开始分析";
    }
    if (analysisStatus === "failed") {
      return analysisType === "secondary" ? "重新进行二次分析" : "重新开始分析";
    }
    if (analysisStatus === "completed") {
      if (analysisType === "initial") return "进一步分析";
      if (strategyId) return "查看教学策略";
      if (insufficientEvidence) return "证据不足，暂不可生成策略";
      return "转为教学策略";
    }
    return "开始分析";
  })();
  const actionPendingLabel =
    reanalyzeAnalysis.isPending || (analysisState === "analyzing" && analysisType === "secondary")
      ? "正在进一步分析..."
      : createAnalysis.isPending || (analysisState === "analyzing" && analysisType === "initial")
        ? "正在开始分析..."
        : createStrategy.isPending
          ? "正在生成教学策略..."
          : "正在分析...";
  const actionDisabled =
    analysisList.isLoading
    || analysisDetailLoading
    || analysisStatus === "analyzing"
    || (analysisStatus === "completed" && analysisType === "secondary" && !strategyId && insufficientEvidence);

  function handleAnalysisAction() {
    if (actionDisabled) return;


    const startInitialAnalysis = () =>
      createAnalysis.mutate(
        {
          scope: "whole_class",
          time_range_days: 28,
          focus: "识别当前课程最需要教师行动的问题",
          async: true,
          client_request_id: createClientRequestId("web-initial"),
        },
        {
          onSuccess: (created) =>
            setAnalysisSelection({ courseId, analysisId: created.id }),
        },
      );

    if (!analysis) {
      startInitialAnalysis();
      return;
    }

    if (analysis.status === "failed") {
      if (analysis.analysis_type === "secondary" && analysis.previous_analysis_id) {
        reanalyzeAnalysis.mutate(
          {
            analysisId: analysis.previous_analysis_id,
            payload: {
              focus: "进一步确认错误原因与影响学生范围",
              time_range_days: 42,
              async: true,
              client_request_id: createClientRequestId("web-secondary"),
            },
          },
          {
            onSuccess: (created) =>
              setAnalysisSelection({ courseId, analysisId: created.id }),
          },
        );
      } else {
        startInitialAnalysis();
      }
      return;
    }

    if (analysis.status === "analyzing") return;

    if (analysis.analysis_type === "initial") {
      reanalyzeAnalysis.mutate(
        {
          analysisId: analysis.id,
          payload: {
            focus: "进一步确认错误原因与影响学生范围",
            time_range_days: 42,
            async: true,
            client_request_id: createClientRequestId("web-secondary"),
          },
        },
        {
          onSuccess: (created) =>
            setAnalysisSelection({ courseId, analysisId: created.id }),
        },
      );
      return;
    }

    if (strategyId) {
      router.push(`/teaching-strategies/${strategyId}`);
      return;
    }

    if (analysis.status === "completed" && !insufficientEvidence) {
      createStrategy.mutate({}, {
        onSuccess: (strategy) =>
          setStrategySelection({
            courseId,
            analysisId: analysis.id,
            strategyId: strategy.id,
          }),
      });
    }
  }

  function handleReanalyze() {
    if (!reanalyzeSourceId || analysisState === "analyzing" || reanalyzeAnalysis.isPending || analysisPending) return;
    reanalyzeAnalysis.mutate(
      {
        analysisId: reanalyzeSourceId,
        payload: {
          focus: "基于最新学习证据重新确认原因、影响范围和教学建议",
          time_range_days: 42,
          async: true,
          client_request_id: createClientRequestId("web-reanalyze"),
        },
      },
      {
        onSuccess: (created) =>
          setAnalysisSelection({ courseId, analysisId: created.id }),
      },
    );
  }

  if (dashboard.isLoading || students.isLoading || knowledge.isLoading || reviewSummary.isLoading || analysisList.isLoading) {
    return <LoadingState label="正在准备 AI 教学证据..." />;
  }
  if (dashboard.isError || students.isError || knowledge.isError || reviewSummary.isError || analysisList.isError) {
    return (
      <ErrorState
        description="AI 教学证据加载失败，请确认后端服务后重试。"
        onRetry={() => {
          void dashboard.refetch();
          students.refetch();
          knowledge.refetch();
          void reviewSummary.refetch();
          void analysisList.refetch();
        }}
      />
    );
  }
  if (!overview || !model) {
    return <EmptyState description="当前课程还没有可用于 AI 教学的证据。" title="暂无分析证据" />;
  }

  const statusTone = analysisState === "analyzing"
    ? "info"
    : analysisState === "failed"
      ? "danger"
      : analysisState === "completed"
        ? "success"
        : "neutral";
  const statusLabel = analysisState === "analyzing"
    ? analysisType === "secondary" ? "二次分析进行中" : "初次分析进行中"
    : analysisState === "failed"
      ? analysisType === "secondary" ? "二次分析失败" : "初次分析失败"
      : analysisState === "completed"
        ? analysisType === "secondary" ? "二次分析结果" : "初次分析结果"
        : "等待首次分析";
  const riskCount = overview.stats.attention_knowledge_point_count;
  const affectedStudentCount = analysis?.result?.affected_student_ids.length ?? 0;
  const analysisSummary = analysisEvidenceCount > 0
    ? insufficientEvidence
      ? `本次分析基于 ${analysisEvidenceCount} 条学习证据，当前结论仍标记为证据不足；课程有 ${riskCount} 个待关注知识点。`
      : `本次分析基于 ${analysisEvidenceCount} 条学习证据；当前课程有 ${riskCount} 个待关注知识点，分析涉及 ${affectedStudentCount} 名学生。`
    : `当前课程有 ${riskCount} 个待关注知识点、${overview.stats.student_count} 名学生；尚未形成持久化分析证据。`;
  const [primaryFinding, ...supportingFindings] = model.outcomes;

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
              onValueChange={(value) => value && onCourseChange(value)}
              value={courseId}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
        }
        breadcrumbs={[{ label: "AI 教学" }]}
        description="基于当前课程的学习证据，定位高风险知识点、解释原因并生成可执行教学建议。"
        title="AI 教学洞察"
      />

      <section aria-label="本次分析摘要" className="rounded-xl border-2 border-blue-100 bg-gradient-to-br from-white via-blue-50/55 to-cyan-50/45 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />分析摘要</p>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#314761]">{analysisSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            <StatusBadge tone="neutral">
              {analysisEvidenceCount > 0
                ? `${analysisEvidenceCount} 条持久化证据`
                : analysisStatus === "analyzing" ? "正在收集证据" : "等待证据分析"}
            </StatusBadge>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-blue-100 pt-3 text-xs text-muted-foreground">
          <span>重点知识点 <strong className="font-semibold text-foreground">{riskCount}</strong></span>
          <span>影响学生 <strong className="font-semibold text-foreground">{affectedStudentCount}</strong></span>
          <span>课程学生 <strong className="font-semibold text-foreground">{overview.stats.student_count}</strong></span>
        </div>
      </section>

      <section aria-labelledby="ai-findings-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground" id="ai-findings-title">关键发现</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">先看最需要处理的问题，再进入推理链和证据回查。</p>
          </div>
          <span className="text-xs text-muted-foreground">只展示当前可追溯到真实学习证据的内容</span>
        </div>
        {primaryFinding ? (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <div className="md:col-span-3 xl:col-span-2">
              <FindingCard icon={findingIcons[primaryFinding.id]} outcome={primaryFinding} prominent />
            </div>
            {supportingFindings.slice(0, 3).map((outcome) => (
              <FindingCard icon={findingIcons[outcome.id]} key={outcome.id} outcome={outcome} />
            ))}
          </div>
        ) : <EmptyState description="当前没有可展示的分析结论。" title="暂无关键发现" />}
      </section>

      <section aria-label="AI 推理与知识图谱预览" className="relative overflow-hidden rounded-xl border-2 border-blue-100 bg-gradient-to-br from-white via-blue-50/45 to-cyan-50/35 px-3 py-4 xl:px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />AI 推理核心与证据链路</p>
            <p className="mt-1 text-xs text-muted-foreground">证据摘要先进入推理核心，再承接课程知识图谱。</p>
          </div>
          <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
        </div>
        <div className="relative grid gap-3 xl:grid-cols-[minmax(220px,0.72fr)_32px_minmax(360px,1.08fr)_32px_minmax(240px,0.82fr)] xl:items-stretch" data-ai-workspace-anchor="true">
          <EvidenceSummary analyzing={analysisState === "analyzing"} nodes={model.evidenceNodes} />
          <FlowBridge direction="forward" state={analysisState} />
          <AnalysisEngine
            actionDisabled={actionDisabled}
            actionLabel={actionLabel}
            actionPendingLabel={actionPendingLabel}
            actionPending={analysisPending || createStrategy.isPending}
            affectedStudentCount={affectedStudentCount}
            evidenceCount={analysisEvidenceCount}
            modelName={analysis?.result?.model_name}
            onAction={handleAnalysisAction}
            onReanalyze={showReanalyze ? handleReanalyze : undefined}
            progress={progress}
            reanalyzePending={reanalyzeAnalysis.isPending}
            state={analysisState}
          />
          <FlowBridge direction="forward" state={analysisState} />
          <AiKnowledgeGraphPreview analysis={analysis} attentionCount={riskCount} chapters={knowledge.chapters} courseId={courseId} fallbackDifficulty={model.topDifficulty} />
        </div>
        {analysisError || analysis?.error_message ? (
          <p className="mt-3 rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {analysis?.error_message ?? (analysisError instanceof Error ? analysisError.message : "AI 分析操作失败。")}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ai-results-title" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground" id="ai-results-title">分析结果与依据</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">发现的问题、证据依据、原因和下一步行动集中在这里，长文本不截断事实含义。</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] xl:items-start">
          <AnalysisResultPanel analyzing={analysisState === "analyzing"} outcomes={model.outcomes} />
          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle>证据依据</CardTitle>
              <p className="text-xs leading-5 text-muted-foreground">每条依据都可以回到学生、资源或分析记录。</p>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
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
        </div>
      </section>

      <section aria-labelledby="ai-evidence-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground" id="ai-evidence-title">完整证据回查</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">展开每类证据，回到原始学生、资源或审核记录。</p>
          </div>
          <StatusBadge tone="neutral">{analysisEvidenceCount > 0 ? `${analysisEvidenceCount} 条可回查证据` : "等待证据入库"}</StatusBadge>
        </div>
        <EvidenceFlow analyzing={analysisState === "analyzing"} nodes={model.evidenceNodes} />
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
