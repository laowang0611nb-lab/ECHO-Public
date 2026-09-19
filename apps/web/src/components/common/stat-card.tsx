import type { LucideIcon } from "lucide-react";

import { AnimatedNumber } from "@/components/common/animated-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  suffix,
  supporting,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  supporting: string;
  icon: LucideIcon;
  tone?: "default" | "warning";
}) {
  return (
    <Card className={cn("min-w-0 gap-3 py-4", tone === "warning" && "bg-orange-50/40")} size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4">
        <CardTitle className="min-w-0 truncate text-sm font-medium text-muted-foreground" title={label}>{label}</CardTitle>
        <Icon className={cn("size-4", tone === "warning" ? "text-orange-500" : "text-primary")} />
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-3xl font-semibold tracking-tight">
          {typeof value === "number" || value === null ? <AnimatedNumber suffix={suffix} value={value} /> : <span>{value}{suffix}</span>}
        </p>
        <p className={cn("mt-2 line-clamp-2 break-words text-xs", tone === "warning" ? "text-orange-700" : "text-muted-foreground")} title={supporting}>
          {supporting}
        </p>
      </CardContent>
    </Card>
  );
}
