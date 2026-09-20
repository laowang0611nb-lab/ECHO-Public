"use client";

import { BookOpenCheck, MessageSquare, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatCard } from "@/components/common/stat-card";
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

      <motion.section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" variants={itemVariants}>
        <StatCard
          icon={Users}
          label="活跃学生"
          supporting={`共 ${overview.stats.student_count} 名学生`}
          value={overview.stats.active_student_count}
        />
        <StatCard
          icon={MessageSquare}
          label="本周学习交互"
          supporting="过去七天课程交互"
          value={overview.stats.weekly_interaction_count}
        />
        <StatCard
          icon={BookOpenCheck}
          label="综合掌握度"
          suffix="%"
          supporting="有状态知识点的平均分"
          value={overview.stats.average_mastery}
        />
        <StatCard
          icon={TriangleAlert}
          label="待关注知识点"
          supporting={`${overview.learning_difficulties.filter((item) => item.average_score < 50).length} 个高风险`}
          tone="warning"
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
