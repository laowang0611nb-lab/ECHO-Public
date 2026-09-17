import { LoaderCircle } from "lucide-react";

export function LoadingState({ label = "正在加载..." }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
