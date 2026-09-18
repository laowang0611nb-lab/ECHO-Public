"use client";

import type { DemoDatasetStatus } from "@echo/shared-types";
import { ArrowRight, CheckCircle2, FlaskConical, Play, RotateCcw, ServerCog, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useDemoMode } from "@/features/demo/demo-provider";
import { useDemoStatus, useResetDemoData, useSimulateDemoLearningEvent } from "@/features/demo/queries";
import { buildDemoScenarios, type DemoScenario } from "@/features/demo/scenarios";
import { useSystemStatus } from "@/features/server-settings/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

export function DemoModePage() {
  const router = useRouter();
  const { setSelectedCourseId } = useCourseWorkspace();
  const demoStatus = useDemoStatus();
  const system = useSystemStatus();
  const resetDemo = useResetDemoData();
  const demo = useDemoMode();
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scenarios = buildDemoScenarios(demoStatus.data);

  const simulateEvent = useSimulateDemoLearningEvent(demoStatus.data?.course_id ?? null);

  if (demoStatus.isLoading) return <LoadingState label="正在读取 Demo 数据集..." />;

  async function ensureSeeded() {
    if (demoStatus.data?.seeded) return demoStatus.data;
    const next = await resetDemo.mutateAsync();
    return next;
  }

  async function startScenario(scenario: DemoScenario) {
    setError(null);
    try {
      const status = await ensureSeeded();
      if (status.course_id) setSelectedCourseId(status.course_id);
      demo.startDemo(demo.mode, scenario.id, scenario.context);
      router.push(scenario.href);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "演示数据准备失败。");
    }
  }

  async function startFullDemo() {
    const first = scenarios[0];
    if (!first) return;
    await startScenario(first);
  }

  async function resetData() {
    setError(null);
    setMessage(null);
    try {
      const status = await resetDemo.mutateAsync();
      setMessage(`演示数据已恢复：${status.student_count} 名学生、${status.learning_event_count} 条学习事件。`);
      setResetOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重置 Demo 数据失败。");
    }
  }

  async function simulateQuickCheck() {
    const status = demoStatus.data;
    if (!status?.student_id || !status.knowledge_point_id) {
      setError("演示数据集缺少学生或知识点，无法生成 LearningEvent。");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await simulateEvent.mutateAsync({
        student_id: status.student_id,
        knowledge_point_id: status.knowledge_point_id,
        plan_id: status.plan_id,
        task_id: status.plan_task_id,
        week_number: 1,
        event_type: "quiz_correct",
        evidence: "DEMO 演示数据：模拟学生完成边界值 Quick Check。",
        metadata_json: { demo: true, seed: false, simulated: true },
      });
      setMessage("已生成一条标记为演示数据的 LearningEvent，可在执行计划效果中查看。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模拟 LearningEvent 失败。");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={<div className="flex flex-wrap gap-2"><Link className={buttonVariants({ variant: "outline" })} href="/settings/server"><ServerCog data-icon="inline-start" />服务器设置</Link><Button onClick={() => void startFullDemo()} type="button"><Play data-icon="inline-start" />开始完整演示</Button></div>}
        breadcrumbs={[{ label: "我的", href: "/me" }, { label: "Demo 模式" }]}
        description="加载隔离的示例数据，按推荐流程展示 ECHO 从课程配置到教学效果评估的完整过程。"
        title="Demo 模式"
      />

      {demo.active ? <div className="rounded-xl border-2 border-violet-200 bg-violet-50/60 px-5 py-4 text-sm text-violet-950"><p className="font-semibold">DEMO · 当前为演示数据</p><p className="mt-1 text-xs text-violet-800">所有掌握度、LearningEvent 和效果评估均来自隔离演示数据集，不代表真实学生。</p></div> : null}
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        <div className="space-y-5">
          <Card className="gap-5 border-blue-200 bg-blue-50/45 py-5">
            <CardContent className="px-5">
              <StatusBadge tone="info">DEMO MODE</StatusBadge>
              <h2 className="mt-3 text-2xl font-semibold text-blue-950">一键演示 ECHO 的完整教学闭环</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-900">固定六个场景，全部进入正式页面；Demo 只负责准备上下文和数据标记，不创建第二套业务系统。</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={resetDemo.isPending} onClick={() => void startFullDemo()} type="button"><Play data-icon="inline-start" />开始完整演示</Button>
                <span className="text-xs text-blue-800">预计 6–8 分钟</span>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2">
            {scenarios.map((scenario) => <ScenarioCard key={scenario.id} onStart={startScenario} scenario={scenario} />)}
          </section>
        </div>

        <aside className="space-y-5">
          <Card className="gap-4 py-5">
            <CardHeader className="px-5"><CardTitle>演示控制</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-5">
              <div className="flex items-center justify-between gap-4">
                <div><p className="text-sm font-medium">稳定 AI 模式</p><p className="mt-1 text-xs text-muted-foreground">Demo 核心路径优先使用预置策略与执行计划。</p></div>
                <Switch checked={demo.mode === "stable"} onCheckedChange={(checked) => demo.setMode(checked ? "stable" : "live")} />
              </div>
              <StatusBadge tone={demo.mode === "stable" ? "info" : "success"}>{demo.mode === "stable" ? "Demo Stable Mode" : "Live Mode · 真实 Qwen"}</StatusBadge>
              <Button className="w-full" disabled={resetDemo.isPending} onClick={() => void simulateQuickCheck()} type="button" variant="outline"><CheckCircle2 data-icon="inline-start" />模拟一次 Quick Check</Button>
              <Button className="w-full" onClick={() => router.push("/settings/server?tab=network")} type="button" variant="outline"><Users data-icon="inline-start" />查看学生端连接地址</Button>
              <Button className="w-full" onClick={() => setResetOpen(true)} type="button" variant="outline"><RotateCcw data-icon="inline-start" />重置演示数据</Button>
              <Button className="w-full" onClick={demo.stopDemo} type="button" variant="ghost">退出 Demo 模式</Button>
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5"><CardTitle>演示环境</CardTitle></CardHeader>
            <CardContent className="space-y-3 px-5">
              <EnvironmentLine label="Local Server" value={system.data ? system.data.status : "检测中"} />
              <EnvironmentLine label="Demo 数据" value={demoStatus.data?.seeded ? "已就绪" : "等待初始化"} />
              <EnvironmentLine label="AI 模式" value={demo.mode === "stable" ? "稳定模式" : "实时模式"} />
              <EnvironmentLine label="学生端连接" value={system.data?.lan.student_api_base_url ?? "未检测到"} />
              <Link className={buttonVariants({ variant: "outline" })} href={demoStatus.data?.plan_id ? `/execution-plans/${demoStatus.data.plan_id}?tab=effect&demo=1` : "/settings/server"}>查看效果入口<ArrowRight data-icon="inline-end" /></Link>
            </CardContent>
          </Card>

          <Card className="gap-3 border-violet-200 bg-violet-50/45 py-5">
            <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-violet-600" />数据隔离</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-5 text-sm leading-6 text-violet-900">
              <p>独立 Demo 课程与演示账号命名空间。</p>
              <p>重置仅重建该演示数据集，不触碰真实课程。</p>
              <p>模拟事件写入 `metadata_json.demo=true` 与明确证据说明。</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog onOpenChange={setResetOpen} open={resetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确定重置 Demo 数据？</DialogTitle><DialogDescription>只会恢复独立演示课程、学生、学习事件、审核记录、策略和执行计划，不会影响真实课程。</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setResetOpen(false)} type="button" variant="outline">取消</Button><Button disabled={resetDemo.isPending} onClick={() => void resetData()} type="button">{resetDemo.isPending ? "正在恢复..." : "确认重置"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScenarioCard({ scenario, onStart }: { scenario: DemoScenario; onStart: (scenario: DemoScenario) => Promise<void> }) {
  return (
    <article className="flex min-h-44 flex-col rounded-xl border-2 border-border bg-card p-5">
      <p className="text-xs font-semibold text-primary">{String(scenario.order).padStart(2, "0")}</p>
      <h3 className="mt-3 text-base font-semibold">{scenario.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{scenario.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{scenario.duration}</span><Button onClick={() => void onStart(scenario)} size="sm" type="button" variant="outline">进入场景<ArrowRight data-icon="inline-end" /></Button></div>
    </article>
  );
}

function EnvironmentLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="max-w-[65%] break-all text-right font-medium">{value}</span></div>;
}

export function DemoStatusSummary({ status }: { status: DemoDatasetStatus | null | undefined }) {
  if (!status) return null;
  return <span>{status.student_count} 名学生 · {status.learning_event_count} 条学习事件</span>;
}
