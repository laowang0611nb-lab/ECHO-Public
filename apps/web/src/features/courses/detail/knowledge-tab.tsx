import type { Chapter } from "@echo/shared-types";
import { ArrowRight, BookOpen, Layers3 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CourseKnowledgeTab({ chapters }: { chapters: Chapter[] }) {
  if (!chapters.length) {
    return (
      <EmptyState
        description="导入教材并完成 AI 解析后，章节和知识点会出现在这里。"
        title="暂无知识点结构"
      />
    );
  }

  const pointCount = chapters.reduce((total, chapter) => total + chapter.knowledge_points.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric icon={BookOpen} label="章节" value={chapters.length} />
        <Metric icon={Layers3} label="知识点" value={pointCount} />
      </div>

      <div className="space-y-3">
        {chapters.map((chapter) => (
          <Card className="gap-3 py-4" key={chapter.id}>
            <CardHeader className="px-5">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-primary">
                  {chapter.order_index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle>{chapter.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {chapter.knowledge_points.length} 个知识点
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5">
              {chapter.knowledge_points.length ? (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {chapter.knowledge_points.map((point) => (
                    <Link
                      className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                      href={`/knowledge/points/${point.id}`}
                      key={point.id}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{point.name}</span>
                        {point.description ? (
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{point.description}</span>
                        ) : null}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  当前章节尚未抽取知识点。
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <Card className="gap-2 py-4" size="sm">
      <CardContent className="flex items-center gap-4 px-5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-primary"><Icon className="size-5" /></span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
