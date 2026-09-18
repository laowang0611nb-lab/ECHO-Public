"use client";

import { ArrowRight, BookOpen, Clock3, MoreHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/common/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import type { CourseManagementItem } from "@/features/courses/queries";
import { cn } from "@/lib/utils";

const coverStyles = [
  { background: "linear-gradient(135deg, #0f1f3d 0%, #1559c6 100%)" },
  { background: "linear-gradient(135deg, #101c2e 0%, #203c76 58%, #2f7cf6 100%)" },
  { background: "linear-gradient(135deg, #183248 0%, #0f766e 100%)" },
  { background: "linear-gradient(135deg, #27324a 0%, #5668a8 100%)" },
] as const;

export function CourseCard({
  item,
  onPublish,
  publishing,
}: {
  item: CourseManagementItem;
  onPublish: (courseId: string) => void;
  publishing: boolean;
}) {
  const router = useRouter();
  const { course, dashboard, masteryValue, currentChapter } = item;
  const coverIndex = course.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % coverStyles.length;

  return (
    <Card className={cn("gap-0 overflow-hidden p-0 transition-transform duration-200 hover:-translate-y-0.5")}>
      <div className="relative h-[124px]" style={coverStyles[coverIndex]}>
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_20%_25%,white_0,transparent_24%),linear-gradient(90deg,transparent_48%,rgba(255,255,255,.25)_49%,transparent_50%)] [background-size:100%_100%,42px_42px]" />
        <div className="absolute right-3 top-3">
          <StatusBadge tone={course.status === "published" ? "success" : "warning"}>
            {course.status === "published" ? "已发布" : "草稿"}
          </StatusBadge>
        </div>
      </div>

      <CardContent className="space-y-4 px-4 py-4">
        <Link className="block space-y-4" href={`/courses/${course.id}`}>
        <div>
          <h3 className="truncate text-base font-semibold">{course.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {course.code} · {course.term || "未设置学期"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {dashboard?.student_count ?? 0} 名学生
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Clock3 className="size-3.5 shrink-0" />
            <span className="truncate">{currentChapter ? currentChapter.title : "暂无章节进度"}</span>
          </span>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">掌握度参考</span>
            <span className="font-semibold text-foreground">
              {masteryValue === null ? "暂无" : `${Math.round(masteryValue)}%`}
            </span>
          </div>
          <Progress
            className="h-1.5"
            value={masteryValue ?? 0}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">教学进度暂缺独立接口，当前显示真实掌握度基准。</p>
        </div>
        </Link>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Link className={buttonVariants({ size: "sm" })} href={`/courses/${course.id}`}>
            进入课程
            <ArrowRight data-icon="inline-end" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="课程更多操作" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" type="button" />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => router.push(`/courses/${course.id}?tab=settings`)}>
                <BookOpen />
                课程设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/courses/${course.id}?tab=materials`)}>
                课程资料
              </DropdownMenuItem>
              {course.status === "draft" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={publishing} onClick={() => onPublish(course.id)}>
                    发布课程
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
