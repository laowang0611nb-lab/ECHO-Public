"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/features/demo/demo-provider";
import { useDemoStatus } from "@/features/demo/queries";
import { buildDemoScenarios } from "@/features/demo/scenarios";

export function GuidedDemoBar() {
  const pathname = usePathname();
  const router = useRouter();
  const demo = useDemoMode();
  const status = useDemoStatus();
  const scenarios = buildDemoScenarios(status.data);
  const index = scenarios.findIndex((scenario) => scenario.id === demo.scenarioId);
  const current = index >= 0 ? scenarios[index] : null;

  if (!demo.active || pathname === "/settings/demo" || !current) return null;

  function move(offset: number) {
    const next = scenarios[index + offset];
    if (!next) return;
    demo.setScenario(next.id, next.context);
    router.push(next.href);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border-2 border-blue-200 bg-card/95 p-4 shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">DEMO · {index + 1} / {scenarios.length}</p>
          <p className="mt-1 truncate text-sm font-medium">{current.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{current.description}</p>
        </div>
        <Button aria-label="退出演示" onClick={demo.stopDemo} size="icon-sm" type="button" variant="ghost"><X /></Button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button disabled={index === 0} onClick={() => move(-1)} size="sm" type="button" variant="outline"><ChevronLeft data-icon="inline-start" />上一步</Button>
        <span className="text-xs text-muted-foreground">{demo.mode === "stable" ? "Demo Stable Mode" : "Live Mode"}</span>
        <Button disabled={index >= scenarios.length - 1} onClick={() => move(1)} size="sm" type="button" variant="outline">下一步<ChevronRight data-icon="inline-end" /></Button>
      </div>
    </div>
  );
}
