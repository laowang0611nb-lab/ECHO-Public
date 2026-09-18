import type { Chapter } from "@echo/shared-types";
import { BookOpen, GitBranch, Layers3, Network, Sparkles } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const chapterToneClasses = [
  "border-blue-200 bg-blue-50/45",
  "border-emerald-200 bg-emerald-50/45",
  "border-orange-200 bg-orange-50/45",
  "border-violet-200 bg-violet-50/45",
  "border-rose-200 bg-rose-50/45",
  "border-cyan-200 bg-cyan-50/45",
] as const;

export function KnowledgeGraphPreview({
  courseId,
  courseName,
  chapters,
  compact = false,
}: {
  courseId: string;
  courseName: string;
  chapters: Chapter[];
  compact?: boolean;
}) {
  const visibleChapters = compact ? chapters.slice(0, 3) : chapters.slice(0, 9);
  const totalPoints = chapters.reduce((total, chapter) => total + chapter.knowledge_points.length, 0);

  if (!chapters.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-card text-primary shadow-sm ring-1 ring-border">
            <Sparkles className="size-5" />
          </span>
          <p className="mt-4 text-base font-semibold">尚未形成知识结构</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            上传并解析课程资料后，这里会按章节组织知识点。
          </p>
          <Link className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-5")} href={`/knowledge?courseId=${courseId}&tab=resources`}>
            去解析资源
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <GraphMetric icon={Network} label="章节" value={0} />
          <GraphMetric icon={Layers3} label="知识点" value={0} />
          <GraphMetric icon={GitBranch} label="知识关联" value="待接口" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("relative overflow-hidden rounded-xl border-2 border-border bg-card", compact ? "p-4" : "p-4 sm:p-5")}>
        <div className="relative pl-8">
          <span className="absolute bottom-4 left-3 top-4 w-px bg-border" />
          <div className="relative rounded-lg border-2 border-primary/25 bg-primary px-4 py-3 text-primary-foreground shadow-sm">
            <span className="absolute -left-[22px] top-6 size-3 rounded-full border-2 border-card bg-primary" />
            <p className="truncate text-sm font-semibold" title={courseName}>{courseName}</p>
            <p className="mt-1 text-xs text-primary-foreground/75">
              {chapters.length} 个章节 · {totalPoints} 个知识点
            </p>
          </div>

          <div className={cn("mt-4 grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3")}>
            {visibleChapters.map((chapter, index) => (
              <article className={cn("relative rounded-lg border-2 p-4", chapterToneClasses[index % chapterToneClasses.length])} key={chapter.id}>
                <span className={cn("absolute -left-[22px] top-6 size-2.5 rounded-full border-2 border-card", index % 2 === 0 ? "bg-primary" : "bg-muted-foreground")} />
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-xs font-semibold text-foreground shadow-sm">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={chapter.title}>{chapter.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {chapter.knowledge_points.length} 个知识点
                    </p>
                  </div>
                </div>
                {chapter.knowledge_points.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {chapter.knowledge_points.slice(0, compact ? 2 : 4).map((point) => (
                      <Link
                        className="max-w-full truncate rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary/35 hover:text-primary"
                        href={`/knowledge/points/${point.id}?from=graph&courseId=${courseId}&resourceId=${chapter.document_id}`}
                        key={point.id}
                        title={point.name}
                      >
                        {point.name}
                      </Link>
                    ))}
                    {chapter.knowledge_points.length > (compact ? 2 : 4) ? (
                      <span className="rounded-md bg-card/70 px-2 py-1 text-[11px] text-muted-foreground">
                        +{chapter.knowledge_points.length - (compact ? 2 : 4)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">暂无知识点</p>
                )}
              </article>
            ))}
          </div>

          {chapters.length > visibleChapters.length ? (
            <p className="mt-3 pl-1 text-xs text-muted-foreground">另有 {chapters.length - visibleChapters.length} 个章节未展开。</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <GraphMetric icon={Network} label="章节" value={chapters.length} />
        <GraphMetric icon={Layers3} label="知识点" value={totalPoints} />
        <GraphMetric icon={GitBranch} label="知识关联" value="待接口" />
      </div>

      {!compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="size-4 text-primary" />
            当前展示真实章节与知识点；跨知识点关系接口需求已登记。
          </p>
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/knowledge?courseId=${courseId}&tab=resources`}>
            返回资源管理
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function GraphMetric({ icon: Icon, label, value }: { icon: typeof Network; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border-2 border-border bg-card px-3 py-3">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
