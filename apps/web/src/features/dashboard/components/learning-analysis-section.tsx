import type { ChapterAnalytics, DashboardLearningDifficulty } from "@echo/shared-types";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function LearningAnalysisSection({
  chapters,
  difficulties,
  courseId,
}: {
  chapters: ChapterAnalytics[];
  difficulties: DashboardLearningDifficulty[];
  courseId: string;
}) {
  const maxAffected = Math.max(...difficulties.map((item) => item.affected_students), 1);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">学习情况分析</h2>
        <p className="mt-1 text-sm text-muted-foreground">从章节掌握度和高频问题，快速了解学生学习状况。</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex h-full flex-col gap-3 py-5">
          <CardHeader className="px-5">
            <CardTitle>章节掌握度</CardTitle>
            <CardAction>
              <Link className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary")} href="/knowledge">
                查看全部 <ArrowRight data-icon="inline-end" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5">
            {chapters.slice(0, 6).map((chapter, index) => {
              const value = chapter.average_mastery ?? 0;
              const warning = chapter.average_mastery !== null && value < 60;
              return (
                <div className="grid grid-cols-[24px_minmax(0,1fr)_52px] items-center gap-3" key={chapter.chapter_id}>
                  <span className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{chapter.title}</p>
                    <Progress
                      className={cn("mt-2", warning && "[&_[data-slot=progress-indicator]]:bg-orange-500")}
                      value={value}
                    />
                  </div>
                  <span className={cn("text-right text-sm font-semibold", warning ? "text-orange-600" : "text-foreground")}>
                    {chapter.average_mastery === null ? "暂无" : `${Math.round(value)}%`}
                  </span>
                </div>
              );
            })}
            {!chapters.length ? <p className="py-8 text-center text-sm text-muted-foreground">暂无章节学情数据。</p> : null}
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col gap-3 py-5">
          <CardHeader className="px-5">
            <CardTitle>学生学习困难 TOP 5</CardTitle>
            <CardAction>
              <Link className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-primary")} href="/knowledge">
                查看全部 <ArrowRight data-icon="inline-end" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col divide-y divide-border px-5">
            {difficulties.slice(0, 5).map((item, index) => (
              <Link className="flex flex-1 items-center gap-4 py-3.5" href={`/knowledge/points/${item.knowledge_point_id}?from=dashboard&courseId=${courseId}`} key={item.knowledge_point_id}>
                <span className="w-6 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-orange-500"
                      style={{ width: `${Math.min(100, (item.affected_students / maxAffected) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">{item.affected_students} 人</span>
              </Link>
            ))}
            {!difficulties.length ? <p className="py-8 text-center text-sm text-muted-foreground">暂无困难知识点数据。</p> : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
