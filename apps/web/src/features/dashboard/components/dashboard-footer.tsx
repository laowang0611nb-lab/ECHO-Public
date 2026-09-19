"use client";

import { LegalLinks } from "@/features/dashboard/components/legal-links";
import { apiClient } from "@/lib/api";

export function DashboardFooter() {
  const health = useQuery({
    queryKey: ["system", "health"],
    queryFn: () => apiClient.health(),
    staleTime: 30_000,
  });
  return (
    <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>ECHO 让 AI 与教育产生真正的回响。</p>
      <div className="flex items-center gap-2">
        <LegalLinks />
        <span>v{health.data?.version ?? "—"}</span>
      </div>
    </footer>
  );
}
import { useQuery } from "@tanstack/react-query";
