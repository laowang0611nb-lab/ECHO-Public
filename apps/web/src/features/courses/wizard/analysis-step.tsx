import { CheckCircle2, Circle, LoaderCircle, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CourseAnalysisState } from "@/features/courses/wizard/types";

const stages = ["文档解析", "章节识别", "知识块切分", "向量化入库"] as const;
const stageOrder = ["parsing", "structuring", "chunking", "embedding"] as const;

export function AnalysisStep({
  analysis,
  onStart,
  onContinue,
}: {
  analysis: CourseAnalysisState;
  onStart: () => void;
  onContinue: () => void;
}) {
  const currentIndex = stageOrder.indexOf(analysis.stage as (typeof stageOrder)[number]);
  const progress = analysis.stage === "done" ? 100 : analysis.stage === "idle" ? 0 : Math.max(10, (currentIndex + 1) * 25);

  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle>3 AI 解析</CardTitle>
        <p className="text-sm text-muted-foreground">系统将解析教材并生成课程章节、知识点与向量索引。</p>
      </CardHeader>
      <CardContent className="space-y-6 px-6">
        <Progress value={progress} />
        <div className="grid gap-3 sm:grid-cols-4">
          {stages.map((label, index) => {
            const done = analysis.stage === "done" || (currentIndex >= 0 && index < currentIndex);
            const active = index === currentIndex && analysis.stage !== "done";
            return (
              <div className={cn("rounded-lg border px-4 py-3", active ? "border-blue-200 bg-blue-50" : "border-border bg-card")} key={label}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : active ? <LoaderCircle className="size-4 animate-spin text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {analysis.stage === "done" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/60 p-4"><p className="text-xs text-muted-foreground">章节</p><p className="mt-2 text-2xl font-semibold">{analysis.chapters.length}</p></div>
            <div className="rounded-lg bg-muted/60 p-4"><p className="text-xs text-muted-foreground">知识点</p><p className="mt-2 text-2xl font-semibold">{analysis.chapters.reduce((sum, chapter) => sum + chapter.knowledge_points.length, 0)}</p></div>
            <div className="rounded-lg bg-muted/60 p-4"><p className="text-xs text-muted-foreground">知识块</p><p className="mt-2 text-2xl font-semibold">{analysis.chunkCount}</p></div>
          </div>
        ) : null}

        {analysis.error ? <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{analysis.error}</p> : null}

        <div className="flex justify-end gap-2">
          {analysis.stage !== "done" ? (
            <Button disabled={analysis.stage !== "idle" && analysis.stage !== "error"} onClick={onStart} type="button">
              <Play data-icon="inline-start" />
              {analysis.stage === "error" ? "重新解析" : analysis.stage === "idle" ? "开始解析" : "正在解析..."}
            </Button>
          ) : (
            <Button onClick={onContinue} type="button">确认并继续</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
