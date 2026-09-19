import type { Chapter, Course, CourseDocument, TeacherDashboardOverview } from "@echo/shared-types";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Layers3,
  Library,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  Waypoints,
} from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { chapterStatus, masteryTone, referenceChapter, referenceProgress } from "@/features/courses/detail/utils";
import { localizeInsightSummary } from "@/features/dashboard/view-model";
import { cn } from "@/lib/utils";

export function CourseOverviewTab({
  course,
  overview,
  chapters,
  documents,
  onOpenTab,
}: {
  course: Course;
  overview: TeacherDashboardOverview;
  chapters: Chapter[];
  documents: CourseDocument[];
  onOpenTab: (tab: "progress" | "knowledge" | "students" | "materials" | "strategy") => void;
}) {
  const knowledgePointCount = chapters.reduce(
    (total, chapter) => total + chapter.knowledge_points.length,
    0,
  );
  const chapterAnalytics = overview.chapter_mastery;
  const currentChapter = referenceChapter(chapterAnalytics);
  const progress = referenceProgress(chapterAnalytics);
  const activeRatio = overview.stats.student_count
    ? Math.round((overview.stats.active_student_count / overview.stats.student_count) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={Users} label="学生人数" supporting="当前课程成员" value={overview.stats.student_count} />
        <StatCard icon={BookOpen} label="章节数" supporting="已识别课程结构" value={chapters.length} />
        <StatCard icon={Layers3} label="知识点数" supporting="可用于教学与检索" value={knowledgePointCount} />
        <StatCard icon={Library} label="课程资料" supporting="已上传并纳入管理" value={documents.length} />
        <StatCard
          icon={GraduationCap}
          label="平均掌握度"
          suffix="%"
          supporting="有状态知识点的平均分"
          value={overview.stats.average_mastery}
        />
        <StatCard
          icon={ClipboardCheck}
          label="活跃学生"
          supporting={`当前活跃度 ${activeRatio}%`}
          tone={activeRatio < 40 ? "warning" : "default"}
          value={overview.stats.active_student_count}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>教学进度参考</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">根据真实章节活跃度推算，不代表后端已完成状态。</p>
              </div>
              <StatusBadge tone="info">参考值</StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold">{progress}%</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentChapter
                    ? `第 ${currentChapter.order_index + 1} / ${chapterAnalytics.length} 章`
                    : "暂无章节进度"}
                </p>
              </div>
              <p className="max-w-[150px] text-right text-xs leading-5 text-muted-foreground">
                {currentChapter?.title ?? "上传教材后可生成教学章节"}
              </p>
            </div>
            <Progress className="mt-5" value={progress} />
            <div className="mt-5 space-y-3">
              {chapterAnalytics.slice(0, 4).map((chapter) => (
                <div className="flex items-center gap-3" key={chapter.chapter_id}>
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">第 {chapter.order_index + 1} 章</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{chapter.title}</span>
                  <StatusBadge tone={chapterStatus(chapter) === "需要关注" ? "danger" : chapterStatus(chapter) === "进行中" ? "info" : "neutral"}>
                    {chapterStatus(chapter)}
                  </StatusBadge>
                </div>
              ))}
              {!chapterAnalytics.length ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  尚无章节分析数据。
                </p>
              ) : null}
            </div>
            <button className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary" onClick={() => onOpenTab("progress")} type="button">
              查看完整教学进度 <ArrowRight className="size-4" />
            </button>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>学生学习概览</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">活跃度来自当前课程真实学习统计。</p>
          </CardHeader>
          <CardContent className="px-5">
            <div className="flex items-center justify-center py-3">
              <div
                className="relative flex size-40 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(#2f7cf6 ${activeRatio}%, #e5eaf2 ${activeRatio}% 100%)` }}
              >
                <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card text-center">
                  <span className="text-3xl font-semibold">{overview.stats.active_student_count}</span>
                  <span className="mt-1 text-xs text-muted-foreground">活跃 / {overview.stats.student_count} 学生</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <MiniMetric label="近 7 天提问" value={overview.stats.weekly_interaction_count} />
              <MiniMetric label="待审核回答" value={overview.stats.pending_review_count} />
              <MiniMetric label="关注知识点" value={overview.stats.attention_knowledge_point_count} tone="warning" />
              <MiniMetric label="活跃度" suffix="%" value={activeRatio} />
            </div>
            <button className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary" onClick={() => onOpenTab("students")} type="button">
              查看学生管理 <ArrowRight className="size-4" />
            </button>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>知识点掌握情况</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">按章节掌握度展示真实分析结果。</p>
              </div>
              <StatusBadge tone={masteryTone(overview.stats.average_mastery)}>
                {overview.stats.average_mastery === null ? "暂无" : `平均 ${Math.round(overview.stats.average_mastery)}%`}
              </StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            {chapterAnalytics.slice(0, 5).map((chapter) => (
              <div key={chapter.chapter_id}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{chapter.title}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {chapter.average_mastery === null ? "暂无" : `${Math.round(chapter.average_mastery)}%`}
                  </span>
                </div>
                <Progress className="h-1.5" value={chapter.average_mastery ?? 0} />
              </div>
            ))}
            {!chapterAnalytics.length ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                尚无知识点掌握数据。
              </p>
            ) : null}
            <button className="inline-flex items-center gap-1 text-sm font-medium text-primary" onClick={() => onOpenTab("knowledge")} type="button">
              查看知识点结构 <ArrowRight className="size-4" />
            </button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-orange-500" />
              待处理事项
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">来自真实学习困难与教师行动建议。</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            {overview.teacher_actions.length ? overview.teacher_actions.slice(0, 4).map((action) => (
<ActionItem action={action.action_type} courseId={course.id} key={`${action.action_type}-${action.target_id ?? "general"}`} priority={action.priority} targetId={action.target_id} />
            )) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                当前没有新的待处理事项。
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 border-blue-100 bg-blue-50/35 py-5">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              ECHO 教学洞察
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">基于当前课程真实学习证据生成。</p>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            <div className="rounded-lg border border-blue-100 bg-card/70 p-4 text-sm leading-6">
              {localizeInsightSummary(overview.insight.summary)}
            </div>
            {overview.learning_difficulties.slice(0, 3).map((difficulty) => (
              <Link className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-blue-200" href={`/knowledge/points/${difficulty.knowledge_point_id}?from=course&courseId=${course.id}`} key={difficulty.knowledge_point_id}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{difficulty.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {difficulty.affected_students} 名学生需要关注 · 平均 {Math.round(difficulty.average_score)}%
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-primary" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle>快捷操作</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 sm:grid-cols-2 xl:grid-cols-5">
          <button className={quickActionClass} onClick={() => onOpenTab("materials")} type="button"><Upload className="size-4 text-primary" />上传课程资料</button>
          <button className={quickActionClass} onClick={() => onOpenTab("students")} type="button"><UserPlus className="size-4 text-primary" />管理学生成员</button>
          <Link className={quickActionClass} href={`/knowledge?courseId=${course.id}`}><Library className="size-4 text-primary" />查看知识库</Link>
          <Link className={quickActionClass} href={`/ai-insights?courseId=${course.id}`}><Sparkles className="size-4 text-primary" />查看教学洞察</Link>
          <button className={quickActionClass} onClick={() => onOpenTab("strategy")} type="button"><Waypoints className="size-4 text-primary" />调整教学策略</button>
        </CardContent>
      </Card>
    </div>
  );
}

const quickActionClass = cn(
  buttonVariants({ variant: "outline" }),
  "h-auto justify-start gap-3 px-4 py-4 text-left",
);

function MiniMetric({ label, value, suffix = "", tone = "default" }: { label: string; value: number; suffix?: string; tone?: "default" | "warning" }) {
  return (
    <div className={cn("rounded-lg bg-muted/60 px-3 py-3", tone === "warning" && "bg-orange-50")}>
      <p className={cn("text-lg font-semibold", tone === "warning" && "text-orange-700")}>
        {value}{suffix}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionItem({ action, courseId, targetId, priority }: { action: "review_flags" | "support_knowledge_point" | "encourage_inactive_students"; courseId: string; targetId: string | null; priority: "low" | "medium" | "high" }) {
  const config = {
    review_flags: { title: "处理待审核 AI 回答", href: "/ai-review" },
    support_knowledge_point: { title: "为薄弱知识点安排教学干预", href: targetId ? `/knowledge/points/${targetId}?from=course&courseId=${courseId}` : "/knowledge" },
    encourage_inactive_students: { title: "关注近期不活跃学生", href: "/students" },
  } as const;
  const item = config[action];

  return (
    <Link className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/30" href={item.href}>
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn("size-2 shrink-0 rounded-full", priority === "high" ? "bg-red-500" : priority === "medium" ? "bg-orange-400" : "bg-blue-500")} />
        <span className="truncate text-sm">{item.title}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
