import type { CourseDocument } from "@echo/shared-types";
import { FileText, RefreshCw, UploadCloud } from "lucide-react";

import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MaterialsStep({
  document,
  pending,
  error,
  onUpload,
  onRetry,
}: {
  document: CourseDocument | null;
  pending: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onRetry: () => void;
}) {
  return (
    <Card className="gap-5 py-6">
      <CardHeader className="px-6">
        <CardTitle>2 导入教材</CardTitle>
        <p className="text-sm text-muted-foreground">当前后端稳定支持 PDF。PPT、DOC、TXT 等格式将在后续后端能力开放后接入。</p>
      </CardHeader>
      <CardContent className="space-y-5 px-6">
        <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-6 text-center transition-colors hover:bg-blue-50">
          <UploadCloud className="size-8 text-primary" />
          <span className="mt-4 text-sm font-medium">点击选择 PDF 教材</span>
          <span className="mt-2 text-xs text-muted-foreground">单个文件最大 20 MB</span>
          <input accept=".pdf,application/pdf" className="sr-only" disabled={pending} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} type="file" />
        </label>

        {pending ? <p className="text-sm text-muted-foreground">正在上传并写入课程资料...</p> : null}
        {error ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <Button onClick={onRetry} size="sm" type="button" variant="outline"><RefreshCw data-icon="inline-start" />重试</Button>
          </div>
        ) : null}

        {document ? (
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-primary"><FileText className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{document.original_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{(document.size_bytes / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <StatusBadge tone={document.status === "ready" || document.status === "uploaded" ? "success" : document.status === "failed" ? "danger" : "info"}>
              {document.status === "uploaded" ? "上传完成" : document.status === "failed" ? "失败" : document.status}
            </StatusBadge>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
