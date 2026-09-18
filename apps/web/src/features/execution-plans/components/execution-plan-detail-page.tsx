"use client";

import type {
  ExecutionPlanAction,
  ExecutionPlanDetail,
  ExecutionPlanWeekItem,
  LearningEventType,
  PlanLearningEventItem,
  PlanTaskItem,
  PlanTaskStatus,
} from "@echo/shared-types";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  FileText,
  ListChecks,
  Sparkles,
  Target,
  Users,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useExecutionPlan,
  useExecutionPlanAction,
  usePlanEffect,
  usePlanLearningEvents,
} from "@/features/execution-plans/queries";
import type { ExecutionPlanTab } from "@/features/execution-plans/types";
import { executionPlanTabs } from "@/features/execution-plans/types";
import {
  eventResultLabel,
  eventResultTone,
  eventTypeLabel,
  formatDateTime,
  planStatusLabel,
  planStatusTone,
  targetScopeLabel,
  taskCompletionPercentage,
  taskStatusLabel,
  taskStatusTone,
  taskTypeLabel,
  weekStatus,
} from "@/features/execution-plans/view-model";

export function ExecutionPlanDetailPage({
  planId,
  initialTab,
}: {
  planId: string;
  initialTab: ExecutionPlanTab;
}) {
  const router = useRouter();
  const planQuery = useExecutionPlan(planId);
  const actionMutation = useExecutionPlanAction();
  const [activeTab, setActiveTab] = useState<ExecutionPlanTab>(initialTab);
  const [pendingAction, setPendingAction] = useState<ExecutionPlanAction | null>(null);

  if (planQuery.isLoading) return <LoadingState label="正在加载执行计划..." />;
  if (planQuery.isError) {
    return <ErrorState description="执行计划加载失败，请确认后端服务后重试。" onRetry={() => void planQuery.refetch()} />;
  }

  const plan = planQuery.data;
  if (!plan) {
    return (
      <EmptyState
        action={<Link className={buttonVariants()} href="/teaching-strategies">返回教学策略</Link>}
        description="计划不存在、已被删除，或当前教师没有访问权限。"
        title="未找到执行计划"
      />
    );
  }

  const currentWeek = plan.weekly_plans.find((week) => week.week_number === plan.progress.current_week) ?? null;
  const nextTask = plan.tasks
    .filter((task) => task.status === "in_progress" || task.status === "overdue" || task.status === "not_started")
    .sort((left, right) => left.week_number - right.week_number)[0] ?? null;

  async function confirmAction() {
    if (!pendingAction) return;
    await actionMutation.mutateAsync({ planId, action: pendingAction });
    setPendingAction(null);
  }

  function handleTabChange(value: string) {
    const next = value as ExecutionPlanTab;
    setActiveTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    router.replace(`/execution-plans/${planId}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
            {plan.status === "draft" || plan.status === "ready" ? (
              <Button disabled={actionMutation.isPending} onClick={() => setPendingAction("publish")} type="button">
                <CheckCircle2 data-icon="inline-start" />发布计划
              </Button>
            ) : null}
            {plan.status === "active" ? (
              <Button disabled={actionMutation.isPending} onClick={() => setPendingAction("pause")} type="button" variant="outline">
                <CirclePause data-icon="inline-start" />暂停计划
              </Button>
            ) : null}
            {plan.status === "paused" ? (
              <Button disabled={actionMutation.isPending} onClick={() => setPendingAction("resume")} type="button">
                <CirclePlay data-icon="inline-start" />继续计划
              </Button>
            ) : null}
            {plan.status === "active" || plan.status === "paused" ? (
              <Button disabled={actionMutation.isPending} onClick={() => setPendingAction("complete")} type="button" variant="outline">
                <CheckCircle2 data-icon="inline-start" />标记完成
              </Button>
            ) : null}
          </div>
        }
        breadcrumbs={[
          { label: "教学策略", href: "/teaching-strategies" },
          { label: "策略详情", href: `/teaching-strategies/${plan.strategy.id}` },
          { label: "执行计划详情" },
        ]}
        description="将教学策略转化为具体教学任务，并持续跟踪执行与学习效果。"
        title={plan.title}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryMetric icon={CalendarDays} label="执行周期" value={`${plan.start_date} → ${plan.end_date}`} />
        <SummaryMetric icon={Users} label="目标学生" value={`${plan.target_students.length} 人`} supporting={targetScopeLabel(plan.target_scope)} />
        <SummaryMetric icon={Target} label="目标知识点" value={`${plan.knowledge_points.length} 个`} />
        <SummaryMetric icon={CheckCircle2} label="当前进度" value={`${plan.progress.percentage}%`} supporting={plan.progress.current_week ? `当前第 ${plan.progress.current_week} 周` : "计划未开始"} />
        <SummaryMetric icon={ListChecks} label="任务完成" value={`${plan.progress.completed_tasks}/${plan.progress.total_tasks}`} supporting={plan.progress.overdue_tasks ? `${plan.progress.overdue_tasks} 项已延期` : "暂无延期任务"} />
      </section>

      {actionMutation.isError ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionMutation.error instanceof Error ? actionMutation.error.message : "计划状态更新失败。"}
        </p>
      ) : null}

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border px-0 sm:grid-cols-5" variant="line">
          {executionPlanTabs.map((tab) => (
            <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? <OverviewTab currentWeek={currentWeek} nextTask={nextTask} plan={plan} /> : null}
          {activeTab === "weeks" ? <WeeklyPlanTab plan={plan} /> : null}
          {activeTab === "tasks" ? <TasksTab plan={plan} /> : null}
          {activeTab === "events" ? <LearningEventsTab plan={plan} /> : null}
          {activeTab === "effect" ? <EffectTab plan={plan} /> : null}
        </TabsContent>
      </Tabs>

      <Dialog onOpenChange={(open) => { if (!open) setPendingAction(null); }} open={Boolean(pendingAction)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction ? actionCopy(pendingAction).title : ""}</DialogTitle>
            <DialogDescription>{pendingAction ? actionCopy(pendingAction).description : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPendingAction(null)} type="button" variant="outline">取消</Button>
            <Button disabled={actionMutation.isPending} onClick={() => void confirmAction()} type="button">
              {actionMutation.isPending ? "正在处理..." : pendingAction ? actionCopy(pendingAction).confirmLabel : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  supporting,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  supporting?: string;
}) {
  return (
    <div className="rounded-xl border-2 border-border bg-card px-4 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5 text-primary" />{label}</div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
      {supporting ? <p className="mt-1 text-xs text-muted-foreground">{supporting}</p> : null}
    </div>
  );
}

function OverviewTab({
  plan,
  currentWeek,
  nextTask,
}: {
  plan: ExecutionPlanDetail;
  currentWeek: ExecutionPlanWeekItem | null;
  nextTask: PlanTaskItem | null;
}) {
  const currentTasks = currentWeek
    ? plan.tasks.filter((task) => task.week_number === currentWeek.week_number)
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
      <div className="space-y-4">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle>执行进度</CardTitle><p className="mt-1 text-xs text-muted-foreground">进度按已完成教学任务计算。</p></div>
              <StatusBadge tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status)}</StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            <Progress value={plan.progress.percentage} />
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricLine label="当前周次" value={plan.progress.current_week ? `第 ${plan.progress.current_week} 周` : "未开始"} />
              <MetricLine label="已完成任务" value={`${plan.progress.completed_tasks} 项`} />
              <MetricLine label="已延期任务" tone={plan.progress.overdue_tasks ? "danger" : "neutral"} value={`${plan.progress.overdue_tasks} 项`} />
            </div>
            {nextTask ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
                <p className="font-medium text-blue-950">下一步：{nextTask.title}</p>
                <p className="mt-1 text-xs text-blue-800">第 {nextTask.week_number} 周 · {taskTypeLabel(nextTask.type)} · {taskStatusLabel(nextTask.status)}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle>本周教学安排</CardTitle><p className="mt-1 text-xs text-muted-foreground">来自已生成的周计划和真实任务。</p></div>
              {currentWeek ? <StatusBadge tone={taskStatusTone(weekStatus(currentWeek.tasks, plan.status))}>{taskStatusLabel(weekStatus(currentWeek.tasks, plan.status))}</StatusBadge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            {currentWeek ? (
              <>
                <p className="text-sm font-medium">第 {currentWeek.week_number} 周 · {currentWeek.start_date} → {currentWeek.end_date}</p>
                <p className="text-sm leading-6 text-muted-foreground">{currentWeek.content || "本周没有补充说明。"}</p>
                <KnowledgePointLinks plan={plan} ids={currentWeek.knowledge_point_ids} />
                <div className="space-y-2">
                  {currentTasks.length ? currentTasks.map((task) => <TaskCompactRow key={task.id} task={task} />) : <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">本周暂无教学任务。</p>}
                </div>
              </>
            ) : <EmptyState description="计划尚未进入执行周，或周计划还没有生成。" title="暂无本周安排" />}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>最近学习事件</CardTitle><p className="text-xs text-muted-foreground">只展示带当前计划标识的真实学习事件。</p></CardHeader>
          <CardContent className="px-5">
            <LearningEventRows courseId={plan.course.id} events={plan.recent_learning_events} planId={plan.id} tasks={plan.tasks} />
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <TargetStudentsCard plan={plan} />
        <KnowledgePointsCard plan={plan} />
        <StrategyCard plan={plan} />
        <ResourcesCard plan={plan} />
      </aside>
    </div>
  );
}

function WeeklyPlanTab({ plan }: { plan: ExecutionPlanDetail }) {
  const weeks = [...plan.weekly_plans].sort((left, right) => left.week_number - right.week_number);
  if (!weeks.length) {
    return <EmptyState description="当前计划还没有周计划数据，请返回创建向导完成 AI 辅助生成。" title="尚未生成周计划" />;
  }

  return (
    <div className="space-y-4">
      {weeks.map((week) => {
        const status = weekStatus(week.tasks, plan.status);
        return (
          <Card className="gap-4 py-5" key={week.id}>
            <CardHeader className="px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>第 {week.week_number} 周</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{week.start_date} → {week.end_date}</p>
                </div>
                <StatusBadge tone={taskStatusTone(status)}>{taskStatusLabel(status)}</StatusBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5">
              <p className="text-sm leading-6 text-muted-foreground">{week.content || "本周没有补充说明。"}</p>
              <KnowledgePointLinks plan={plan} ids={week.knowledge_point_ids} />
              {week.resources.length ? (
                <div className="flex flex-wrap gap-2">
                  {week.resources.map((resource) => (
                    <Link className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/35" href={`/knowledge/resources/${resource.id}`} key={resource.id}>
                      <BookOpen className="size-3.5" />{resource.title}
                    </Link>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                {week.tasks.length ? week.tasks.map((task) => <TaskCompactRow key={task.id} task={task} />) : <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">本周暂无任务。</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TasksTab({ plan }: { plan: ExecutionPlanDetail }) {
  const [status, setStatus] = useState<PlanTaskStatus | "all">("all");
  const tasks = useMemo(
    () => [...plan.tasks]
      .filter((task) => status === "all" || task.status === status)
      .sort((left, right) => left.week_number - right.week_number),
    [plan.tasks, status],
  );

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>教学任务</CardTitle><p className="mt-1 text-xs text-muted-foreground">任务类型、对象和完成情况均来自真实计划数据。</p></div>
          <Select
            items={[
              { value: "all", label: "全部状态" },
              { value: "not_started", label: "未开始" },
              { value: "in_progress", label: "进行中" },
              { value: "completed", label: "已完成" },
              { value: "overdue", label: "已延期" },
              { value: "cancelled", label: "已取消" },
            ]}
            onValueChange={(value) => value && setStatus(value as PlanTaskStatus | "all")}
            value={status}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="not_started">未开始</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="overdue">已延期</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {tasks.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">任务</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>周次</TableHead>
                <TableHead>截止时间</TableHead>
                <TableHead>完成情况</TableHead>
                <TableHead className="pr-5">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="max-w-[320px] whitespace-normal pl-5">
                    <p className="font-medium">{task.title}</p>
                    {task.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p> : null}
                  </TableCell>
                  <TableCell>{taskTypeLabel(task.type)}</TableCell>
                  <TableCell>第 {task.week_number} 周</TableCell>
                  <TableCell>{task.due_at ? formatDateTime(task.due_at) : "未设置"}</TableCell>
                  <TableCell>
                    <div className="min-w-28 space-y-1.5">
                      <p className="text-xs text-muted-foreground">{task.completion.completed}/{task.completion.total} · {taskCompletionPercentage(task)}%</p>
                      <Progress value={taskCompletionPercentage(task)} />
                    </div>
                  </TableCell>
                  <TableCell className="pr-5"><StatusBadge tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</StatusBadge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <EmptyState description="当前筛选条件下没有教学任务。" title="暂无任务" />}
      </CardContent>
    </Card>
  );
}

function LearningEventsTab({ plan }: { plan: ExecutionPlanDetail }) {
  const [studentId, setStudentId] = useState("all");
  const [knowledgePointId, setKnowledgePointId] = useState("all");
  const [eventType, setEventType] = useState<LearningEventType | "all">("all");
  const eventsQuery = usePlanLearningEvents(plan.id, {
    studentId: studentId === "all" ? undefined : studentId,
    knowledgePointId: knowledgePointId === "all" ? undefined : knowledgePointId,
    eventType: eventType === "all" ? undefined : eventType,
  });

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><CardTitle>学习事件</CardTitle><p className="mt-1 text-xs text-muted-foreground">复用课程 LearningEvent，只读取带当前计划标识的事件。</p></div>
          <div className="flex flex-wrap gap-2">
            <Select items={[{ value: "all", label: "全部学生" }, ...plan.target_students.map((student) => ({ value: student.id, label: student.display_name }))]} onValueChange={(value) => value && setStudentId(value)} value={studentId}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">全部学生</SelectItem>
                {plan.target_students.map((student) => <SelectItem key={student.id} value={student.id}>{student.display_name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            <Select items={[{ value: "all", label: "全部知识点" }, ...plan.knowledge_points.map((point) => ({ value: point.id, label: point.name }))]} onValueChange={(value) => value && setKnowledgePointId(value)} value={knowledgePointId}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">全部知识点</SelectItem>
                {plan.knowledge_points.map((point) => <SelectItem key={point.id} value={point.id}>{point.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            <Select items={[{ value: "all", label: "全部事件" }, ...learningEventOptions]} onValueChange={(value) => value && setEventType(value as LearningEventType | "all")} value={eventType}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">全部事件</SelectItem>
                {learningEventOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5">
        {eventsQuery.isLoading ? <LoadingState label="正在读取学习事件..." /> : null}
        {eventsQuery.isError ? <ErrorState description="学习事件加载失败。" onRetry={() => void eventsQuery.refetch()} /> : null}
        {!eventsQuery.isLoading && !eventsQuery.isError ? <LearningEventRows courseId={plan.course.id} events={eventsQuery.data?.items ?? []} planId={plan.id} tasks={plan.tasks} /> : null}
      </CardContent>
    </Card>
  );
}

function EffectTab({ plan }: { plan: ExecutionPlanDetail }) {
  const effectQuery = usePlanEffect(plan.id);

  if (effectQuery.isLoading) return <LoadingState label="正在读取计划效果..." />;
  if (effectQuery.isError) return <ErrorState description="计划效果加载失败。" onRetry={() => void effectQuery.refetch()} />;
  const effect = effectQuery.data;
  if (!effect) return <EmptyState description="后端暂未返回计划效果数据。" title="暂无效果数据" />;

  return (
    <div className="space-y-4">
      <Card className="gap-4 border-blue-200 bg-blue-50/45 py-5">
        <CardHeader className="px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle>效果评估</CardTitle><p className="mt-1 text-xs text-muted-foreground">事实变化与 AI 解释分开呈现，不把相关性写成因果结论。</p></div>
            <Link className={buttonVariants({ variant: "outline" })} href={`/teaching-strategies/${plan.strategy.id}?tab=effect`}>
              查看策略效果<ArrowRight data-icon="inline-end" />
            </Link>
          </div>
        </CardHeader>
      </Card>

      {effect.insufficient_evidence ? (
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50/55 px-5 py-4 text-sm text-orange-950">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />计划尚未产生足够学习证据</p>
          <p className="mt-1 text-xs leading-5 text-orange-800">当前不会根据少量数据推断计划效果，也不会把 AI 预期写成实际结果。</p>
        </div>
      ) : null}

      {effect.metrics.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4"><CardTitle>实际结果</CardTitle></CardHeader>
          <CardContent className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
            {effect.metrics.map((metric) => (
              <div className="rounded-lg border border-border px-4 py-4" key={metric.metric}>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{formatMetricValue(metric.after)}</p>
                <p className="mt-1 text-xs text-muted-foreground">执行前 {formatMetricValue(metric.before)} · 样本 {metric.sample_size}</p>
                {metric.delta !== null ? <p className="mt-2 text-xs font-medium text-primary">观察变化 {formatSignedMetricValue(metric.delta)}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {effect.task_effectiveness.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4"><CardTitle>任务效果</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border px-0">
            {effect.task_effectiveness.map((task) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={task.task_id}>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.event_count} 条学习事件</p></div>
                <div className="text-right"><p className="text-sm font-semibold">{Math.round(task.completion_rate * 100)}%</p><p className="text-xs text-muted-foreground">任务完成率</p></div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ListPanel empty="暂无后端事实变化记录。" items={effect.facts} title="事实变化" />
        <ListPanel empty="后端没有标记仍存在的问题。" items={effect.remaining_issues} title="仍存在的问题" />
      </div>

      {effect.ai_explanation ? (
        <Card className="gap-3 border-blue-200 bg-blue-50/45 py-5">
          <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI 解释</CardTitle></CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">{effect.ai_explanation}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function LearningEventRows({
  events,
  tasks,
  courseId,
  planId,
}: {
  events: PlanLearningEventItem[];
  tasks: PlanTaskItem[];
  courseId: string;
  planId: string;
}) {
  if (!events.length) {
    return <EmptyState description="计划尚未收集到带 planId 的学习事件，不会用模拟行为填充。" title="暂无学习事件" />;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const task = event.task_id ? tasks.find((candidate) => candidate.id === event.task_id) : null;
        return (
          <div className="rounded-lg border border-border px-4 py-3" key={event.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="text-sm font-medium hover:text-primary" href={`/students/${event.student.id}?from=execution-plan&courseId=${courseId}&planId=${planId}`}>{event.student.display_name}</Link>
                  <StatusBadge tone={eventResultTone(event.result)}>{eventResultLabel(event.result)}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{eventTypeLabel(event.event_type)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task ? `关联任务：${task.title}` : "未关联具体任务"}
                  {event.knowledge_point ? ` · ${event.knowledge_point.name}` : ""}
                  {event.week_number ? ` · 第 ${event.week_number} 周` : ""}
                </p>
                {event.evidence ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.evidence}</p> : null}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCompactRow({ task }: { task: PlanTaskItem }) {
  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
        <StatusBadge tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</StatusBadge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{taskTypeLabel(task.type)}</span>
        <span>第 {task.week_number} 周</span>
        <span>{task.completion.completed}/{task.completion.total} 已完成</span>
        {task.due_at ? <span>截止 {formatDateTime(task.due_at)}</span> : null}
      </div>
      <Progress className="mt-2" value={taskCompletionPercentage(task)} />
    </div>
  );
}

function TargetStudentsCard({ plan }: { plan: ExecutionPlanDetail }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" />目标学生</CardTitle></CardHeader>
      <CardContent className="space-y-3 px-5 text-sm">
        <p><span className="font-semibold">{plan.target_students.length}</span> 人 · {targetScopeLabel(plan.target_scope)}</p>
        <div className="flex flex-wrap gap-1.5">
          {plan.target_students.slice(0, 8).map((student) => <span className="rounded-md border border-border px-2 py-1 text-xs" key={student.id}>{student.display_name}</span>)}
          {plan.target_students.length > 8 ? <span className="rounded-md border border-border px-2 py-1 text-xs">另有 {plan.target_students.length - 8} 人</span> : null}
        </div>
        <Link className={buttonVariants({ variant: "outline" })} href={`/students?courseId=${plan.course.id}&from=execution-plan&planId=${plan.id}`}>查看学生<ArrowRight data-icon="inline-end" /></Link>
      </CardContent>
    </Card>
  );
}

function KnowledgePointsCard({ plan }: { plan: ExecutionPlanDetail }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Target className="size-4 text-primary" />目标知识点</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-5">
        {plan.knowledge_points.length ? plan.knowledge_points.slice(0, 6).map((point) => (
          <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-primary/35" href={`/knowledge/points/${point.id}?from=execution-plan&courseId=${plan.course.id}`} key={point.id}>
            <span className="min-w-0 truncate">{point.name}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          </Link>
        )) : <p className="py-4 text-center text-sm text-muted-foreground">未关联知识点。</p>}
      </CardContent>
    </Card>
  );
}

function StrategyCard({ plan }: { plan: ExecutionPlanDetail }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><FileText className="size-4 text-primary" />关联教学策略</CardTitle></CardHeader>
      <CardContent className="space-y-3 px-5">
        <Link className="block rounded-lg border border-border px-3 py-3 hover:border-primary/35" href={`/teaching-strategies/${plan.strategy.id}`}>
          <p className="text-sm font-medium">{plan.strategy.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">策略版本 v{plan.strategy.version}</p>
        </Link>
        {plan.teacher_note ? <p className="rounded-lg bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">教师备注：{plan.teacher_note}</p> : null}
      </CardContent>
    </Card>
  );
}

function ResourcesCard({ plan }: { plan: ExecutionPlanDetail }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />使用资源</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-5">
        {plan.resources.length ? plan.resources.map((resource) => (
          <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-primary/35" href={`/knowledge/resources/${resource.id}`} key={resource.id}>
            <span className="min-w-0 truncate">{resource.title}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          </Link>
        )) : <p className="py-4 text-center text-sm text-muted-foreground">未关联教学资源。</p>}
      </CardContent>
    </Card>
  );
}

function KnowledgePointLinks({ plan, ids }: { plan: ExecutionPlanDetail; ids: string[] }) {
  const points = plan.knowledge_points.filter((point) => ids.includes(point.id));
  if (!points.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {points.map((point) => <Link className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/35" href={`/knowledge/points/${point.id}?from=execution-plan&courseId=${plan.course.id}`} key={point.id}>{point.name}</Link>)}
    </div>
  );
}

function MetricLine({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "danger" }) {
  return <div className={`rounded-lg border px-3 py-3 ${tone === "danger" ? "border-red-200 bg-red-50/45" : "border-border bg-muted/20"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

function ListPanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-5">
        {items.length ? items.map((item) => <p className="rounded-lg border border-border px-3 py-2.5 text-sm leading-6 text-muted-foreground" key={item}>{item}</p>) : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}
      </CardContent>
    </Card>
  );
}

const learningEventOptions: Array<{ value: LearningEventType; label: string }> = [
  { value: "question_asked", label: "提出问题" },
  { value: "hint_requested", label: "请求提示" },
  { value: "quiz_correct", label: "练习正确" },
  { value: "quiz_wrong", label: "练习错误" },
  { value: "concept_confusion", label: "概念混淆" },
  { value: "repeated_error", label: "重复错误" },
  { value: "resolved", label: "问题解决" },
  { value: "teacher_adjustment", label: "教师干预" },
];

function actionCopy(action: ExecutionPlanAction) {
  const copies: Record<ExecutionPlanAction, { title: string; description: string; confirmLabel: string }> = {
    publish: { title: "发布执行计划？", description: "发布后计划进入待执行或进行中状态，并开始承接学生任务与学习事件。", confirmLabel: "发布计划" },
    pause: { title: "暂停执行计划？", description: "暂停不会删除已完成任务和学习记录，之后可以继续执行。", confirmLabel: "确认暂停" },
    resume: { title: "继续执行计划？", description: "继续后计划恢复执行状态，未完成任务会按原计划周期继续跟踪。", confirmLabel: "确认继续" },
    complete: { title: "标记计划完成？", description: "完成后不会删除任务、学习事件或效果数据，仍可继续查看和评估。", confirmLabel: "确认完成" },
    cancel: { title: "取消执行计划？", description: "取消会终止当前计划状态，历史任务和学习事件仍会保留。", confirmLabel: "确认取消" },
  };
  return copies[action];
}

function formatMetricValue(value: number | null) {
  if (value === null) return "暂无";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSignedMetricValue(value: number) {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value > 0 ? `+${formatted}` : formatted;
}
