import type { LucideIcon } from "lucide-react";

import { AnimatedNumber } from "@/components/common/animated-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  suffix,
  supporting,
  icon: Icon,
}: {
  label: string;
  value: number | string | null;
  suffix?: string;
  supporting: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="min-w-0 gap-3 py-4" size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4">
        <CardTitle className="min-w-0 truncate text-sm font-medium text-muted-foreground" title={label}>{label}</CardTitle>
        <Icon className="size-4 text-primary" />
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-3xl font-semibold tracking-tight">
          {typeof value === "number" || value === null ? <AnimatedNumber suffix={suffix} value={value} /> : <span>{value}{suffix}</span>}
        </p>
        <p className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground" title={supporting}>
          {supporting}
        </p>
      </CardContent>
    </Card>
  );
}
