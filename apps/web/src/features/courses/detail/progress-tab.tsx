import type { ChapterAnalytics } from "@echo/shared-types";
import { ArrowRight, CircleAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { chapterStatus, masteryTone } from "@/features/courses/detail/utils";

export function CourseProgressTab({
  chapters,
  onOpenKnowledge,
}: {
  chapters: ChapterAnalytics[];
  onOpenKnowledge: () => void;
}) {
  if (!chapters.length) {
    return (
      <EmptyState
        description="上传并解析教材后，这里会自动展示章节、知识点和掌握度进度。"
        title="暂无教学进度"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 text-sm text-orange-800">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p>后端暂未提供章节完成状态与手动流转接口，当前页面按真实章节活跃度和掌握度只读展示。</p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>章节教学进度</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                共 {chapters.length} 个章节，掌握度低于 60% 的章节会标记为需要关注。
              </p>
            </div>
            <Button onClick={onOpenKnowledge} type="button" variant="outline">
              查看知识点结构
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 px-5">章节</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>知识点</TableHead>
                <TableHead>活跃学生</TableHead>
                <TableHead className="w-56">平均掌握度</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chapters.map((chapter) => (
                <TableRow key={chapter.chapter_id}>
                  <TableCell className="px-5 font-medium tabular-nums">{chapter.order_index + 1}</TableCell>
                  <TableCell className="max-w-[360px] truncate font-medium">{chapter.title}</TableCell>
                  <TableCell>{chapter.knowledge_point_count}</TableCell>
                  <TableCell>{chapter.active_learner_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress className="w-32" value={chapter.average_mastery ?? 0} />
                      <span className="w-10 text-xs text-muted-foreground tabular-nums">
                        {chapter.average_mastery === null ? "暂无" : `${Math.round(chapter.average_mastery)}%`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={chapterStatus(chapter) === "需要关注" ? "danger" : chapterStatus(chapter) === "进行中" ? "info" : "neutral"}>
                      {chapterStatus(chapter)}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="进行中章节" value={chapters.filter((chapter) => chapter.active_learner_count > 0).length} />
        <Summary label="需要关注章节" value={chapters.filter((chapter) => chapter.average_mastery !== null && chapter.average_mastery < 60).length} />
        <Summary label="整体掌握度" value={chapters.filter((chapter) => masteryTone(chapter.average_mastery) === "success").length} suffix=" 章良好" />
      </div>
    </div>
  );
}

function Summary({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}<span className="text-sm font-normal text-muted-foreground">{suffix}</span></p>
    </div>
  );
}
