import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClasses = {
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-orange-200 bg-orange-50 text-orange-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  } as const;

  return (
    <Badge className={cn("h-6 rounded-md border px-2", toneClasses[tone], className)} variant="outline">
      {children}
    </Badge>
  );
}
