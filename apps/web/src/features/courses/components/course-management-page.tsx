"use client";

import { BookOpen, CalendarDays, ClipboardList, Plus, Search, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatCard } from "@/components/common/stat-card";
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
          description="查看课程状态、教学进度与近期安排，并快速进入课程工作区。"
          title="课程管理"
        />
      </motion.div>

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
              tone="warning"
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
                      item={item}
                      key={item.course.id}
                      onPublish={(courseId) => publishMutation.mutate(courseId)}
                      publishing={publishMutation.isPending}
                      onRestore={(courseId) => restoreMutation.mutate(courseId)}
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
                </CardHeader>
                <CardContent className="px-5">
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    当前后端未提供教学日历接口。
                  </div>
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
