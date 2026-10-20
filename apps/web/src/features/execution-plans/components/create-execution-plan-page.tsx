"use client";

import type {
  ExecutionPlanCreateRequest,
  ExecutionPlanWeekItem,
  PlanTaskItem,
  PlanTaskType,
  TeachingStrategyListItem,
  WeeklyPlanGeneration,
} from "@echo/shared-types";
import { ArrowLeft, ArrowRight, Check, Pencil, Save, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { useStudentAnalytics } from "@/features/students/queries";
import { useTeachingStrategies, useTeachingStrategy } from "@/features/teaching-strategies/queries";
import { canCreateExecutionPlan, teachingStrategyStatusLabel } from "@/features/teaching-strategies/view-model";
import {
  useCreateExecutionPlan,
  useExecutionPlanAction,
  useGenerateWeeklyPlan,
  useUpdateExecutionPlan,
  useUpdatePlanTask,
} from "@/features/execution-plans/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

const steps = [
  { value: 1, label: "基本信息", description: "设置计划的基本信息" },
  { value: 2, label: "选择策略", description: "选择教学策略与适用范围" },
  { value: 3, label: "计划配置", description: "设置时间、内容与资源" },
  { value: 4, label: "AI 辅助生成", description: "生成并调整执行计划" },
  { value: 5, label: "确认发布", description: "预览并发布计划" },
] as const;

const actionOptions: Array<{ value: PlanTaskType; label: string }> = [
  { value: "supplementary_practice", label: "补充练习" },
  { value: "resource_push", label: "资源推送" },
  { value: "classroom_lecture", label: "课堂讲解" },
  { value: "quick_check", label: "快速验证" },
  { value: "individual_tutoring", label: "个别辅导" },
  { value: "project_task", label: "项目任务" },
];

const metricOptions = ["quick_check_accuracy", "mastery_change", "repeated_error_count", "task_completion_rate"];

export function CreateExecutionPlanPage({
  initialCourseId,
  initialStrategyId,
  initialKnowledgePointId,
  initialStep,
}: {
  initialCourseId?: string;
  initialStrategyId?: string;
  initialKnowledgePointId?: string;
  initialStep?: number;
}) {
  const router = useRouter();
  const { courses, selectedCourseId } = useCourseWorkspace();
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId) ? initialCourseId : selectedCourseId;
  const studentsQuery = useStudentAnalytics(courseId, { includeDetails: false });
  const knowledgeQuery = useKnowledgeBaseData(courseId);
  const createMutation = useCreateExecutionPlan(courseId);
  const updateMutation = useUpdateExecutionPlan();
  const actionMutation = useExecutionPlanAction();
  const generationMutation = useGenerateWeeklyPlan();
  const taskMutation = useUpdatePlanTask();
  const [step, setStep] = useState(initialStep && initialStep >= 1 && initialStep <= 5 ? initialStep : 1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<WeeklyPlanGeneration | null>(null);
  const [handledRecommendations, setHandledRecommendations] = useState<string[]>([]);
  const [editingTask, setEditingTask] = useState<PlanTaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [weeks, setWeeks] = useState<ExecutionPlanWeekItem[]>([]);
  const [title, setTitle] = useState("");
  const [strategyId, setStrategyId] = useState(initialStrategyId ?? "");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [targetScope, setTargetScope] = useState<"whole_class" | "student_group" | "custom_students">("whole_class");
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [knowledgePointIds, setKnowledgePointIds] = useState<string[]>(initialKnowledgePointId ? [initialKnowledgePointId] : []);
  const [actions, setActions] = useState<PlanTaskType[]>(["supplementary_practice"]);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [weeklySessions, setWeeklySessions] = useState(2);
  const [exerciseCount, setExerciseCount] = useState(8);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [evaluationMetrics, setEvaluationMetrics] = useState<string[]>(["quick_check_accuracy"]);
  const [teacherNote, setTeacherNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestionStorageKey = planId && generation ? `echo.plan.suggestions:${planId}:${generation.generation_id}` : null;


  function persistHandledRecommendations(ids: string[]) {
    if (suggestionStorageKey) {
      window.localStorage.setItem(suggestionStorageKey, JSON.stringify(ids));
    }
  }

  const strategiesQuery = useTeachingStrategies(courseId);
  const strategyDetailQuery = useTeachingStrategy(strategyId || null);
  const strategies = strategiesQuery.data?.items ?? [];
  const detailStrategy = strategyDetailQuery.data;
  const selectedStrategy = strategies.find((strategy) => strategy.id === strategyId) ?? (detailStrategy ? {
    id: detailStrategy.id,
    course_id: detailStrategy.course.id,
    title: detailStrategy.title,
    description: detailStrategy.description,
    type: detailStrategy.type,
    priority: detailStrategy.priority,
    status: detailStrategy.status,
    source: detailStrategy.source,
    target_knowledge_points: detailStrategy.target_knowledge_points,
    target_student_count: detailStrategy.target_students.length,
    expected_effect: detailStrategy.expected_effect,
    updated_at: detailStrategy.updated_at,
  } satisfies TeachingStrategyListItem : null);
  const eligibleStrategies = strategies.filter((strategy) => canCreateExecutionPlan(strategy.status));
  const strategyOptions = eligibleStrategies.some((strategy) => strategy.id === selectedStrategy?.id) ? eligibleStrategies : selectedStrategy && canCreateExecutionPlan(selectedStrategy.status) ? [selectedStrategy] : [];
  const selectedStrategyEligible = Boolean(selectedStrategy && canCreateExecutionPlan(selectedStrategy.status));
  const allKnowledgePoints = useMemo(() => knowledgeQuery.chapters.flatMap((chapter) => chapter.knowledge_points), [knowledgeQuery.chapters]);
  const validKnowledgePointIds = useMemo(
    () => knowledgePointIds.filter((id) => allKnowledgePoints.some((point) => point.id === id)),
    [allKnowledgePoints, knowledgePointIds],
  );
  const students = studentsQuery.students;

  if (!courseId) return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程。" title="尚未选择课程" />;
  if ((strategiesQuery.isLoading && !strategyId) || strategyDetailQuery.isLoading || studentsQuery.isLoading || knowledgeQuery.isLoading) return <LoadingState label="正在加载计划配置..." />;
  if ((strategiesQuery.isError && !detailStrategy) || studentsQuery.isError || knowledgeQuery.isError) return <ErrorState description="计划配置数据加载失败。" onRetry={() => { void strategiesQuery.refetch(); void strategyDetailQuery.refetch(); studentsQuery.refetch(); knowledgeQuery.refetch(); }} />;

  const targetReady = targetScope === "whole_class" || targetStudentIds.length > 0;
  const canContinue = step === 1
    ? Boolean(title.trim() && startDate && endDate && startDate <= endDate && targetReady)
    : step === 2
      ? Boolean(strategyId && selectedStrategyEligible)
      : step === 3
        ? Boolean(validKnowledgePointIds.length && actions.length && evaluationMetrics.length)
        : true;
  const canSaveDraft = Boolean(title.trim() && strategyId && selectedStrategyEligible && startDate && endDate && startDate <= endDate && targetReady);

  async function ensureDraft() {
    const payload: ExecutionPlanCreateRequest = {
      strategy_id: strategyId,
      title: title.trim(),
      description: description.trim(),
      start_date: startDate,
      end_date: endDate,
      target_scope: targetScope,
      target_student_ids: targetStudentIds,
      knowledge_point_ids: validKnowledgePointIds,
      actions,
      resource_ids: resourceIds,
      plan_parameters: { weekly_sessions: weeklySessions, exercise_count: exerciseCount, difficulty },
      evaluation_metrics: evaluationMetrics,
      teacher_note: teacherNote.trim() || null,
      publish: false,
    };
    if (planId) {
      const updated = await updateMutation.mutateAsync({
        planId,
        payload: {
          title: payload.title,
          description: payload.description,
          start_date: payload.start_date,
          end_date: payload.end_date,
          target_scope: payload.target_scope,
          target_student_ids: payload.target_student_ids,
          knowledge_point_ids: payload.knowledge_point_ids,
          actions: payload.actions,
          resource_ids: payload.resource_ids,
          plan_parameters: payload.plan_parameters,
          evaluation_metrics: payload.evaluation_metrics,
          teacher_note: payload.teacher_note,
        },
      });
      return updated;
    }
    const created = await createMutation.mutateAsync(payload);
    setPlanId(created.id);
    return created;
  }

  async function nextStep() {
    setError(null);
    setMessage(null);
    try {
      if (step === 3) {
        const draft = await ensureDraft();
        setPlanId(draft.id);
        setStep(4);
        return;
      }
      if (step === 4) {
        setStep(5);
        return;
      }
      setStep((value) => Math.min(5, value + 1) as typeof step);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存执行计划失败。");
    }
  }

  async function handleGenerate() {
    if (!planId) return;
    setError(null);
    try {
      const result = await generationMutation.mutateAsync({
        planId,
        payload: { teacher_note: teacherNote.trim() || null, regenerate: Boolean(generation) },
      });
      setGeneration(result);
      setWeeks(result.weeks);
      setHandledRecommendations(readHandledRecommendationIds(planId, result));
      setMessage(`已生成 ${result.weeks.length} 周计划草案，请教师确认后再发布。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 计划生成失败。");
    }
  }

  async function handlePublish() {
    if (!planId || !weeks.length || !validKnowledgePointIds.length || !actions.length) {
      setError("发布前请确认计划已保存、至少包含 1 个知识点、1 个教学行动和 1 周周计划。");
      return;
    }
    setError(null);
    try {
      await actionMutation.mutateAsync({ planId, action: "publish" });
      router.push(`/execution-plans/${planId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "发布执行计划失败。");
    }
  }

  async function handleSaveDraft() {
    setError(null);
    try {
      const draft = await ensureDraft();
      setMessage(`草稿已保存：${draft.title}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存草稿失败。");
    }
  }

  async function adoptRecommendation(recommendationId: string, content: string) {
    if (!planId || handledRecommendations.includes(recommendationId)) return;
    const nextNote = [teacherNote.trim(), `AI 建议采纳：${content}`].filter(Boolean).join("\n\n");
    setError(null);
    try {
      await updateMutation.mutateAsync({ planId, payload: { teacher_note: nextNote } });
      setTeacherNote(nextNote);
      setHandledRecommendations((current) => {
        const next = [...current, recommendationId];
        persistHandledRecommendations(next);
        return next;
      });
      setMessage("AI 建议已写入教师备注并保存为计划草稿。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "采纳建议失败。");
    }
  }

  function ignoreRecommendation(recommendationId: string) {
    setHandledRecommendations((current) => {
      const next = [...current, recommendationId];
      persistHandledRecommendations(next);
      return next;
    });
    setMessage("已在本机记住该条 AI 建议的忽略状态；同一设备重新打开时不会再次显示，不修改服务端计划内容。");
  }

  function toggleValue<T>(value: T, values: T[], setValues: (next: T[]) => void) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  async function removeGeneratedTask(weekId: string, taskId: string) {
    if (!planId) return;
    setError(null);
    try {
      await taskMutation.mutateAsync({ planId, taskId, payload: { status: "cancelled" } });
      setWeeks((current) => current.map((week) => week.id === weekId ? { ...week, tasks: week.tasks.filter((task) => task.id !== taskId) } : week));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务取消失败。");
    }
  }

  function openTaskEditor(task: PlanTaskItem) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditDueAt(task.due_at ? task.due_at.slice(0, 16) : "");
  }

  async function saveTaskEdit() {
    if (!planId || !editingTask || !editTitle.trim()) return;
    setError(null);
    try {
      const updated = await taskMutation.mutateAsync({
        planId,
        taskId: editingTask.id,
        payload: {
          title: editTitle.trim(),
          description: editDescription.trim(),
          due_at: editDueAt ? new Date(editDueAt).toISOString() : null,
        },
      });
      setWeeks((current) => current.map((week) => ({
        ...week,
        tasks: week.tasks.map((task) => task.id === updated.id ? updated : task),
      })));
      setEditingTask(null);
      setMessage("任务内容与截止时间已保存。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务更新失败。");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">教学策略 / 创建执行计划</p>
          <h1 className="mt-2 text-2xl font-semibold">创建教学执行计划</h1>
          <p className="mt-1 text-sm text-muted-foreground">将已确认的教学策略转化为具体、可执行、可评估的教学行动。</p>
        </div>
        <Button disabled={!canSaveDraft || createMutation.isPending || updateMutation.isPending} onClick={() => void handleSaveDraft()} type="button" variant="outline"><Save data-icon="inline-start" />保存草稿</Button>
      </header>

      <PlanStepper step={step} />
      {strategiesQuery.isError && detailStrategy ? <p className="rounded-lg border border-orange-200 bg-orange-50/55 px-4 py-3 text-sm text-orange-900">策略列表暂时不可用，已从策略详情恢复当前策略，可继续完成本计划的创建。</p> : null}
      {step === 2 && selectedStrategy && !selectedStrategyEligible ? <p className="rounded-lg border-2 border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-orange-900">当前策略状态为“{teachingStrategyStatusLabel(selectedStrategy.status)}”。请先在策略详情中采纳策略，再继续创建执行计划。</p> : null}
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-5 py-5">
          <CardHeader className="px-5"><CardTitle>{steps[step - 1].label}</CardTitle><p className="text-xs text-muted-foreground">{steps[step - 1].description}</p></CardHeader>
          <CardContent className="space-y-5 px-5">
            {step === 1 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="计划名称"><Input onChange={(event) => setTitle(event.target.value)} placeholder="例如：函数与编程基础执行计划" value={title} /></Field>
                <Field label="所属课程"><Input disabled value={courses.find((course) => course.id === courseId)?.name ?? ""} /></Field>
                <Field label="开始时间"><Input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></Field>
                <Field label="结束时间"><Input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></Field>
                <div className="md:col-span-2"><Field label="计划说明"><Textarea onChange={(event) => setDescription(event.target.value)} placeholder="说明计划目标、范围和教学安排..." value={description} /></Field></div>
                <Field label="目标对象">
                  <Select items={[{ value: "whole_class", label: "全班" }, { value: "student_group", label: "关注学生群体" }, { value: "custom_students", label: "自定义学生" }]} onValueChange={(value) => value && setTargetScope(value as typeof targetScope)} value={targetScope}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="whole_class">全班</SelectItem><SelectItem value="student_group">关注学生群体</SelectItem><SelectItem value="custom_students">自定义学生</SelectItem></SelectGroup></SelectContent>
                  </Select>
                </Field>
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">当前范围</p>
                  <p className="mt-1 font-medium">{targetScopeLabel(targetScope)} · {targetScope === "whole_class" ? students.length : targetStudentIds.length} 人</p>
                </div>
                {targetScope !== "whole_class" ? <div className="grid gap-2 md:col-span-2 md:grid-cols-3">{students.map((student) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" key={student.user_id}><input checked={targetStudentIds.includes(student.user_id)} onChange={() => toggleValue(student.user_id, targetStudentIds, setTargetStudentIds)} type="checkbox" />{student.display_name}</label>)}</div> : null}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <Field label="选择教学策略">
                  <Select items={strategyOptions.map((strategy) => ({ value: strategy.id, label: strategy.title }))} onValueChange={(value) => value && setStrategyId(value)} value={strategyId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择策略" /></SelectTrigger>
                    <SelectContent><SelectGroup>{strategyOptions.map((strategy) => <SelectItem key={strategy.id} value={strategy.id}>{strategy.title}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                </Field>
                {selectedStrategy ? <StrategySummary strategy={selectedStrategy} /> : <EmptyState description="请先选择一条已采纳策略。" title="尚未选择策略" />}
                <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">目标对象已在第 1 步确定为“{targetScopeLabel(targetScope)}”，共 {targetScope === "whole_class" ? students.length : targetStudentIds.length} 人。继续下方选择策略即可。</div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-5">
                <Field label="目标知识点"><div className="grid gap-2 md:grid-cols-2">{allKnowledgePoints.map((point) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" key={point.id}><input checked={knowledgePointIds.includes(point.id)} onChange={() => toggleValue(point.id, knowledgePointIds, setKnowledgePointIds)} type="checkbox" />{point.name}</label>)}</div></Field>
                <Field label="教学行动"><div className="grid gap-2 md:grid-cols-3">{actionOptions.map((option) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" key={option.value}><input checked={actions.includes(option.value)} onChange={() => toggleValue(option.value, actions, setActions)} type="checkbox" />{option.label}</label>)}</div></Field>
                <Field label="教学资源"><div className="grid gap-2 md:grid-cols-2">{knowledgeQuery.resources.map((resource) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" key={resource.document.id}><input checked={resourceIds.includes(resource.document.id)} onChange={() => toggleValue(resource.document.id, resourceIds, setResourceIds)} type="checkbox" />{resource.document.original_name}</label>)}</div></Field>
                <div className="grid gap-4 md:grid-cols-3"><Field label="每周课时"><Input min={1} onChange={(event) => setWeeklySessions(Number(event.target.value))} type="number" value={weeklySessions} /></Field><Field label="练习题数量"><Input min={0} onChange={(event) => setExerciseCount(Number(event.target.value))} type="number" value={exerciseCount} /></Field><Field label="难度"><Select items={[{ value: "easy", label: "基础" }, { value: "medium", label: "中等" }, { value: "hard", label: "困难" }]} onValueChange={(value) => value && setDifficulty(value as typeof difficulty)} value={difficulty}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="easy">基础</SelectItem><SelectItem value="medium">中等</SelectItem><SelectItem value="hard">困难</SelectItem></SelectGroup></SelectContent></Select></Field></div>
                <Field label="评估指标"><div className="grid gap-2 md:grid-cols-2">{metricOptions.map((metric) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" key={metric}><input checked={evaluationMetrics.includes(metric)} onChange={() => toggleValue(metric, evaluationMetrics, setEvaluationMetrics)} type="checkbox" />{metricLabel(metric)}</label>)}</div></Field>
                <Field label="教师备注"><Textarea onChange={(event) => setTeacherNote(event.target.value)} value={teacherNote} /></Field>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">AI 生成的是计划草案，发布前可删除任务或重新生成。</p><Button disabled={generationMutation.isPending || !planId} onClick={() => void handleGenerate()} type="button"><Sparkles data-icon="inline-start" />{generationMutation.isPending ? "正在生成..." : generation ? "重新生成" : "生成执行计划"}</Button></div>
                {generationMutation.isError ? <ErrorState description="AI 计划生成失败，已填写内容仍然保留。" onRetry={() => void handleGenerate()} /> : null}
                {generation?.recommendations.length ? (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/45 px-4 py-4">
                    <p className="text-sm font-medium text-blue-950">ECHO 建议</p>
                    <p className="text-xs text-blue-800">建议需要教师处理；采纳后会写入计划教师备注，忽略状态仅保存在当前设备。</p>
                    <div className="space-y-2">
                      {generation.recommendations.filter((recommendation) => !handledRecommendations.includes(recommendation.id)).map((recommendation) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-background px-3 py-3" key={recommendation.id}>
                          <p className="min-w-0 flex-1 text-sm">{recommendation.content}</p>
                          <div className="flex gap-2">
                            <Button onClick={() => void adoptRecommendation(recommendation.id, recommendation.content)} size="sm" type="button">采纳</Button>
                            <Button onClick={() => ignoreRecommendation(recommendation.id)} size="sm" type="button" variant="outline">忽略</Button>
                          </div>
                        </div>
                      ))}
                      {generation.recommendations.every((recommendation) => handledRecommendations.includes(recommendation.id)) ? <p className="py-2 text-center text-xs text-muted-foreground">当前生成的建议已全部处理。</p> : null}
                    </div>
                  </div>
                ) : null}
                {weeks.length ? <div className="space-y-3">{weeks.map((week) => <div className="rounded-xl border-2 border-border p-4" key={week.id}><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">第 {week.week_number} 周 · {week.start_date} → {week.end_date}</p><StatusBadge tone="info">{`${week.tasks.length} 项任务`}</StatusBadge></div><p className="mt-2 text-sm text-muted-foreground">{week.content}</p><div className="mt-3 space-y-2">{week.tasks.map((task) => <div className="flex items-center gap-3 rounded-lg bg-muted/45 px-3 py-2 text-sm" key={task.id}><span className="min-w-0 flex-1 truncate">{task.title}</span><div className="flex shrink-0 gap-1"><Button onClick={() => openTaskEditor(task)} size="icon-sm" type="button" variant="ghost"><Pencil /></Button><Button onClick={() => void removeGeneratedTask(week.id, task.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button></div></div>)}</div></div>)}</div> : <EmptyState description="点击“生成执行计划”，由 AI 生成结构化周计划草案。" title="尚未生成周计划" />}
              </div>
            ) : null}

            {step === 5 ? <PublishSummary actions={actions} endDate={endDate} knowledgePoints={allKnowledgePoints.filter((point) => knowledgePointIds.includes(point.id)).map((point) => point.name)} planId={planId} startDate={startDate} strategy={selectedStrategy} targetCount={targetScope === "whole_class" ? students.length : targetStudentIds.length} title={title} weeks={weeks.length} /> : null}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="gap-3 py-5"><CardHeader className="px-5"><CardTitle>计划摘要</CardTitle></CardHeader><CardContent className="space-y-3 px-5 text-sm"><SummaryLine label="课程" value={courses.find((course) => course.id === courseId)?.name ?? "未选择"} /><SummaryLine label="策略" value={selectedStrategy?.title ?? "未选择"} /><SummaryLine label="周期" value={startDate && endDate ? `${startDate} → ${endDate}` : "未设置"} /><SummaryLine label="状态" value={planId ? "草稿已保存" : "尚未保存"} /></CardContent></Card>
          <Card className="gap-3 border-blue-300/70 bg-blue-50/45 py-5"><CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />ECHO 依据</CardTitle></CardHeader><CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground"><p>计划内容来自教师选择的策略、知识点、资源、学生证据和计划周期。</p><p>评估指标是目标值，不代表已经发生的实际效果。</p></CardContent></Card>
        </aside>
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2"><Link className={buttonVariants({ variant: "ghost" })} href={strategyId ? `/teaching-strategies/${strategyId}` : "/teaching-strategies"}>取消</Link><Button disabled={!canSaveDraft || createMutation.isPending || updateMutation.isPending} onClick={() => void handleSaveDraft()} type="button" variant="outline">保存草稿</Button></div>
        <div className="flex gap-2">{step > 1 ? <Button onClick={() => setStep((value) => Math.max(1, value - 1) as typeof step)} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />上一步</Button> : null}{step < 5 ? <Button disabled={!canContinue} onClick={() => void nextStep()} type="button">{step === 3 ? "保存并进入 AI 生成" : "下一步"}<ArrowRight data-icon="inline-end" /></Button> : <Button disabled={!planId || actionMutation.isPending || !weeks.length} onClick={() => void handlePublish()} type="button"><Check data-icon="inline-start" />发布执行计划</Button>}</div>
      </footer>

      <Dialog onOpenChange={(open) => { if (!open) setEditingTask(null); }} open={Boolean(editingTask)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑教学任务</DialogTitle>
            <DialogDescription>修改会通过正式任务接口保存，不改变已完成的历史学习事件。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="任务名称"><Input onChange={(event) => setEditTitle(event.target.value)} value={editTitle} /></Field>
            <Field label="任务说明"><Textarea onChange={(event) => setEditDescription(event.target.value)} value={editDescription} /></Field>
            <Field label="截止时间"><Input onChange={(event) => setEditDueAt(event.target.value)} type="datetime-local" value={editDueAt} /></Field>
          </div>
          <DialogFooter>
            <Button onClick={() => setEditingTask(null)} type="button" variant="outline">取消</Button>
            <Button disabled={!editTitle.trim() || taskMutation.isPending} onClick={() => void saveTaskEdit()} type="button">{taskMutation.isPending ? "正在保存..." : "保存任务"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function readHandledRecommendationIds(planId: string | null, generation: WeeklyPlanGeneration) {
  if (!planId) return [];
  const key = `echo.plan.suggestions:${planId}:${generation.generation_id}`;
  try {
    const stored = window.localStorage.getItem(key);
    const ids = stored ? (JSON.parse(stored) as unknown[]) : [];
    const availableIds = new Set(generation.recommendations.map((recommendation) => recommendation.id));
    return ids.filter((id): id is string => typeof id === "string" && availableIds.has(id));
  } catch {
    window.localStorage.removeItem(key);
    return [];
  }
}
function PlanStepper({ step }: { step: number }) {
  return <ol className="grid gap-2 md:grid-cols-5">{steps.map((item) => <li className={`rounded-lg border-2 px-3 py-3 ${step === item.value ? "border-primary bg-primary text-primary-foreground" : step > item.value ? "border-emerald-200 bg-emerald-50" : "border-border bg-card"}`} key={item.value}><div className="flex items-center gap-2"><span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${step === item.value ? "bg-white/20" : "bg-muted"}`}>{step > item.value ? <Check className="size-3.5" /> : item.value}</span><span className="text-sm font-medium">{item.label}</span></div></li>)}</ol>;
}

function StrategySummary({ strategy }: { strategy: TeachingStrategyListItem }) {
  return <div className="rounded-xl border-2 border-border bg-muted/20 px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{strategy.title}</p><StatusBadge tone="info">{strategyStatusLabel(strategy.status)}</StatusBadge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{strategy.description}</p><p className="mt-2 text-xs text-muted-foreground">目标学生 {strategy.target_student_count} 人 · 知识点 {strategy.target_knowledge_points.length} 个</p></div>;
}

function PublishSummary({ title, strategy, knowledgePoints, actions, targetCount, startDate, endDate, weeks, planId }: { title: string; strategy: TeachingStrategyListItem | null; knowledgePoints: string[]; actions: PlanTaskType[]; targetCount: number; startDate: string; endDate: string; weeks: number; planId: string | null }) {
  return <div className="space-y-4"><SummaryLine label="计划名称" value={title || "未填写"} /><SummaryLine label="关联策略" value={strategy?.title ?? "未选择"} /><SummaryLine label="目标学生" value={`${targetCount} 人`} /><SummaryLine label="知识点" value={knowledgePoints.join("、") || "未选择"} /><SummaryLine label="教学行动" value={actions.map(actionLabel).join("、")} /><SummaryLine label="周期" value={`${startDate} → ${endDate}`} /><SummaryLine label="周计划" value={`${weeks} 周`} /><SummaryLine label="计划 ID" value={planId ?? "尚未保存"} /></div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="max-w-[70%] text-right font-medium">{value}</span></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function actionLabel(type: PlanTaskType) {
  return actionOptions.find((option) => option.value === type)?.label ?? type;
}

function metricLabel(metric: string) {
  const labels: Record<string, string> = { quick_check_accuracy: "Quick Check 正确率", mastery_change: "知识点掌握度", repeated_error_count: "重复错误次数", task_completion_rate: "任务完成率" };
  return labels[metric] ?? metric;
}

function strategyStatusLabel(status: string) {
  const labels: Record<string, string> = { suggested: "AI 建议", accepted: "已采纳", planned: "已计划", active: "已启用", paused: "已暂停", completed: "已完成", dismissed: "已忽略" };
  return labels[status] ?? status;
}
import { targetScopeLabel } from "@/features/execution-plans/view-model";
