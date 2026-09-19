"use client";

import type { CourseDocument, ResourceType } from "@echo/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { courseDetailQueryKeys } from "@/features/courses/detail/queries";
import { formatBytes, formatDate } from "@/features/courses/detail/utils";
import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const resourceTypeOptions: Array<{ value: ResourceType; label: string }> = [
  { value: "textbook", label: "教材文档" },
  { value: "outline", label: "教学大纲" },
  { value: "question_bank", label: "题库" },
  { value: "code_example", label: "代码示例" },
  { value: "lab", label: "实验资料" },
];

const statusLabels: Record<CourseDocument["status"], string> = {
  uploaded: "已上传",
  parsing: "解析中",
  ready: "可用",
  failed: "失败",
};

function resourceTypeLabel(resourceType: ResourceType) {
  return resourceTypeOptions.find((option) => option.value === resourceType)?.label ?? resourceType;
}

export function CourseMaterialsTab({
  courseId,
  documents,
}: {
  courseId: string;
  documents: CourseDocument[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resourceType, setResourceType] = useState<ResourceType>("textbook");
  const { user } = useTeacherSession();
  const queryClient = useQueryClient();
  const uploadMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadCourseDocument(user!.id, courseId, file, file.name, resourceType),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: courseDetailQueryKeys.documents(user!.id, courseId),
      });
      if (inputRef.current) inputRef.current.value = "";
    },
  });

  function handleFileChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) uploadMutation.mutate(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">课程资料</p>
          <p className="mt-1 text-xs text-muted-foreground">当前后端稳定支持 PDF；上传成功后会进入真实文档列表。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            accept=".pdf,application/pdf"
            className="sr-only"
            disabled={uploadMutation.isPending}
            onChange={(event) => handleFileChange(event.target.files)}
            ref={inputRef}
            type="file"
          />
          <Select
            items={resourceTypeOptions}
            onValueChange={(value) => value && setResourceType(value as ResourceType)}
            value={resourceType}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{resourceTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          <Button disabled={uploadMutation.isPending} onClick={() => inputRef.current?.click()} type="button">
            <Upload data-icon="inline-start" />
            {uploadMutation.isPending ? "正在上传..." : "上传 PDF 资料"}
          </Button>
        </div>
      </div>

      {uploadMutation.isError ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {uploadMutation.error instanceof Error ? uploadMutation.error.message : "资料上传失败，请重试。"}
        </p>
      ) : null}

      {documents.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4">
            <CardTitle>已上传资料</CardTitle>
            <p className="text-xs text-muted-foreground">共 {documents.length} 份文件，点击可进入资源详情。</p>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">文件名</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>上传时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="max-w-[360px] px-5">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary">
                          <FileText className="size-4" />
                        </span>
                        <span className="truncate font-medium">{document.original_name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{resourceTypeLabel(document.resource_type)}</TableCell>
                    <TableCell>{formatBytes(document.size_bytes)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={document.status === "ready" || document.status === "uploaded" ? "success" : document.status === "failed" ? "danger" : "info"}>
                        {statusLabels[document.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{formatDate(document.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/knowledge/resources/${document.id}?from=course&courseId=${courseId}&tab=materials`}>
                        查看资源 <ArrowRight className="size-4" />
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
          description="当前课程还没有资料。上传 PDF 教材后，可继续完成解析、知识点抽取和向量化。"
          title="暂无课程资料"
        />
      )}
    </div>
  );
}