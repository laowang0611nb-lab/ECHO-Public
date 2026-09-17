"use client";

import type { Course } from "@echo/shared-types";
import { Archive, CircleAlert, Save } from "lucide-react";
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

export function CourseSettingsTab({ course }: { course: Course }) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="gap-5 py-5">
        <CardHeader className="px-5">
          <CardTitle>课程基本信息</CardTitle>
          <p className="text-sm text-muted-foreground">当前版本只读展示真实课程字段，后端尚未提供课程更新接口。</p>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">课程名称</span>
            <Input readOnly value={course.name} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">课程代码</span>
            <Input readOnly value={course.code} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">学期</span>
            <Input readOnly value={course.term || "未设置学期"} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">课程状态</span>
            <Input readOnly value={course.status === "published" ? "已发布" : "草稿"} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-sm font-medium">课程简介</span>
            <Textarea className="min-h-28 resize-y" readOnly value={course.description || "暂无课程简介"} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground lg:col-span-2">
            <span>创建于 {formatDate(course.created_at)} · 最后更新 {formatDate(course.updated_at)}</span>
            <Button disabled type="button">
              <Save data-icon="inline-start" />
              保存修改（接口未开放）
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 border-red-200 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-red-700">危险操作</CardTitle>
          <p className="text-sm text-muted-foreground">归档与删除必须先确认，且只有后端接口可用时才执行。</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5">
          <div className="flex items-start gap-3 text-sm text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>课程归档接口暂未提供，当前不会伪造成功结果。</p>
          </div>
          <Dialog onOpenChange={setArchiveOpen} open={archiveOpen}>
            <DialogTrigger render={<Button type="button" variant="destructive" />}>
              <Archive data-icon="inline-start" />
              归档课程
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认归档课程？</DialogTitle>
                <DialogDescription>
                  归档后课程将退出正常教学列表。当前后端尚未提供该能力，因此确认按钮保持禁用。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setArchiveOpen(false)} type="button" variant="outline">取消</Button>
                <Button disabled type="button" variant="destructive">确认归档</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
