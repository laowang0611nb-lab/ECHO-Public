"use client";

import type { TeachingStrategyListItem, TeachingStrategyType } from "@echo/shared-types";
import { CheckCircle2, Plus, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeachingStrategies, useGenerateTeachingStrategy, useTeachingStrategyAction } from "@/features/teaching-strategies/queries";
import { useExecutionPlans } from "@/features/execution-plans/queries";
import { canCreateExecutionPlan } from "@/features/teaching-strategies/view-model";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { useStudentAnalytics } from "@/features/students/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const strategyTypeLabels: Record<TeachingStrategyType, string> = {
  content_adjustment: "内容调整",
  teaching_method: "教学方法",
  differentiated_instruction: "分层教学",
  assignment_design: "作业设计",
  classroom_interaction: "课堂互动",
};

const strategyTypeTone: Record<TeachingStrategyType, "info" | "neutral" | "warning" | "success" | "danger"> = {
  content_adjustment: "danger",
  teaching_method: "info",
  differentiated_instruction: "neutral",
  assignment_design: "info",
  classroom_interaction: "warning",
};

export function TeachingStrategiesPage({
  initialCourseId,
  initialKnowledgePointId,
  initialStudentGroup,
  initialSuggestionId,
}: {
  initialCourseId?: string;
  initialKnowledgePointId?: string;
  initialStudentGroup?: string;
  initialSuggestionId?: string;
}) {
  const router = useRouter();
  const { user } = useTeacherSession();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId) ? initialCourseId : selectedCourseId;
  const [type, setType] = useState<TeachingStrategyType | "all">("all");
  const strategiesQuery = useTeachingStrategies(courseId, {
    type: type === "all" ? undefined : type,
    limit: 100,
  });
  const plansQuery = useExecutionPlans(courseId, { limit: 100 });
  const dashboardQuery = useTeacherDashboardOverview(user?.id, courseId);
  const studentsQuery = useStudentAnalytics(courseId);
  const generateMutation = useGenerateTeachingStrategy(courseId);
  const actionMutation = useTeachingStrategyAction();
  const strategies = strategiesQuery.data?.items ?? [];
  const plans = plansQuery.data?.items ?? [];
  const focusAreas = dashboardQuery.data?.learning_difficulties ?? [];
  const activeStudents = studentsQuery.items.filter((item) => item.activeRecently);
  const plannableStrategies = strategies.filter((strategy) => canCreateExecutionPlan(strategy.status));
  const planSource = plannableStrategies[0] ?? null;

  const stats = {
    total: strategiesQuery.data?.total ?? strategies.length,
    accepted: strategies.filter((strategy) => strategy.status === "accepted" || strategy.status === "planned" || strategy.status === "active").length,
    highPriority: strategies.filter((strategy) => strategy.priority === "high").length,
    planning: plans.filter((plan) => plan.status === "active" || plan.status === "ready").length,
  };

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，再生成教学策略。" title="尚未选择课程" />;
  }
  if (strategiesQuery.isLoading || plansQuery.isLoading || dashboardQuery.isLoading || studentsQuery.isLoading) {
    return <LoadingState label="正在加载教学策略..." />;
  }
  if (strategiesQuery.isError || plansQuery.isError || dashboardQuery.isError || studentsQuery.isError) {
    return <ErrorState description="教学策略加载失败，请确认后端服务后重试。" onRetry={() => { void strategiesQuery.refetch(); void plansQuery.refetch(); void dashboardQuery.refetch(); studentsQuery.refetch(); }} />;
  }

  async function handleGenerate() {
    try {
      const knowledgePointIds = [...new Set([
        ...(initialKnowledgePointId ? [initialKnowledgePointId] : []),
        ...focusAreas.map((item) => item.knowledge_point_id),
      ])].slice(0, 5);
      const studentIds = activeStudents.slice(0, 20).map((item) => item.member.user_id);
      const generated = await generateMutation.mutateAsync({
        knowledgePointIds,
        studentIds,
        insightIds: initialSuggestionId ? [initialSuggestionId] : [],
        timeRangeDays: 28,
      });
      router.push(`/teaching-strategies/${generated.id}`);
    } catch {
      // Mutation state renders the backend error.
    }
  }

  async function handleAccept(strategy: TeachingStrategyListItem) {
    try {
      await actionMutation.mutateAsync({ strategyId: strategy.id, action: "accept" });
    } catch {
      // Mutation state renders the backend error.
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              items={courses.map((course) => ({ value: course.id, label: course.name }))}
              onValueChange={(value) => {
                if (!value) return;
                setSelectedCourseId(value);
                router.replace(`/teaching-strategies?courseId=${value}`, { scroll: false });
              }}
              value={courseId}
            >
              <SelectTrigger className="w-[min(280px,60vw)]"><SelectValue className="truncate" /></SelectTrigger>
              <SelectContent><SelectGroup>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <Button disabled={generateMutation.isPending || !courseId} onClick={() => void handleGenerate()} type="button">
              <Sparkles data-icon="inline-start" />
              {generateMutation.isPending ? "正在生成..." : "生成新策略"}
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "AI 教学" }, { label: "教学策略" }]}
        description="把学情证据转化为教师可判断、可采纳、可执行的教学策略。"
        title="教学策略"
      />

      {initialKnowledgePointId || initialStudentGroup || initialSuggestionId ? (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-950">
          <p className="font-medium">已从 AI 教学洞察带入策略生成上下文</p>
          <p className="mt-1 text-xs text-blue-800">
            {initialKnowledgePointId ? `知识点：${focusAreas.find((item) => item.knowledge_point_id === initialKnowledgePointId)?.name ?? `${initialKnowledgePointId.slice(0, 8)}…`}` : null}
            {initialStudentGroup ? ` · 学生群体：${initialStudentGroup}` : null}
            {initialSuggestionId ? ` · 建议：${initialSuggestionId}` : null}
          </p>
        </div>
      ) : null}
      {generateMutation.isError ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{generateMutation.error instanceof Error ? generateMutation.error.message : "策略生成失败。"}</p> : null}
      {actionMutation.isError ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{actionMutation.error instanceof Error ? actionMutation.error.message : "策略状态更新失败。"}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Target} label="策略建议总数" supporting="当前筛选范围内" value={stats.total} />
        <StatCard icon={CheckCircle2} label="已采纳 / 已计划" supporting="教师已确认的策略" value={stats.accepted} />
        <StatCard icon={TrendingUp} label="高优先级" supporting="需要优先处理" value={stats.highPriority} />
        <StatCard icon={Users} label="执行中计划" supporting="关联当前课程" value={stats.planning} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>AI 策略建议</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">AI 生成后保持建议状态，必须由教师采纳后才进入执行链路。</p>
              </div>
              <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="#execution-plans">查看执行计划</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <Tabs onValueChange={(value) => setType(value as TeachingStrategyType | "all")} value={type}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 border-b border-border px-0" variant="line">
                <TabsTrigger value="all">全部 {strategies.length}</TabsTrigger>
                {Object.entries(strategyTypeLabels).map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
                ))}
              </TabsList>
              <TabsContent className="mt-4" value={type}>
                {strategies.length ? (
                  <div className="space-y-3">
                    {strategies.map((strategy) => (
                      <article className="rounded-xl border-2 border-border bg-card p-4" key={strategy.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link className="truncate text-sm font-semibold hover:text-primary" href={`/teaching-strategies/${strategy.id}`}>{strategy.title}</Link>
                              <StatusBadge tone={strategyTypeTone[strategy.type]}>{strategyTypeLabels[strategy.type]}</StatusBadge>
                              <StatusBadge tone={strategy.priority === "high" ? "danger" : strategy.priority === "medium" ? "warning" : "neutral"}>
                                {strategy.priority === "high" ? "高优先级" : strategy.priority === "medium" ? "中优先级" : "低优先级"}
                              </StatusBadge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{strategy.description}</p>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                              <span>{strategy.target_knowledge_points.map((point) => point.name).join("、") || "未关联知识点"}</span>
                              <span>{strategy.target_student_count} 名学生</span>
                              {strategy.expected_effect.summary ? <span>预期：{strategy.expected_effect.summary}</span> : null}
                            </div>
                          </div>
                          <Button
                            disabled={strategy.status !== "suggested" || actionMutation.isPending}
                            onClick={() => void handleAccept(strategy)}
                            size="sm"
                            type="button"
                            variant={strategy.status === "suggested" ? "outline" : "ghost"}
                          >
                            {strategy.status === "suggested" ? "采纳" : "已处理"}
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState description="当前课程还没有教学策略，点击右上角“生成新策略”。" title="暂无策略" />}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="gap-4 py-5">
            <CardHeader className="px-5"><CardTitle>重点关注领域</CardTitle><p className="text-xs text-muted-foreground">来自当前课程真实困难知识点。</p></CardHeader>
            <CardContent className="space-y-3 px-5">
              {focusAreas.length ? focusAreas.slice(0, 5).map((area, index) => (
                <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-3" key={area.knowledge_point_id}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{area.name}</p><p className="mt-1 text-xs text-muted-foreground">{area.affected_students} 名学生受影响</p></div>
                  <span className="text-sm font-semibold text-orange-600">{Math.round(area.average_score)}%</span>
                </div>
              )) : <EmptyState description="当前没有达到阈值的困难知识点。" title="暂无重点领域" />}
            </CardContent>
          </Card>

          <Card className="gap-4 border-blue-300/70 bg-blue-50/45 py-5">
            <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />策略效果说明</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
              <p>策略页只展示后端提供的预期效果，明确标记为预测，不冒充实际结果。</p>
              <p>实际效果必须从关联执行计划的 LearningEvent 和效果接口读取。</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card className="gap-5 py-5" id="execution-plans">
        <CardHeader className="px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle>教学策略执行计划</CardTitle><p className="mt-1 text-xs text-muted-foreground">把已采纳策略转成具体教学行动。</p></div>
            {planSource ? (
              <Link className={buttonVariants()} href={`/execution-plans/new?strategyId=${planSource.id}&courseId=${courseId}`}>
                <Plus data-icon="inline-start" />创建执行计划
              </Link>
            ) : (
              <Button disabled type="button" variant="outline"><Plus data-icon="inline-start" />先采纳策略</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 md:grid-cols-3">
          {plans.length ? plans.slice(0, 3).map((plan) => (
            <Link className="rounded-xl border-2 border-border px-4 py-4 transition-colors hover:border-primary/35" href={`/execution-plans/${plan.id}`} key={plan.id}>
              <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-semibold">{plan.title}</p><StatusBadge tone={plan.status === "active" ? "success" : plan.status === "draft" ? "neutral" : "info"}>{planStatusLabel(plan.status)}</StatusBadge></div>
              <p className="mt-2 text-xs text-muted-foreground">{plan.start_date} → {plan.end_date}</p>
              <p className="mt-2 text-xs text-muted-foreground">进度 {plan.progress.percentage}% · {plan.target_student_count} 名学生</p>
            </Link>
          )) : <p className="col-span-full rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">还没有执行计划，将策略转化为具体教学行动。</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function planStatusLabel(status: string) {
  const labels: Record<string, string> = { draft: "草稿", ready: "待执行", active: "执行中", paused: "已暂停", completed: "已完成", cancelled: "已取消" };
  return labels[status] ?? status;
}
