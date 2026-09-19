"use client";

import type { Course, TeacherDashboardOverview } from "@echo/shared-types";
import { BookOpen, Copy, Pencil, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate } from "@/features/courses/detail/utils";

const coverStyles = [
  "linear-gradient(135deg, #10233f 0%, #1559c6 58%, #50a7ff 100%)",
  "linear-gradient(135deg, #12273c 0%, #146e78 58%, #4cc4b8 100%)",
  "linear-gradient(135deg, #1d2945 0%, #475fb7 58%, #8aa4ff 100%)",
] as const;

export function CourseDetailHeader({
  course,
  overview,
  onEdit,
}: {
  course: Course;
  overview: TeacherDashboardOverview | null;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const coverIndex = course.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % coverStyles.length;

  async function copyCode() {
    await navigator.clipboard.writeText(course.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px_320px]">
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <div
            className="relative flex h-32 w-full shrink-0 items-end overflow-hidden rounded-lg p-4 text-white sm:h-36 sm:w-52"
            style={{ background: coverStyles[coverIndex] }}
          >
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(135deg,transparent_44%,white_45%,transparent_46%),radial-gradient(circle_at_20%_20%,white_0,transparent_28%)] [background-size:54px_54px,100%_100%]" />
            <div className="relative z-10">
              <BookOpen className="size-5" />
              <p className="mt-2 text-xs font-medium text-white/75">ECHO COURSE</p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={course.status === "published" ? "success" : course.status === "archived" ? "neutral" : "warning"}>
                {course.status === "published" ? "已发布" : course.status === "archived" ? "已归档" : "草稿"}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">{course.term || "未设置学期"}</span>
              {course.course_type ? <span className="text-xs text-muted-foreground">{course.course_type}</span> : null}
              {course.target_audience ? <span className="text-xs text-muted-foreground">{course.target_audience}</span> : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{course.name}</h2>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {course.description || "当前课程尚未填写课程简介。"}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>课程代码 {course.code}</span>
              <span>创建于 {formatDate(course.created_at)}</span>
              <span>最后更新 {formatDate(course.updated_at)}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={onEdit} type="button" variant="outline">
                <Pencil data-icon="inline-start" />
                编辑课程
              </Button>
              <Link className={buttonVariants({ variant: "ghost" })} href="/courses">
                返回课程管理
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-border p-5 xl:border-l xl:border-t-0 xl:p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="size-4 text-primary" />
            课程加入码
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-[0.12em]">{course.code}</p>
          <div className="mt-4 flex items-center gap-4">
            <Dialog>
              <DialogTrigger render={<button aria-label="放大课程二维码" className="rounded-lg bg-white p-2 ring-1 ring-border transition hover:ring-primary/45" type="button" />}>
                <QRCodeSVG size={88} value={`echo://join?code=${course.code}`} />
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>扫描加入课程</DialogTitle></DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="rounded-xl bg-white p-4 ring-1 ring-border"><QRCodeSVG size={256} value={`echo://join?code=${course.code}`} /></div>
                  <p className="text-2xl font-semibold tracking-[0.12em]">{course.code}</p>
                  <p className="text-sm text-muted-foreground">学生扫码或输入课程码加入当前课程。</p>
                </div>
              </DialogContent>
            </Dialog>
            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
              <p>扫描加入课程</p>
              <p className="mt-1">学生可凭课程码进入当前课程。</p>
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={() => void copyCode()} type="button" variant="outline">
            <Copy data-icon="inline-start" />
            {copied ? "已复制" : "复制课程码"}
          </Button>
        </div>

        <div className="border-t border-border p-5 xl:border-l xl:border-t-0 xl:p-6">
          <p className="text-sm font-medium">课程状态</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <Metric label="学生人数" value={overview ? String(overview.stats.student_count) : "--"} />
            <Metric label="活跃学生" value={overview ? String(overview.stats.active_student_count) : "--"} />
            <Metric label="待审核回答" value={overview ? String(overview.stats.pending_review_count) : "--"} />
            <Metric label="预期人数" value={course.expected_student_count ? String(course.expected_student_count) : "未设置"} />
            <Metric label="课程状态" value={course.status === "published" ? "进行中" : course.status === "archived" ? "已归档" : "草稿"} />
          </dl>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            开始和结束日期暂未提供课程字段，当前显示真实课程状态与学习统计。
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}
