"use client";

import { ArrowRight, BookOpenCheck, MessageSquare, Network, Sparkles, TriangleAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

import { AnimatedNumber } from "@/components/common/animated-number";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { pageContainerVariants as containerVariants, pageItemVariants as itemVariants } from "@/components/layout/page-motion";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardFooter } from "@/features/dashboard/components/dashboard-footer";
import { EchoInsightCard } from "@/features/dashboard/components/echo-insight-card";
import { LearningAnalysisSection } from "@/features/dashboard/components/learning-analysis-section";
import { LearningTrendCard } from "@/features/dashboard/components/learning-trend-card";
import { TeacherActionSection } from "@/features/dashboard/components/teacher-action-section";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { buildDashboardViewModel } from "@/features/dashboard/view-model";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";


export function DashboardPage() {
  const { user } = useTeacherSession();
  const { selectedCourse, selectedCourseId, isLoading: coursesLoading } = useCourseWorkspace();
  const overviewQuery = useTeacherDashboardOverview(user?.id, selectedCourseId);

  if (coursesLoading) {
    return <LoadingState label="正在加载课程..." />;
  }

  if (!selectedCourseId || !selectedCourse) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          action={<Link className={buttonVariants()} href="/courses/new">创建课程</Link>}
          description="创建或加入课程后，Dashboard 会展示教学总览。"
          title="还没有可用课程"
        />
      </div>
    );
  }

  if (overviewQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-80" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton className="h-32" key={item} />)}
        </div>
        <Skeleton className="h-[410px]" />
      </div>
    );
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <ErrorState
        description="课程总览接口暂时不可用，请确认后端服务已启动。"
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const overview = overviewQuery.data;
  const viewModel = buildDashboardViewModel(overview);

  return (
    <motion.div animate="show" className="space-y-7" initial="hidden" variants={containerVariants}>
      <motion.div variants={itemVariants}>
        <PageHeader
          description={`${overview.stats.student_count} 名学生 · ${overview.stats.weekly_interaction_count} 次本周学习交互 · ${viewModel.knowledgePointCount} 个知识点`}
          title={`${selectedCourse.name} · 教学总览`}
        />
      </motion.div>

      <motion.section className="space-y-3" variants={itemVariants}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">核心能力</h2>
            <p className="mt-1 text-xs text-muted-foreground">从真实学习证据出发，查看洞察并定位课程知识关系。</p>
          </div>
          <span className="text-xs text-muted-foreground">当前课程：{selectedCourse.name}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <DashboardCapabilityCard
            description={viewModel.topDifficulty
              ? `优先关注「${viewModel.topDifficulty.name}」，当前平均掌握度 ${Math.round(viewModel.topDifficulty.average_score)}%，影响 ${viewModel.topDifficulty.affected_students} 名学生。`
              : "暂无可展示的薄弱知识点，仍可进入 AI 教学洞察查看真实证据与分析状态。"}
            href={`/ai-insights?courseId=${selectedCourseId}`}
            icon={Sparkles}
            label="AI 教学洞察"
            metric={overview.stats.attention_knowledge_point_count}
            metricLabel="个待关注知识点"
          />
          <DashboardCapabilityCard
            description="从课程知识点与真实关系出发，进入完整图谱定位风险、查看掌握度和上下文。"
            href={`/knowledge?courseId=${selectedCourseId}&tab=graph`}
            icon={Network}
            label="课程知识图谱"
            metric={viewModel.knowledgePointCount}
            metricLabel="个课程知识点"
          />
        </div>
      </motion.section>

      <motion.section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={itemVariants}>
        <DashboardMetricCard
          icon={Users}
          label="活跃学生"
          supporting={`共 ${overview.stats.student_count} 名学生`}
          tone="blue"
          value={overview.stats.active_student_count}
        />
        <DashboardMetricCard
          icon={MessageSquare}
          label="本周学习交互"
          supporting="过去七天课程交互"
          tone="sky"
          value={overview.stats.weekly_interaction_count}
        />
        <DashboardMetricCard
          icon={BookOpenCheck}
          label="综合掌握度"
          suffix="%"
          supporting="有状态知识点的平均分"
          tone="emerald"
          value={overview.stats.average_mastery}
        />
        <DashboardMetricCard
          icon={TriangleAlert}
          label="待关注知识点"
          supporting={`${overview.learning_difficulties.filter((item) => item.average_score < 50).length} 个高风险`}
          tone="amber"
          value={overview.stats.attention_knowledge_point_count}
        />
      </motion.section>

      <motion.section className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(340px,0.8fr)]" variants={itemVariants}>
        <LearningTrendCard currentMastery={overview.stats.average_mastery} data={overview.trend} />
        <EchoInsightCard difficulties={overview.learning_difficulties} insight={overview.insight} />
      </motion.section>

      <motion.div variants={itemVariants}>
        <LearningAnalysisSection chapters={overview.chapter_mastery} courseId={selectedCourseId} difficulties={overview.learning_difficulties} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <TeacherActionSection courseId={selectedCourseId} overview={overview} />
      </motion.div>

      <DashboardFooter />
    </motion.div>
  );
}

type DashboardMetricTone = "blue" | "sky" | "emerald" | "amber";
function DashboardCapabilityCard({
  description,
  href,
  icon: Icon,
  label,
  metric,
  metricLabel,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
  metric: number;
  metricLabel: string;
}) {
  return (
    <Link className="group block h-full" href={href}>
      <Card className="relative h-full gap-4 overflow-hidden border-blue-200/80 bg-gradient-to-br from-white via-blue-50/45 to-cyan-50/35 py-5 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[0_18px_40px_rgba(47,124,246,0.12)]">
        <CardContent className="flex h-full flex-col px-5">
          <div className="flex items-start justify-between gap-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(47,124,246,0.22)]">
              <Icon className="size-5" />
            </span>
            <span className="text-right">
              <strong className="block text-2xl font-semibold leading-none">{metric}</strong>
              <span className="mt-1 block text-[11px] text-muted-foreground">{metricLabel}</span>
            </span>
          </div>
          <div className="mt-5">
            <h3 className="text-lg font-semibold">{label}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-primary">进入模块 <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
        </CardContent>
      </Card>
    </Link>
  );
}


const metricToneClasses: Record<DashboardMetricTone, { bar: string; icon: string }> = {
  blue: { bar: "bg-blue-500", icon: "bg-blue-50 text-blue-600" },
  sky: { bar: "bg-sky-500", icon: "bg-sky-50 text-sky-700" },
  emerald: { bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-700" },
  amber: { bar: "bg-amber-500", icon: "bg-amber-50 text-amber-700" },
};

function DashboardMetricCard({
  label,
  value,
  suffix,
  supporting,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  supporting: string;
  icon: LucideIcon;
  tone: DashboardMetricTone;
}) {
  const toneClass = metricToneClasses[tone];

  return (
    <Card className="relative min-w-0 gap-3 overflow-hidden py-4" size="sm">
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", toneClass.bar)} />
      <CardHeader className="flex flex-row items-center gap-3 px-4">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", toneClass.icon)}>
          <Icon className="size-4" />
        </span>
        <CardTitle className="min-w-0 truncate text-xs font-medium text-muted-foreground" title={label}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-3xl font-semibold tracking-tight">
          {typeof value === "number" || value === null ? <AnimatedNumber suffix={suffix} value={value} /> : <span>{value}{suffix}</span>}
        </p>
        <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground" title={supporting}>
          {supporting}
        </p>
      </CardContent>
    </Card>
  );
}
