"use client";

import type { CourseDocument } from "@echo/shared-types";
import { AlertCircle, CheckCircle2, Circle, LoaderCircle, Play, RefreshCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocumentIndexStatus } from "@/features/knowledge/queries";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { cn } from "@/lib/utils";

type PipelineStage = "idle" | "parsing" | "structuring" | "chunking" | "indexing" | "done" | "error";

const stageOrder = ["parsing", "structuring", "chunking", "indexing"] as const;

const stages = [
  { key: "upload", label: "上传文件" },
  { key: "parsing", label: "解析文档" },
  { key: "structuring", label: "章节与知识点" },
  { key: "chunking", label: "文本切分" },
  { key: "indexing", label: "向量化与入库" },
] as const;

export function ParseStatusPanel({
  courseId,
  document,
  chapterCount,
  knowledgePointCount,
  onChanged,
}: {
  courseId: string;
  document: CourseDocument;
  chapterCount: number;
  knowledgePointCount: number;
  onChanged: () => void;
}) {
  const { user } = useTeacherSession();
  const [stage, setStage] = React.useState<PipelineStage>("idle");
  const indexQuery = useDocumentIndexStatus(courseId, document.id);
  const [error, setError] = React.useState<string | null>(null);

  const running = ["parsing", "structuring", "chunking", "indexing"].includes(stage);
  const currentIndex = stageOrder.indexOf(stage as (typeof stageOrder)[number]);
  const indexStatus = indexQuery.data;
  const chunkCount = indexStatus?.chunks_total ?? null;
  const embeddingCount = indexStatus?.chunks_embedded ?? null;
  const embeddingProgress = chunkCount && chunkCount > 0 ? Math.round(((embeddingCount ?? 0) / chunkCount) * 100) : 0;
  const progress = stage === "done" ? 100 : stage === "idle" ? (indexStatus ? embeddingProgress : document.status === "ready" ? 60 : 0) : stage === "error" ? 25 : Math.max(12, (currentIndex + 1) * 20);
  const inferredCompleted = {
    upload: true,
    parsing: document.status === "ready" || document.status === "parsing",
    structuring: chapterCount > 0,
    chunking: Boolean(chunkCount && chunkCount > 0),
    indexing: Boolean(chunkCount && chunkCount > 0 && (embeddingCount ?? 0) >= chunkCount),
  };
  const inferredUnknown = document.status === "ready" && indexQuery.isLoading ? ["chunking", "indexing"] : [];

  async function runPipeline() {
    if (!user) return;
    setError(null);
    try {
      setStage("parsing");
      await apiClient.parseCourseDocument(user.id, document.id);
      setStage("structuring");
      await apiClient.generateKnowledgeStructure(user.id, document.id);
      setStage("chunking");
      await apiClient.createDocumentChunks(user.id, document.id);
      setStage("indexing");
      await apiClient.createDocumentEmbeddings(user.id, document.id);
      setStage("done");
      onChanged();
      await indexQuery.refetch();
    } catch (requestError) {
      setStage("error");
      setError(requestError instanceof Error ? requestError.message : "解析任务失败，请重试。");
    }
  }

  return (
    <Card className="gap-5 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>解析状态</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">解析、抽取、切分和向量化均调用当前真实后端接口。</p>
          </div>
          <Button disabled={running} onClick={() => void runPipeline()} type="button">
            {document.status === "ready" ? <RefreshCw data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {running ? "正在处理..." : document.status === "ready" ? "重新构建结构与索引" : "开始解析"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5">
        <Progress value={progress} />
        <div className="grid gap-3 lg:grid-cols-5">
          {stages.map((item, index) => {
            const completed = stage === "done" || Boolean(inferredCompleted[item.key as keyof typeof inferredCompleted]) || (stage !== "idle" && currentIndex >= 0 && index <= currentIndex);
            const unknown = stage === "idle" && inferredUnknown.includes(item.key);
            const active = item.key === stage;
            return (
              <div className={cn("rounded-lg border px-3 py-3", active ? "border-blue-200 bg-blue-50" : "border-border bg-card")} key={item.key}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {completed && !active ? <CheckCircle2 className="size-4 text-emerald-600" /> : active ? <LoaderCircle className="size-4 animate-spin text-primary" /> : unknown ? <AlertCircle className="size-4 text-orange-500" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span>{item.label}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {active ? "处理中" : completed ? "已完成" : unknown ? "无法确认" : "等待"}
                </p>
              </div>
            );
          })}
        </div>

        {indexQuery.isLoading ? <LoadingState label="正在读取索引状态..." /> : null}
        {indexQuery.isError ? <ErrorState description="索引状态加载失败。" onRetry={() => void indexQuery.refetch()} /> : null}
        {!indexQuery.isLoading && !indexQuery.isError && !indexStatus ? <EmptyState description="该文档还没有可读取的索引记录。" title="尚未建立索引" /> : null}
        {indexStatus ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Stat label="章节" value={chapterCount} />
              <Stat label="知识点" value={knowledgePointCount} />
              <Stat label="总页数" value={indexStatus.pages_total} note={`${indexStatus.pages_parsed} 页已解析`} />
              <Stat label="文本块" value={indexStatus.chunks_total} />
              <Stat label="Embedding" value={`${indexStatus.chunks_embedded}/${indexStatus.chunks_total}`} />
              <Stat label="索引进度" value={`${embeddingProgress}%`} note={indexStatus.last_indexed_at ? indexStatus.last_indexed_at.slice(0, 19).replace("T", " ") : "尚未完成"} />
            </div>
            {indexStatus.chunks_total === 0 ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50/55 px-4 py-3 text-sm text-orange-900">文档已解析，但尚未生成文本块。</div>
            ) : indexStatus.chunks_embedded < indexStatus.chunks_total ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50/55 px-4 py-3 text-sm text-blue-900">正在建立向量索引：已完成 {indexStatus.chunks_embedded}/{indexStatus.chunks_total} 个文本块。</div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/55 px-4 py-3 text-sm text-emerald-900">索引已完成{indexStatus.last_indexed_at ? `，最后索引时间 ${indexStatus.last_indexed_at.slice(0, 19).replace("T", " ")}` : "。"}</div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}
