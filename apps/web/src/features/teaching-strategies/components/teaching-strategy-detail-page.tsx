"use client";

import type { PlanEffect, TeachingStrategyDetail, TeachingStrategyStatus } from "@echo/shared-types";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, CirclePause, CirclePlay, Plus, Sparkles } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeachingStrategy, useTeachingStrategyAction, useTeachingStrategyEffect } from "@/features/teaching-strategies/queries";
import { canCreateExecutionPlan } from "@/features/teaching-strategies/view-model";

const tabs = [
  { value: "overview", label: "策略概览" },
  { value: "goals", label: "教学目标" },
  { value: "methods", label: "教学方法" },
  { value: "rules", label: "个性化规则" },
  { value: "ai-rules", label: "AI 教学规则" },
  { value: "resources", label: "资源配置" },
  { value: "effect", label: "效果评估" },
  { value: "history", label: "修改记录" },
] as const;

export function TeachingStrategyDetailPage({ strategyId, initialTab }: { strategyId: string; initialTab?: string }) {
  const router = useRouter();
  const strategyQuery = useTeachingStrategy(strategyId);
  const effectQuery = useTeachingStrategyEffect(strategyId);
  const actionMutation = useTeachingStrategyAction();
  const [activeTab, setActiveTab] = useState(initialTab && tabs.some((tab) => tab.value === initialTab) ? initialTab : "overview");

  if (strategyQuery.isLoading) return <LoadingState label="正在加载策略详情..." />;
  if (strategyQuery.isError) return <ErrorState description="教学策略加载失败。" onRetry={() => void strategyQuery.refetch()} />;
  const strategy = strategyQuery.data;
  if (!strategy) return <EmptyState action={<Link className={buttonVariants()} href="/teaching-strategies">返回教学策略</Link>} description="策略不存在或已被删除。" title="未找到策略" />;

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as typeof activeTab) : "overview";
    setActiveTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    router.replace(`/teaching-strategies/${strategyId}?${params.toString()}`, { scroll: false });
  }

  async function handleAction(action: "accept" | "activate" | "pause" | "resume" | "complete") {
    try {
      await actionMutation.mutateAsync({ strategyId, action });
    } catch {
      // Mutation state renders the backend conflict without an unhandled rejection.
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.back()} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />返回</Button>
            {canCreateExecutionPlan(strategy.status) ? (
              <Link className={buttonVariants()} href={`/execution-plans/new?strategyId=${strategy.id}&courseId=${strategy.course.id}`}>
                <Plus data-icon="inline-start" />创建执行计划
              </Link>
            ) : (
              <Button disabled type="button" variant="outline"><Plus data-icon="inline-start" />采纳后可创建计划</Button>
            )}
          </div>
        }
        breadcrumbs={[{ label: "教学策略", href: "/teaching-strategies" }, { label: "策略详情" }]}
        description="查看目标、教学方法、AI 规则、资源与执行效果，并决定是否启用。"
        title={strategy.title}
      />

      <StrategyHeader strategy={strategy} onAction={handleAction} actionPending={actionMutation.isPending} />

      {actionMutation.isError ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionMutation.error instanceof Error ? actionMutation.error.message : "策略状态更新失败。"}
        </p>
      ) : null}
      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-none border-b border-border px-0 sm:grid-cols-4 xl:grid-cols-8" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? <StrategyOverview strategy={strategy} /> : null}
          {activeTab === "goals" ? <ListCard title="教学目标" items={strategy.goals} empty="尚未配置教学目标。" /> : null}
          {activeTab === "methods" ? <MethodsCard strategy={strategy} /> : null}
          {activeTab === "rules" ? <ListCard title="个性化规则" items={strategy.personalization_rules} empty="尚未配置个性化规则。" /> : null}
          {activeTab === "ai-rules" ? <ListCard title="AI 教学规则" items={strategy.ai_rules} empty="尚未配置 AI 教学规则。" /> : null}
          {activeTab === "resources" ? <ResourcesCard strategy={strategy} /> : null}
          {activeTab === "effect" ? <EffectTab effect={effectQuery.data ?? null} loading={effectQuery.isLoading} error={effectQuery.isError} onRetry={() => void effectQuery.refetch()} /> : null}
          {activeTab === "history" ? <HistoryCard strategy={strategy} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StrategyHeader({ strategy, onAction, actionPending }: { strategy: TeachingStrategyDetail; onAction: (action: "accept" | "activate" | "pause" | "resume" | "complete") => Promise<void>; actionPending: boolean }) {
  const [confirmAction, setConfirmAction] = useState<"pause" | "complete" | null>(null);
  return (
    <section className="grid gap-4 rounded-xl border-2 border-border bg-card p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={strategy.status === "active" ? "success" : strategy.status === "paused" ? "warning" : "info"}>{strategyStatusLabel(strategy.status)}</StatusBadge>
          <StatusBadge tone="neutral">{`v${strategy.version}`}</StatusBadge>
          <StatusBadge tone={strategy.priority === "high" ? "danger" : strategy.priority === "medium" ? "warning" : "neutral"}>{strategyPriorityLabel(strategy.priority)}</StatusBadge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{strategy.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span>课程：{strategy.course.name}</span>
          <span>目标学生：{strategy.target_students.length || strategy.evidence.student_count} 人</span>
          <span>知识点：{strategy.target_knowledge_points.length} 个</span>
          <span>更新：{strategy.updated_at.slice(0, 16).replace("T", " ")}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        {strategy.status === "suggested" ? (
          <Button disabled={actionPending} onClick={() => void onAction("accept")} type="button"><CheckCircle2 data-icon="inline-start" />采纳策略</Button>
        ) : null}
        {strategy.status === "accepted" || strategy.status === "planned" ? (
          <Button disabled={actionPending} onClick={() => void onAction("activate")} type="button"><CirclePlay data-icon="inline-start" />启用策略</Button>
        ) : null}
        {strategy.status === "active" ? (
          <Button disabled={actionPending} onClick={() => setConfirmAction("pause")} type="button" variant="outline"><CirclePause data-icon="inline-start" />暂停策略</Button>
        ) : null}
        {strategy.status === "paused" ? (
          <Button disabled={actionPending} onClick={() => void onAction("resume")} type="button"><CirclePlay data-icon="inline-start" />继续策略</Button>
        ) : null}
        {strategy.status === "active" || strategy.status === "paused" ? (
          <Button disabled={actionPending} onClick={() => setConfirmAction("complete")} type="button" variant="outline"><CheckCircle2 data-icon="inline-start" />标记完成</Button>
        ) : null}
      </div>
      {confirmAction ? (
        <div className="col-span-full rounded-lg border border-orange-200 bg-orange-50/55 px-4 py-3 text-sm">
          <p>{confirmAction === "pause" ? "暂停后不会删除执行计划和历史学习事件。" : "标记完成后策略保留，效果数据仍可查看。"}</p>
          <div className="mt-3 flex gap-2">
            <Button disabled={actionPending} onClick={() => void onAction(confirmAction).then(() => setConfirmAction(null))} size="sm" type="button">确认</Button>
            <Button onClick={() => setConfirmAction(null)} size="sm" type="button" variant="outline">取消</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StrategyOverview({ strategy }: { strategy: TeachingStrategyDetail }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <div className="space-y-4">
        <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle>策略说明</CardTitle></CardHeader><CardContent className="px-5 text-sm leading-7 text-muted-foreground">{strategy.description}</CardContent></Card>
        <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle>教学流程</CardTitle></CardHeader><CardContent className="grid gap-3 px-5 md:grid-cols-5">{strategy.teaching_flow.map((step) => <div className="rounded-lg border border-border px-3 py-3" key={step.order}><p className="text-xs font-semibold text-primary">0{step.order}</p><p className="mt-2 text-sm font-medium">{step.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p></div>)}</CardContent></Card>
      </div>
      <aside className="space-y-4">
        <LinkedPlansCard canCreate={canCreateExecutionPlan(strategy.status)} strategy={strategy} />
        <Card className="gap-3 border-blue-300/70 bg-blue-50/45 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />ECHO 依据</CardTitle></CardHeader><CardContent className="space-y-2 px-5 text-sm text-muted-foreground"><p>涉及 {strategy.evidence.knowledge_point_count} 个知识点</p><p>关联 {strategy.evidence.learning_event_count} 条学习事件</p><p>覆盖 {strategy.evidence.student_count} 名学生</p></CardContent></Card>
      </aside>
    </div>
  );
}

function LinkedPlansCard({ strategy, canCreate }: { strategy: TeachingStrategyDetail; canCreate: boolean }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>关联执行计划</CardTitle></CardHeader>
      <CardContent className="space-y-2 px-5">
        {strategy.linked_plans.length ? strategy.linked_plans.map((plan) => (
          <Link className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 hover:border-primary/35" href={`/execution-plans/${plan.id}`} key={plan.id}>
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{plan.title}</span><span className="mt-1 block text-xs text-muted-foreground">{planStatusLabel(plan.status)}</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">还没有执行计划。</p>}
        {canCreate ? <Link className={buttonVariants({ variant: "outline" })} href={`/execution-plans/new?strategyId=${strategy.id}&courseId=${strategy.course.id}`}><Plus data-icon="inline-start" />创建执行计划</Link> : <p className="rounded-lg bg-muted/45 px-3 py-2 text-xs text-muted-foreground">先采纳策略，才能创建执行计划。</p>}
      </CardContent>
    </Card>
  );
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <Card className="gap-3 py-5"><CardHeader className="px-5"><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-2 px-5">{items.length ? items.map((item) => <p className="flex gap-2 rounded-lg border border-border px-4 py-3 text-sm" key={item}><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />{item}</p>) : <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function MethodsCard({ strategy }: { strategy: TeachingStrategyDetail }) {
  return <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle>教学方法组合</CardTitle></CardHeader><CardContent className="space-y-4 px-5">{strategy.teaching_methods.map((method) => <div key={method.name}><div className="mb-2 flex justify-between gap-3 text-sm"><span>{method.name}</span><span>{Math.round(method.weight * 100)}%</span></div><Progress value={method.weight * 100} /></div>)}</CardContent></Card>;
}

function ResourcesCard({ strategy }: { strategy: TeachingStrategyDetail }) {
  return <Card className="gap-0 overflow-hidden py-0"><CardHeader className="border-b px-5 py-4"><CardTitle>关联资源</CardTitle></CardHeader><CardContent className="divide-y divide-border px-0">{strategy.resources.length ? strategy.resources.map((resource) => <Link className="flex items-center gap-3 px-5 py-4 hover:bg-muted/40" href={`/knowledge/resources/${resource.id}`} key={resource.id}><BookOpen className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{resource.title}</span><span className="text-xs text-muted-foreground">{resource.resource_type}</span></Link>) : <EmptyState description="当前策略没有关联资源。" title="暂无资源" />}</CardContent></Card>;
}

function EffectTab({ effect, loading, error, onRetry }: { effect: PlanEffect | null; loading: boolean; error: boolean; onRetry: () => void }) {
  if (loading) return <LoadingState label="正在读取策略效果..." />;
  if (error) return <ErrorState description="策略效果加载失败。" onRetry={onRetry} />;
  if (!effect) return <EmptyState description="后端暂未返回策略效果数据。" title="暂无实际效果" />;
  return (
    <div className="space-y-4">
      {effect.insufficient_evidence ? (
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50/55 px-5 py-4 text-sm text-orange-950">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />策略尚未产生足够执行证据</p>
          <p className="mt-1 text-xs leading-5 text-orange-800">当前只展示后端有限事实，不把 AI 预期写成实际结果，也不声明执行与变化的因果关系。</p>
        </div>
      ) : null}
      {effect.metrics.length ? (
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>实际结果</CardTitle><p className="text-xs text-muted-foreground">只展示观察到的变化，不声明因果关系。</p></CardHeader>
          <CardContent className="grid gap-3 px-5 md:grid-cols-3">
            {effect.metrics.map((metric) => <div className="rounded-lg border border-border px-4 py-4" key={metric.metric}><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-semibold">{metric.after ?? "暂无"}</p><p className="mt-1 text-xs text-muted-foreground">执行前 {metric.before ?? "暂无"} · 样本 {metric.sample_size}</p></div>)}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <ListCard title="事实变化" items={effect.facts} empty="暂无事实变化。" />
        <ListCard title="仍存在的问题" items={effect.remaining_issues} empty="后端没有标记仍存在的问题。" />
      </div>
      {effect.ai_explanation ? <Card className="gap-3 border-blue-200 bg-blue-50/45 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI 解释</CardTitle></CardHeader><CardContent className="px-5 text-sm leading-6 text-muted-foreground">{effect.ai_explanation}</CardContent></Card> : null}
    </div>
  );
}

function HistoryCard({ strategy }: { strategy: TeachingStrategyDetail }) {
  return <Card className="gap-0 overflow-hidden py-0"><CardHeader className="border-b px-5 py-4"><CardTitle>修改记录</CardTitle></CardHeader><CardContent className="divide-y divide-border px-0">{strategy.change_history.length ? strategy.change_history.map((entry) => <div className="flex items-start justify-between gap-4 px-5 py-4" key={entry.id}><div><p className="text-sm font-medium">v{entry.version} · {historyActionLabel(entry.action)}</p><p className="mt-1 text-xs text-muted-foreground">{entry.status}</p></div><p className="text-xs text-muted-foreground">{entry.created_at.slice(0, 16).replace("T", " ")}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">暂无修改记录。</p>}</CardContent></Card>;
}

function strategyStatusLabel(status: TeachingStrategyStatus) {
  const labels: Record<TeachingStrategyStatus, string> = { suggested: "AI 建议", accepted: "已采纳", planned: "已计划", active: "已启用", paused: "已暂停", completed: "已完成", dismissed: "已忽略" };
  return labels[status];
}

function strategyPriorityLabel(priority: "high" | "medium" | "low") {
  return priority === "high" ? "高优先级" : priority === "medium" ? "中优先级" : "低优先级";
}

function planStatusLabel(status: string) {
  const labels: Record<string, string> = { draft: "草稿", ready: "待执行", active: "执行中", paused: "已暂停", completed: "已完成", cancelled: "已取消" };
  return labels[status] ?? status;
}

function historyActionLabel(action: string) {
  const labels: Record<string, string> = { generated: "生成", created: "创建", updated: "更新", accept: "采纳", dismiss: "忽略", activate: "启用", pause: "暂停", resume: "继续", complete: "完成", plan_created: "创建计划", plan_published: "发布计划" };
  return labels[action] ?? action;
}
