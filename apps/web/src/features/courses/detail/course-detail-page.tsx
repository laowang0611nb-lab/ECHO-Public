"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseDetailHeader } from "@/features/courses/detail/course-detail-header";
import { CourseKnowledgeTab } from "@/features/courses/detail/knowledge-tab";
import { CourseMaterialsTab } from "@/features/courses/detail/materials-tab";
import { CourseOverviewTab } from "@/features/courses/detail/overview-tab";
import { CourseProgressTab } from "@/features/courses/detail/progress-tab";
import { useCourseDetailData } from "@/features/courses/detail/queries";
import { CourseSettingsTab } from "@/features/courses/detail/settings-tab";
import { CourseStrategyTab } from "@/features/courses/detail/strategy-tab";
import { CourseStudentsTab } from "@/features/courses/detail/students-tab";
import { courseDetailTabs, normalizeCourseDetailTab, type CourseDetailTab } from "@/features/courses/detail/tabs";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

export function CourseDetailPage({
  courseId,
  initialTab,
}: {
  courseId: string;
  initialTab: CourseDetailTab;
}) {
  const router = useRouter();
  const {
    courses,
    selectedCourseId,
    setSelectedCourseId,
    isLoading: workspaceLoading,
    isError: workspaceError,
    refetch: refetchWorkspace,
  } = useCourseWorkspace();
  const detail = useCourseDetailData(courseId);
  const [activeTab, setActiveTab] = useState<CourseDetailTab>(initialTab);
  const course = courses.find((item) => item.id === courseId) ?? null;

  useEffect(() => {
    if (course && selectedCourseId !== courseId) {
      setSelectedCourseId(courseId);
    }
  }, [course, courseId, selectedCourseId, setSelectedCourseId]);

  function handleTabChange(value: string) {
    const next = normalizeCourseDetailTab(value);
    setActiveTab(next);
    router.replace(`/courses/${courseId}?tab=${next}`, { scroll: false });
  }

  if (workspaceLoading || detail.isLoading) {
    return <LoadingState label="正在加载课程控制中心..." />;
  }

  if (workspaceError || detail.isError) {
    return (
      <ErrorState
        description="课程详情加载失败，请确认后端服务后重试。"
        onRetry={() => {
          refetchWorkspace();
          detail.refetch();
        }}
      />
    );
  }

  if (!course) {
    return (
      <EmptyState
        action={
          <Link className={buttonVariants()} href="/courses">
            返回课程管理
          </Link>
        }
        description="当前课程不存在，或不属于当前教师账号。"
        title="未找到课程"
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Link className={buttonVariants({ variant: "ghost" })} href="/courses">
            <ArrowLeft data-icon="inline-start" />
            课程管理
          </Link>
        }
        breadcrumbs={[{ label: "课程管理", href: "/courses" }, { label: course.name }]}
        description="课程控制中心：查看教学进度、学生状态、知识结构和教学策略。"
        title={course.name}
      />

      <CourseDetailHeader
        course={course}
        onEdit={() => handleTabChange("settings")}
        overview={detail.overview}
      />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b border-border px-0" variant="line">
          {courseDetailTabs.map((tab) => (
            <TabsTrigger className="h-10 flex-none px-4" key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" && detail.overview ? (
            <CourseOverviewTab
              chapters={detail.chapters}
              course={course}
              documents={detail.documents}
              onOpenTab={(tab) => handleTabChange(tab)}
              overview={detail.overview}
            />
          ) : null}
          {activeTab === "progress" ? (
            <CourseProgressTab
              chapters={detail.overview?.chapter_mastery ?? []}
              onOpenKnowledge={() => handleTabChange("knowledge")}
            />
          ) : null}
          {activeTab === "knowledge" ? <CourseKnowledgeTab chapters={detail.chapters} /> : null}
          {activeTab === "students" ? <CourseStudentsTab course={course} members={detail.members} /> : null}
          {activeTab === "materials" ? <CourseMaterialsTab courseId={courseId} documents={detail.documents} /> : null}
          {activeTab === "strategy" ? <CourseStrategyTab course={course} policy={detail.policy} /> : null}
          {activeTab === "settings" ? <CourseSettingsTab course={course} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
