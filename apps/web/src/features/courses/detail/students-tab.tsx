import type { Course, CourseMember } from "@echo/shared-types";
import { ArrowRight, Copy, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/features/courses/detail/utils";

export function CourseStudentsTab({ course, members }: { course: Course; members: CourseMember[] }) {
  const [copied, setCopied] = useState(false);
  const students = members.filter((member) => member.role === "student");

  async function copyCode() {
    await navigator.clipboard.writeText(course.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4 border-blue-100 bg-blue-50/35 py-5">
        <CardContent className="flex flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-blue-100">
              <UserPlus className="size-5" />
            </span>
            <div>
              <p className="font-medium">邀请学生加入课程</p>
              <p className="mt-1 text-sm text-muted-foreground">学生使用课程加入码进入课程，课程码与二维码均为真实后端字段。</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-blue-100 bg-card px-4 py-2 font-mono text-sm font-semibold tracking-[0.12em]">{course.code}</span>
            <Button onClick={() => void copyCode()} type="button" variant="outline">
              <Copy data-icon="inline-start" />
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {students.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4">
            <CardTitle>学生成员</CardTitle>
            <p className="text-xs text-muted-foreground">共 {students.length} 名学生，点击可进入学生学情详情。</p>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">学生</TableHead>
<TableHead>学生标识</TableHead>
                  <TableHead>加入时间</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="px-5 font-medium">
                      <div className="flex items-center gap-3">
                        <UserAvatar avatarUrl={member.avatar_url} name={member.display_name} />
                        <span>{member.display_name}</span>
                      </div>
                    </TableCell>
<TableCell className="font-mono text-xs text-muted-foreground">{member.user_id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDate(member.joined_at)}</TableCell>
                    <TableCell><StatusBadge tone="info">学生</StatusBadge></TableCell>
                    <TableCell className="text-right">
<Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/students/${member.user_id}?from=course&courseId=${course.id}&tab=overview`}>
                        查看学情 <ArrowRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          description="当前课程还没有学生成员。可先分享课程加入码，学生加入后会同步显示。"
          title="暂无学生成员"
        />
      )}
    </div>
  );
}
