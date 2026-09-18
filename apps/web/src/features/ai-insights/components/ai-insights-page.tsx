"use client";

import type { ReviewFlagSummary, ReviewReason } from "@echo/shared-types";
import { AlertTriangle, ArrowRight, BookOpen, BrainCircuit, FileWarning, Layers3, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReviewSummary } from "@/features/ai-review/queries";
import { reviewReasonLabels } from "@/features/ai-review/view-model";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { summarizeKnowledgeBase } from "@/features/knowledge/view-model";
import { useStudentAnalytics } from "@/features/students/queries";
import { eventLabel } from "@/features/students/view-model";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

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

  const overview = dashboard.data;
  const resourceSummary = summarizeKnowledgeBase(knowledge.resources);
  const derived = useMemo(() => buildInsightData({
    students: students.items,
    reviewSummary: reviewSummary.data ?? null,
    learningDifficulties: overview?.learning_difficulties ?? [],
    chapterMastery: overview?.chapter_mastery ?? [],
  }), [overview?.chapter_mastery, overview?.learning_difficulties, reviewSummary.data, students.items]);

  function handleCourseChange(value: string) {
    setSelectedCourseId(value);
    router.replace(`/ai-insights?courseId=${value}`, { scroll: false });
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，AI 教学洞察会围绕当前课程真实数据生成。" title="尚未选择课程" />;
  }
  if (dashboard.isLoading || students.isLoading || knowledge.isLoading || reviewSummary.isLoading) {
    return <LoadingState label="正在汇总课程教学洞察..." />;
  }
  if (dashboard.isError || students.isError || knowledge.isError || reviewSummary.isError) {
    return <ErrorState description="教学洞察数据加载失败，请确认后端服务后重试。" onRetry={() => { void dashboard.refetch(); students.refetch(); knowledge.refetch(); void reviewSummary.refetch(); }} />;
  }
  if (!overview) return <EmptyState description="当前课程还没有可用于生成洞察的数据。" title="暂无教学洞察" />;

  const topDifficulty = derived.difficulties[0] ?? null;
  const inactiveStudents = students.items.filter((item) => !item.activeRecently);
  const pendingReviews = reviewSummary.data?.pending ?? 0;
  const highRiskReviews = reviewSummary.data?.high_risk ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className={buttonVariants({ variant: "outline" })} href={`/teaching-strategies?courseId=${courseId}`}>查看教学策略</Link>
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
        breadcrumbs={[{ label: "AI 教学" }, { label: "AI 教学洞察" }]}
        description="把课程学习证据、学生状态、教材覆盖和 AI 回答风险汇总为可追溯的教学判断。"
        title="AI 教学洞察"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="活跃学生" supporting={`共 ${overview.stats.student_count} 名学生`} value={overview.stats.active_student_count} />
        <StatCard icon={BrainCircuit} label="平均掌握度" suffix="%" supporting="有证据知识点的平均值" value={overview.stats.average_mastery} />
        <StatCard icon={AlertTriangle} label="待关注知识点" supporting="后端风险阈值统计" tone="warning" value={overview.stats.attention_knowledge_point_count} />
        <StatCard icon={FileWarning} label="待审核回答" supporting={`其中高风险 ${highRiskReviews} 条`} tone="warning" value={pendingReviews} />
      </section>

      <Card className="gap-4 border-blue-100 bg-blue-50/35 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2"><BrainCircuit className="size-4 text-primary" />ECHO 教学洞察</CardTitle>
          <p className="text-xs text-muted-foreground">结论、证据、影响范围和下一步入口分开呈现；风险等级来自后端聚合结果。</p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 xl:grid-cols-2">
          {topDifficulty ? (
            <InsightCard
              actionHref={`/knowledge/points/${topDifficulty.knowledge_point_id}?from=insights&courseId=${courseId}`}
              actionLabel="查看知识点详情"
              evidence={`${topDifficulty.affected_students} 名学生受影响，平均掌握度 ${Math.round(topDifficulty.average_score)}%`}
              title={`${topDifficulty.name} 是当前主要薄弱知识点`}
            />
          ) : null}
          {pendingReviews ? (
            <InsightCard
              actionHref={`/ai-review?courseId=${courseId}&status=open${highRiskReviews ? "&severity=high" : ""}`}
              actionLabel="进入 AI 回答审核"
              evidence={`${pendingReviews} 条待审核，${highRiskReviews} 条高风险回答`}
              title="当前存在需要教师判断的 AI 回答"
            />
          ) : null}
          {inactiveStudents.length ? (
            <InsightCard
              actionHref={`/students?courseId=${courseId}&tab=students&activity=inactive`}
              actionLabel="查看低活跃学生"
              evidence={`${inactiveStudents.length} 名学生最近 7 天没有学习证据`}
              title="部分学生近期需要重新建立学习节奏"
            />
          ) : null}
          {resourceSummary.failed || resourceSummary.pending ? (
            <InsightCard
              actionHref={`/knowledge?courseId=${courseId}&tab=resources`}
              actionLabel="检查课程资料"
              evidence={`${resourceSummary.pending} 份待处理，${resourceSummary.failed} 份解析失败`}
              title="教学资源处理链条仍有未完成项"
            />
          ) : null}
          <div className="rounded-lg border-2 border-border bg-card px-4 py-4 xl:col-span-2">
            <p className="text-xs font-semibold text-muted-foreground">后端课程洞察</p>
            <p className="mt-2 text-sm leading-6">{overview.insight.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone={overview.insight.risk_level === "high" ? "danger" : overview.insight.risk_level === "medium" ? "warning" : "success"}>
                {overview.insight.risk_level === "high" ? "高关注" : overview.insight.risk_level === "medium" ? "中关注" : "低关注"}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">生成时间 {overview.insight.generated_at.slice(0, 16).replace("T", " ")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>章节 / 知识点热区</CardTitle><p className="text-xs text-muted-foreground">掌握度与受影响学生均来自后端聚合数据。</p></CardHeader>
          <CardContent className="space-y-4 px-5">
            {derived.difficulties.length ? derived.difficulties.slice(0, 6).map((difficulty) => (
              <Link className="block rounded-lg border-2 border-border px-4 py-3 hover:border-orange-200" href={`/knowledge/points/${difficulty.knowledge_point_id}?from=insights&courseId=${courseId}`} key={difficulty.knowledge_point_id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{difficulty.name}</span>
                  <span className="text-sm font-semibold text-orange-600">{Math.round(difficulty.average_score)}%</span>
                </div>
                <Progress className="mt-3" value={difficulty.average_score} />
                <p className="mt-2 text-xs text-muted-foreground">{difficulty.affected_students} 名学生受影响 · 当前低于安全掌握阈值</p>
              </Link>
            )) : <EmptyState description="当前没有达到风险阈值的热区知识点。" title="暂无困难知识点" />}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>学生群体</CardTitle><p className="text-xs text-muted-foreground">使用掌握状态与最近 7 天活跃度规则。</p></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 px-5">
            <GroupMetric label="稳定掌握" value={derived.groups.stable} tone="success" />
            <GroupMetric label="需要关注" value={derived.groups.attention} tone="warning" />
            <GroupMetric label="低活跃" value={derived.groups.inactive} tone="neutral" />
            <GroupMetric label="暂无证据" value={derived.groups.noData} tone="neutral" />
            <Link className="col-span-2 text-sm font-medium text-primary" href={`/students?courseId=${courseId}&tab=students`}>查看全部学生学情</Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>学习行为</CardTitle><p className="text-xs text-muted-foreground">最近 LearningEvent 类型统计，不代表学习时长。</p></CardHeader>
          <CardContent className="space-y-3 px-5">
            {derived.behaviorRows.length ? derived.behaviorRows.slice(0, 6).map(([type, count]) => (
              <div key={type}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{eventLabel(type)}</span><span className="font-medium">{count}</span></div>
                <Progress value={count / Math.max(1, derived.behaviorTotal) * 100} />
              </div>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无学习行为证据。</p>}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>AI 回答风险</CardTitle><p className="text-xs text-muted-foreground">只统计后端真实 ReviewFlag。</p></CardHeader>
          <CardContent className="space-y-3 px-5">
            {derived.reviewReasons.length ? derived.reviewReasons.slice(0, 6).map(([reason, count]) => (
              <Link className="flex items-center justify-between gap-3 rounded-lg border-2 border-border px-3 py-2.5 hover:border-blue-200" href={`/ai-review?courseId=${courseId}&reason=${reason}`} key={reason}>
                <span className="text-sm">{reviewReasonLabels[reason]}</span>
                <span className="text-sm font-semibold">{count}</span>
              </Link>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">当前没有 AI 回答风险记录。</p>}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>教学资源情况</CardTitle><p className="text-xs text-muted-foreground">来自真实课程文档与知识结构。</p></CardHeader>
          <CardContent className="space-y-3 px-5">
            <ResourceMetric icon={BookOpen} label="已解析资源" value={`${resourceSummary.ready}/${resourceSummary.total}`} />
            <ResourceMetric icon={Layers3} label="章节 / 知识点" value={`${resourceSummary.chapters} / ${resourceSummary.knowledgePoints}`} />
            <ResourceMetric icon={FileWarning} label="待处理 / 失败" value={`${resourceSummary.pending + resourceSummary.processing} / ${resourceSummary.failed}`} />
            <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/knowledge?courseId=${courseId}&tab=resources`}>检查知识库 <ArrowRight className="size-3.5" /></Link>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>教学建议</CardTitle><p className="text-xs text-muted-foreground">每条建议都显示触发依据和下一步入口。</p></CardHeader>
        <CardContent className="grid gap-3 px-5 xl:grid-cols-3">
          {overview.teacher_actions.length ? overview.teacher_actions.map((action) => {
            const presentation = teacherActionPresentation(action.action_type, action.target_id, courseId, action.priority);
            return (
              <Link className="rounded-lg border-2 border-border px-4 py-4 hover:border-primary/35" href={presentation.href} key={`${action.action_type}-${action.target_id ?? "none"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{presentation.title}</p>
                  <StatusBadge tone={action.priority === "high" ? "danger" : action.priority === "medium" ? "warning" : "neutral"}>
                    {action.priority === "high" ? "高优先" : action.priority === "medium" ? "中优先" : "低优先"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{presentation.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">查看入口 <ArrowRight className="size-3.5" /></span>
              </Link>
            );
          }) : <EmptyState description="当前后端没有生成教师行动项。" title="暂无教学建议" />}
        </CardContent>
      </Card>
    </div>
  );
}

function buildInsightData({
  students,
  reviewSummary,
  learningDifficulties,
  chapterMastery,
}: {
  students: ReturnType<typeof useStudentAnalytics>["items"];
  reviewSummary: ReviewFlagSummary | null;
  learningDifficulties: NonNullable<ReturnType<typeof useTeacherDashboardOverview>["data"]>["learning_difficulties"];
  chapterMastery: NonNullable<ReturnType<typeof useTeacherDashboardOverview>["data"]>["chapter_mastery"];
}) {
  const difficultyMap = new Map(learningDifficulties.map((item) => [item.knowledge_point_id, item]));
  for (const student of students) {
    for (const point of student.weakKnowledgePoints) {
      const existing = difficultyMap.get(point.id);
      if (!existing) {
        difficultyMap.set(point.id, {
          knowledge_point_id: point.id,
          name: point.name,
          average_score: point.score,
          affected_students: 1,
        });
      }
    }
  }
  const behavior = new Map<string, number>();
  for (const student of students) {
    for (const event of student.detail?.recent_evidence ?? []) {
      behavior.set(event.event_type, (behavior.get(event.event_type) ?? 0) + 1);
    }
  }
  const reviewReasons = new Map<ReviewReason, number>();
  for (const [reason, count] of Object.entries(reviewSummary?.reasons ?? {})) {
    reviewReasons.set(reason as ReviewReason, count);
  }
  return {
    difficulties: [...difficultyMap.values()].sort((left, right) => left.average_score - right.average_score),
    chapterMastery,
    groups: {
      stable: students.filter((item) => item.status === "stable").length,
      attention: students.filter((item) => item.status === "attention" || item.status === "risk").length,
      inactive: students.filter((item) => !item.activeRecently).length,
      noData: students.filter((item) => item.status === "no_data").length,
    },
    behaviorRows: [...behavior.entries()].sort((left, right) => right[1] - left[1]),
    behaviorTotal: [...behavior.values()].reduce((sum, value) => sum + value, 0),
    reviewReasons: [...reviewReasons.entries()].sort((left, right) => right[1] - left[1]),
  };
}

function teacherActionPresentation(actionType: string, targetId: string | null, courseId: string, priority: string) {
  if (actionType === "review_flags") {
    return { href: `/ai-review?courseId=${courseId}&status=open`, title: "审核 AI 回答", description: "存在待教师判断的 AI 回答，请结合引用和完整对话审核。" };
  }
  if (actionType === "support_knowledge_point" && targetId) {
    return { href: `/knowledge/points/${targetId}?from=insights&courseId=${courseId}`, title: "支持薄弱知识点", description: "后端已将某知识点标记为需要教学支持，可查看来源、学生掌握和教学建议。" };
  }
  if (actionType === "encourage_inactive_students") {
    return { href: `/students?courseId=${courseId}&tab=students&activity=inactive`, title: "关注低活跃学生", description: "部分学生最近缺少学习证据，可查看学生列表并继续下钻。" };
  }
  return { href: `/dashboard?courseId=${courseId}`, title: "查看课程总览", description: `当前行动优先级为 ${priority}，请回到课程总览继续分析。` };
}

function InsightCard({ title, evidence, actionLabel, actionHref }: { title: string; evidence: string; actionLabel: string; actionHref: string }) {
  return (
    <div className="rounded-lg border-2 border-border bg-card px-4 py-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">证据：{evidence}</p>
      <Link className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary" href={actionHref}>
        {actionLabel} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function GroupMetric({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "neutral" }) {
  return (
    <div className="rounded-lg border-2 border-border bg-muted/25 px-3 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      <StatusBadge className="mt-3" tone={tone}>{label}</StatusBadge>
    </div>
  );
}

function ResourceMetric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-border px-3 py-3">
      <Icon className="size-4 text-primary" />
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
