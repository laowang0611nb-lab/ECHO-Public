import type { Course } from "@echo/shared-types";
import { CheckCircle2, Copy, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CourseAnalysisState } from "@/features/courses/wizard/types";

export function PublishStep({
  course,
  courseName,
  term,
  analysis,
  policy,
  pending,
  error,
  onPublish,
  onBack,
}: {
  course: Course | null;
  courseName: string;
  term: string;
  analysis: CourseAnalysisState;
  policy: string;
  pending: boolean;
  error: string | null;
  onPublish: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!course) return;
    await navigator.clipboard.writeText(course.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle>5 确认发布</CardTitle>
        <p className="text-sm text-muted-foreground">确认课程信息、解析结果与教学策略后发布课程。</p>
      </CardHeader>
      <CardContent className="space-y-6 px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-5">
              <h3 className="text-lg font-semibold">{courseName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{term} · 当前状态：草稿</p>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">章节</p><p className="mt-1 text-xl font-semibold">{analysis.chapters.length}</p></div>
                <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">知识点</p><p className="mt-1 text-xl font-semibold">{analysis.chapters.reduce((sum, chapter) => sum + chapter.knowledge_points.length, 0)}</p></div>
                <div className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">知识块</p><p className="mt-1 text-xl font-semibold">{analysis.chunkCount}</p></div>
              </div>
            </div>
            <div className="rounded-xl border border-border p-5">
              <p className="text-sm font-medium">教学策略摘要</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{policy}</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 text-center">
            <QrCode className="mx-auto size-5 text-primary" />
            <p className="mt-3 text-sm font-medium">课程加入码</p>
            <p className="mt-2 text-2xl font-semibold tracking-[0.12em]">{course?.code ?? "生成中"}</p>
            <div className="mt-5 flex justify-center rounded-lg bg-white p-3"><QRCodeSVG value={course ? `echo://join-course?code=${course.code}` : "echo://join"} size={148} /></div>
            <Button className="mt-4 w-full" onClick={() => void copyCode()} type="button" variant="outline"><Copy data-icon="inline-start" />{copied ? "已复制" : "复制课程码"}</Button>
          </div>
        </div>

        {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error} 服务恢复后可直接再次点击发布，不会重复创建课程。</p> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onBack} type="button" variant="outline">返回修改</Button>
          <Button disabled={pending || !course} onClick={onPublish} type="button"><CheckCircle2 data-icon="inline-start" />{pending ? "正在发布..." : "发布课程"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
