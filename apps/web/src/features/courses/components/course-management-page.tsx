"use client";

import type { Course, ExecutionPlanStatus } from "@echo/shared-types";
import { BookOpen, CalendarDays, ClipboardList, Plus, Search, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseCard } from "@/features/courses/components/course-card";
import { summarizeCourses, useCourseManagementData } from "@/features/courses/queries";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

export function CourseManagementPage() {
  const { user } = useTeacherSession();
  const { setSelectedCourseId } = useCourseWorkspace();
  const queryClient = useQueryClient();
  const { items, isLoading, isError, refetch } = useCourseManagementData();
  const [filter, setFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [search, setSearch] = useState("");

  const publishMutation = useMutation({
    mutationFn: (courseId: string) => apiClient.publishCourse(user!.id, courseId),
    onSuccess: (course) => {
      setSelectedCourseId(course.id);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course", course.id] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (courseId: string) => apiClient.restoreCourse(user!.id, courseId),
    onSuccess: (course) => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course", course.id] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ source, name }: { source: Course; name: string }) =>
      apiClient.createCourse(user!.id, {
        name,
        description: source.description ?? undefined,
        term: source.term ?? undefined,
        course_type: source.course_type ?? undefined,
        target_audience: source.target_audience ?? undefined,
        expected_student_count: source.expected_student_count ?? undefined,
      }),
    onSuccess: (course) => {
      setSelectedCourseId(course.id);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
    },
  });

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter = filter === "all" || item.course.status === filter;
      const matchesSearch =
        !keyword ||
        item.course.name.toLowerCase().includes(keyword) ||
        item.course.code.toLowerCase().includes(keyword) ||
        (item.course.term ?? "").toLowerCase().includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [filter, items, search]);

  const upcomingPlans = useMemo(
    () =>
      items
        .flatMap((item) => item.plans.map((plan) => ({ plan, course: item.course })))
        .filter(({ plan }) => plan.status !== "completed" && plan.status !== "cancelled")
        .sort((left, right) => left.plan.start_date.localeCompare(right.plan.start_date))
        .slice(0, 5),
    [items],
  );

  const summary = summarizeCourses(items);
  const hasMasteryEvidence = items.some((item) => item.masteryValue !== null);
  const attentionValue = hasMasteryEvidence ? summary.attentionCount : "无";
  const attentionSupporting = hasMasteryEvidence ? "掌握度低于 70% 的课程" : "暂无可判断掌握度的课程";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-96" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton className="h-28" key={item} />)}
        </div>
        <Skeleton className="h-[560px]" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState description="课程列表加载失败，请确认后端服务后重试。" onRetry={refetch} />;
  }

  return (
    <motion.div animate="show" className="space-y-6" initial="hidden" variants={containerVariants}>
      <motion.div variants={itemVariants}>
        <PageHeader
          actions={
            <Link className={buttonVariants()} href="/courses/new">
              <Plus data-icon="inline-start" />
              新建课程
            </Link>
          }
          description="查看课程状态、学习证据与执行计划安排，并快速进入课程工作区。"
          title="课程管理"
        />
      </motion.div>

      {publishMutation.isError || restoreMutation.isError ? (
        <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(publishMutation.error ?? restoreMutation.error) instanceof Error ? (publishMutation.error ?? restoreMutation.error)?.message : "课程状态更新失败。"}
        </p>
      ) : null}
      {!items.length ? (
        <motion.div variants={itemVariants}>
          <EmptyState
            action={<Link className={buttonVariants()} href="/courses/new">新建课程</Link>}
            description="创建第一门课程后，可以开始导入教材并配置 AI 教学。"
            title="还没有课程"
          />
        </motion.div>
      ) : (
        <>
          <motion.section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" variants={itemVariants}>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard icon={BookOpen} label="我的课程" supporting="当前账号可管理课程" value={items.length} />
              <StatCard icon={ClipboardList} label="选课学生" supporting="课程成员去重前总量" value={summary.studentCount} />
              <StatCard
                icon={CalendarDays}
                label="平均掌握度"
                suffix="%"
                supporting="有状态知识点的平均分"
                value={summary.averageMastery}
              />
            </div>
            <StatCard
              icon={Settings}
              label="待关注课程"
              supporting={attentionSupporting}
              value={attentionValue}
            />
          </motion.section>

          <motion.div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" variants={itemVariants}>
            <section className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Tabs onValueChange={(value) => setFilter(value as typeof filter)} value={filter}>
                  <TabsList>
                    <TabsTrigger value="all">全部 {items.length}</TabsTrigger>
                    <TabsTrigger value="published">
                      已发布 {items.filter((item) => item.course.status === "published").length}
                    </TabsTrigger>
                    <TabsTrigger value="draft">
                      草稿 {items.filter((item) => item.course.status === "draft").length}
                    </TabsTrigger>
                    <TabsTrigger value="archived">
                      已归档 {items.filter((item) => item.course.status === "archived").length}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative w-full lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索课程名称 / 课程代码"
                    value={search}
                  />
                </div>
              </div>

              {filteredItems.length ? (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {filteredItems.map((item) => (
                    <CourseCard
                      duplicating={duplicateMutation.isPending && duplicateMutation.variables?.source.id === item.course.id}
                      item={item}
                      key={item.course.id}
                      onDuplicate={async (courseId, name) => {
                        const source = items.find((candidate) => candidate.course.id === courseId)?.course;
                        if (!source) throw new Error("课程不存在或已从当前列表移除。");
                        return duplicateMutation.mutateAsync({ source, name });
                      }}
                      onPublish={(courseId) => publishMutation.mutate(courseId)}
                      onRestore={(courseId) => restoreMutation.mutate(courseId)}
                      publishing={publishMutation.isPending}
                      restoring={restoreMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState description="调整搜索关键词或状态筛选后重试。" title="没有匹配课程" />
              )}
            </section>

            <aside className="space-y-4">
              <Card className="gap-3 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    近期教学安排
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">来自当前课程真实执行计划，不生成虚构日历事件。</p>
                </CardHeader>
                <CardContent className="space-y-2 px-5">
                  {upcomingPlans.length ? upcomingPlans.map(({ plan, course }) => (
                    <Link
                      className="block rounded-lg border-2 border-border px-3 py-3 transition-colors hover:border-primary/35 hover:bg-muted/35"
                      href={`/execution-plans/${plan.id}`}
                      key={plan.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{course.name}</span>
                        <StatusBadge tone={planStatusTone(plan.status)}>{planStatusLabel(plan.status)}</StatusBadge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium">{plan.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{plan.start_date} → {plan.end_date} · {plan.task_count} 项任务</p>
                    </Link>
                  )) : (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无近期执行计划。
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-3 py-5">
                <CardHeader className="px-5">
                  <CardTitle>快速操作</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 px-5">
                  <Link className={cn(buttonVariants({ variant: "outline" }), "h-auto flex-col gap-2 px-3 py-4")} href="/courses/new">
                    <Plus className="size-4" />
                    新建课程
                  </Link>
                  <Link className={cn(buttonVariants({ variant: "outline" }), "h-auto flex-col gap-2 px-3 py-4")} href="/knowledge">
                    <Upload className="size-4" />
                    上传资料
                  </Link>
                  <Link className={cn(buttonVariants({ variant: "outline" }), "h-auto flex-col gap-2 px-3 py-4")} href={items[0] ? `/courses/${items[0].course.id}?tab=settings` : "/courses"}>
                    <Settings className="size-4" />
                    课程设置
                  </Link>
                </CardContent>
              </Card>
            </aside>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function planStatusLabel(status: ExecutionPlanStatus) {
  return {
    draft: "草稿",
    ready: "待发布",
    active: "执行中",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
  }[status] ?? status;
}

function planStatusTone(status: ExecutionPlanStatus) {
  if (status === "active" || status === "completed") return "success" as const;
  if (status === "paused" || status === "draft") return "warning" as const;
  if (status === "ready") return "info" as const;
  return "neutral" as const;
}
