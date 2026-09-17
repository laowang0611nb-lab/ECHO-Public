"use client";

import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "加载失败",
  description = "请检查网络或后端服务后重试。",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center border border-dashed border-border bg-card px-6 py-10 text-center">
      <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry} type="button" variant="outline">
          重新加载
        </Button>
      ) : null}
    </div>
  );
}
