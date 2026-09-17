"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StudentAiEvaluation,
  StudentAssignmentsTab,
  StudentBehaviorTab,
  StudentConversationsTab,
  StudentMasteryTab,
  StudentOverview,
  TeacherNotesTab,
} from "@/features/students/components/student-detail-tabs";
import { useStudentDetail } from "@/features/students/queries";
import type { StudentDetailTab } from "@/features/students/types";
import { masteryStatus, statusLabel, statusTone } from "@/features/students/view-model";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "学习概览" },
  { value: "mastery", label: "知识点掌握" },
  { value: "behavior", label: "学习行为" },
  { value: "conversations", label: "对话记录" },
  { value: "assignments", label: "作业与测验" },
  { value: "ai", label: "AI 评价" },
  { value: "notes", label: "教师备注" },
] as const;

export function StudentDetailPage({
  studentId,
  initialTab,
  from,
  courseId: requestedCourseId,
}: {
  studentId: string;
  initialTab: StudentDetailTab;
  from: string;
  courseId?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudentDetailTab>(initialTab);
  const data = useStudentDetail(studentId);
  const context = data.course && data.member && data.detail
    ? {
        course: data.course,
        member: data.member,
        detail: data.detail,
        chapters: data.chapters,
        chapterAnalytics: data.chapterAnalytics,
        masteryStates: data.masteryStates,
        studentConversations: data.studentConversations,
        reviewFlags: data.reviewFlags,
      }
    : null;

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as StudentDetailTab) : "overview";
    setActiveTab(next);
    const params = new URLSearchParams();
    params.set("from", from);
    const courseId = context?.course.id ?? requestedCourseId;
    if (courseId) params.set("courseId", courseId);
    params.set("tab", next);
    router.replace(`/students/${studentId}?${params.toString()}`, { scroll: false });
  }

  if (data.isLoading) return <LoadingState label="正在加载学生学情..." />;
  if (data.isError) return <ErrorState description="学生学情加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;
  if (!context) {
    return <EmptyState action={<Link className={buttonVariants()} href="/students">返回学生学情</Link>} description="学生不存在，或不属于当前教师可管理的课程。" title="未找到学生" />;
  }

  const status = masteryStatus(context.detail.average_mastery);
  const breadcrumbs = from === "course"
    ? [{ label: "课程管理", href: "/courses" }, { label: context.course.name, href: `/courses/${context.course.id}?tab=students` }, { label: context.member.display_name }]
    : [{ label: "学生学情", href: "/students" }, { label: context.member.display_name }];

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <button className={cn(buttonVariants({ variant: "ghost" }))} onClick={() => router.back()} type="button"><ArrowLeft data-icon="inline-start" />返回</button>
            {data.previousStudent ? <Link className={buttonVariants({ variant: "outline" })} href={`/students/${data.previousStudent.user_id}?from=${from}&courseId=${context.course.id}&tab=${activeTab}`}>上一个学生</Link> : null}
            {data.nextStudent ? <Link className={buttonVariants({ variant: "outline" })} href={`/students/${data.nextStudent.user_id}?from=${from}&courseId=${context.course.id}&tab=${activeTab}`}>下一个学生</Link> : null}
          </div>
        }
        breadcrumbs={breadcrumbs}
        description={`${context.course.name} · ${context.member.joined_at.slice(0, 10)} 加入`}
        title={context.member.display_name}
      />

      <StudentProfileHeader context={context} status={status} />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b border-border px-0" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 flex-none px-4" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? <StudentOverview context={context} /> : null}
          {activeTab === "mastery" ? <StudentMasteryTab context={context} onChanged={data.refetch} /> : null}
          {activeTab === "behavior" ? <StudentBehaviorTab context={context} /> : null}
          {activeTab === "conversations" ? <StudentConversationsTab context={context} /> : null}
          {activeTab === "assignments" ? <StudentAssignmentsTab context={context} /> : null}
          {activeTab === "ai" ? <StudentAiEvaluation context={context} /> : null}
          {activeTab === "notes" ? <TeacherNotesTab context={context} onChanged={data.refetch} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StudentProfileHeader({
  context,
  status,
}: {
  context: NonNullable<ReturnType<typeof useStudentDetail>["course"]> extends never ? never : {
    course: NonNullable<ReturnType<typeof useStudentDetail>["course"]>;
    member: NonNullable<ReturnType<typeof useStudentDetail>["member"]>;
    detail: NonNullable<ReturnType<typeof useStudentDetail>["detail"]>;
    chapters: ReturnType<typeof useStudentDetail>["chapters"];
    masteryStates: ReturnType<typeof useStudentDetail>["masteryStates"];
    reviewFlags: ReturnType<typeof useStudentDetail>["reviewFlags"];
    chapterAnalytics: ReturnType<typeof useStudentDetail>["chapterAnalytics"];
  };
  status: ReturnType<typeof masteryStatus>;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5 xl:grid-cols-[minmax(0,1fr)_520px] xl:p-6">
      <div className="flex min-w-0 gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl font-semibold text-primary">{context.member.display_name.slice(0, 1)}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
            <span className="text-xs text-muted-foreground">学号 {context.member.user_id.slice(0, 8)}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">掌握判断来自后端状态与 LearningEvent，不根据聊天次数直接推断。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge tone={context.detail.recent_evidence.length ? "success" : "neutral"}>{context.detail.recent_evidence.length ? "有学习证据" : "暂无学习证据"}</StatusBadge>
            <StatusBadge tone={context.reviewFlags.length ? "warning" : "neutral"}>{context.reviewFlags.length ? `${context.reviewFlags.length} 条审核证据` : "暂无审核证据"}</StatusBadge>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeaderMetric label="总体掌握" value={context.detail.average_mastery === null ? "暂无" : `${Math.round(context.detail.average_mastery)}%`} />
        <HeaderMetric label="学习证据" value={context.detail.recent_evidence.length} />
        <HeaderMetric label="知识点" value={context.masteryStates.length} />
        <HeaderMetric label="对话证据" value={context.reviewFlags.length} />
      </div>
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg bg-muted/60 px-4 py-4"><p className="text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}
