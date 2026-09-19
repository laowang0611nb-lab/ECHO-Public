"use client";

import { ApiClientError } from "@echo/api-client";
import type { Course, CourseUpdateRequest } from "@echo/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, CircleAlert, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/features/courses/detail/utils";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

interface CourseSettingsForm {
  name: string;
  description: string;
  term: string;
  courseType: string;
  targetAudience: string;
  expectedStudentCount: string;
}

function formFromCourse(course: Course): CourseSettingsForm {
  return {
    name: course.name,
    description: course.description ?? "",
    term: course.term ?? course.semester ?? "",
    courseType: course.course_type ?? "",
    targetAudience: course.target_audience ?? "",
    expectedStudentCount: course.expected_student_count?.toString() ?? "",
  };
}

function settingsError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : "课程设置保存失败，请稍后重试。";
}

export function CourseSettingsTab({ course }: { course: Course }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const { refetch: refetchWorkspace } = useCourseWorkspace();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [form, setForm] = useState<CourseSettingsForm>(() => formFromCourse(course));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: CourseUpdateRequest) => apiClient.updateCourse(user!.id, course.id, payload),
    onSuccess: (updated) => {
      setForm(formFromCourse(updated));
      queryClient.setQueriesData<Course[]>({ queryKey: ["teacher", "courses"] }, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course", course.id] });
      refetchWorkspace();
      setNotice("课程设置已保存，列表和课程工作区已同步更新。");
      setError(null);
    },
    onError: (requestError) => {
      setNotice(null);
      setError(settingsError(requestError));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiClient.archiveCourse(user!.id, course.id),
    onSuccess: (archived) => {
      queryClient.setQueriesData<Course[]>({ queryKey: ["teacher", "courses"] }, (current) =>
        current?.map((item) => (item.id === archived.id ? archived : item)),
      );
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course", course.id] });
      refetchWorkspace();
      setArchiveOpen(false);
      router.push("/courses");
    },
    onError: (requestError) => {
      setNotice(null);
      setError(settingsError(requestError));
      setArchiveOpen(false);
    },
  });

  function updateField<Key extends keyof CourseSettingsForm>(key: Key, value: CourseSettingsForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
    setError(null);
  }

  function submitSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError("课程名称不能为空。");
      return;
    }

    const countText = form.expectedStudentCount.trim();
    const expectedStudentCount = countText ? Number(countText) : null;
    if (
      countText &&
      (!Number.isInteger(expectedStudentCount) ||
        (expectedStudentCount ?? 0) < 1 ||
        (expectedStudentCount ?? 0) > 100_000)
    ) {
      setError("预期人数必须是 1 到 100000 之间的整数。");
      return;
    }

    updateMutation.mutate({
      name,
      description: form.description.trim() || null,
      term: form.term.trim() || null,
      course_type: form.courseType.trim() || null,
      target_audience: form.targetAudience.trim() || null,
      expected_student_count: expectedStudentCount,
    });
  }

  const statusLabel = course.status === "published" ? "已发布" : course.status === "archived" ? "已归档" : "草稿";

  return (
    <div className="space-y-4">
      <Card className="gap-5 border-2 py-5">
        <CardHeader className="px-5">
          <CardTitle>课程基本信息</CardTitle>
          <p className="text-sm text-muted-foreground">修改会通过正式课程更新接口保存，并同步到课程列表与顶部课程选择器。</p>
        </CardHeader>
        <CardContent className="px-5">
          <form className="grid gap-5 lg:grid-cols-2" onSubmit={submitSettings}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">课程名称</span>
              <Input
                disabled={updateMutation.isPending}
                maxLength={200}
                onChange={(event) => updateField("name", event.target.value)}
                value={form.name}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">课程代码</span>
              <Input readOnly value={course.code} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">学期</span>
              <Input
                disabled={updateMutation.isPending}
                maxLength={80}
                onChange={(event) => updateField("term", event.target.value)}
                placeholder="例如：2026 秋季"
                value={form.term}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">课程类型</span>
              <Input
                disabled={updateMutation.isPending}
                maxLength={80}
                onChange={(event) => updateField("courseType", event.target.value)}
                placeholder="例如：专业课"
                value={form.courseType}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">适用对象</span>
              <Input
                disabled={updateMutation.isPending}
                maxLength={200}
                onChange={(event) => updateField("targetAudience", event.target.value)}
                placeholder="例如：软件工程本科生"
                value={form.targetAudience}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">预期人数</span>
              <Input
                disabled={updateMutation.isPending}
                inputMode="numeric"
                min={1}
                onChange={(event) => updateField("expectedStudentCount", event.target.value)}
                placeholder="例如：48"
                type="number"
                value={form.expectedStudentCount}
              />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">课程简介</span>
              <Textarea
                className="min-h-28 resize-y"
                disabled={updateMutation.isPending}
                maxLength={5000}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="说明课程目标、教学范围和主要安排。"
                value={form.description}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4 text-xs text-muted-foreground lg:col-span-2">
              <span>当前状态：{statusLabel} · 创建于 {formatDate(course.created_at)} · 最后更新 {formatDate(course.updated_at)}</span>
              <Button disabled={updateMutation.isPending} type="submit">
                <Save data-icon="inline-start" />
                {updateMutation.isPending ? "正在保存..." : "保存修改"}
              </Button>
            </div>

            {notice ? <p className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 lg:col-span-2">{notice}</p> : null}
            {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive lg:col-span-2">{error}</p> : null}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4 border-2 border-red-200 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-red-700">危险操作</CardTitle>
          <p className="text-sm text-muted-foreground">归档会保留学生、资源、对话和学习事件，课程将退出正常教学列表。</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5">
          <div className="flex items-start gap-3 text-sm text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>归档后课程状态变为“已归档”，可从课程管理的“已归档”列表恢复为草稿。</p>
          </div>
          <Dialog onOpenChange={setArchiveOpen} open={archiveOpen}>
            <DialogTrigger render={<Button disabled={course.status === "archived"} type="button" variant="destructive" />}>
              <Archive data-icon="inline-start" />
              归档课程
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认归档课程？</DialogTitle>
                <DialogDescription>
                  归档不会删除已有学生、资源、对话和学习事件，但课程不能继续发布，也不能通过课程码加入。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button disabled={archiveMutation.isPending} onClick={() => setArchiveOpen(false)} type="button" variant="outline">取消</Button>
                <Button disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate()} type="button" variant="destructive">
                  {archiveMutation.isPending ? "正在归档..." : "确认归档"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
