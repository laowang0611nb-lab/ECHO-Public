import type { Chapter } from "@echo/shared-types";
import { ChevronDown, ChevronRight, Hash } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buildPointHref } from "@/features/knowledge/view-model";
import { cn } from "@/lib/utils";

export function ChapterTree({
  chapters,
  courseId,
  resourceId,
  currentPointId,
  from = "resource",
  className,
}: {
  chapters: Chapter[];
  courseId: string;
  resourceId?: string;
  currentPointId?: string;
  from?: string;
  className?: string;
}) {
  const [openIds, setOpenIds] = useState<string[]>(chapters.slice(0, 1).map((chapter) => chapter.id));

  if (!chapters.length) {
    return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">暂无章节结构</p>;
  }

  function toggle(chapterId: string) {
    setOpenIds((current) => current.includes(chapterId) ? current.filter((id) => id !== chapterId) : [...current, chapterId]);
  }

  return (
    <div className={cn("divide-y divide-border rounded-lg border border-border bg-card", className)}>
      {chapters.map((chapter) => {
        const open = openIds.includes(chapter.id);
        return (
          <section key={chapter.id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => toggle(chapter.id)} type="button">
              {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{chapter.title}</span>
              <span className="text-xs text-muted-foreground">{chapter.knowledge_points.length} 个知识点</span>
            </button>
            {open ? (
              <div className="border-t border-border bg-muted/20 px-4 py-2">
                {chapter.knowledge_points.length ? chapter.knowledge_points.map((point) => (
                  <Link
                    className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-card", currentPointId === point.id && "bg-blue-50 text-primary")}
                    href={buildPointHref(point.id, { from, courseId, resourceId })}
                    key={point.id}
                  >
                    <Hash className="size-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{point.name}</span>
                  </Link>
                )) : (
                  <p className="px-3 py-3 text-xs text-muted-foreground">当前章节尚未抽取知识点。</p>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
