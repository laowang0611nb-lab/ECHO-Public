"use client";

import { ArrowRight, BrainCircuit, ClipboardCheck, LibraryBig, MessageSquare, Network, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { AiAnalysisOutcome, AiEvidenceNode, AiTeachingTone } from "@/features/ai-insights/view-model";
import { cn } from "@/lib/utils";

const toneClasses: Record<AiTeachingTone, string> = {
  blue: "border-blue-200 bg-blue-50/45",
  emerald: "border-emerald-200 bg-emerald-50/45",
  amber: "border-amber-200 bg-amber-50/55",
  rose: "border-rose-200 bg-rose-50/45",
  violet: "border-violet-200 bg-violet-50/45",
  neutral: "border-border bg-muted/25",
};

const evidenceSummaryIcons = {
  conversations: MessageSquare,
  quizzes: ClipboardCheck,
  events: BrainCircuit,
  citations: LibraryBig,
  mastery: Network,
} as const;

export function EvidenceSummary({
  analyzing,
  nodes,
}: {
  analyzing: boolean;
  nodes: AiEvidenceNode[];
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const summaryNodes = nodes.slice(0, 4);

  return (
    <Card
      className="min-h-[310px] gap-3 border-2 bg-card/90 py-4 backdrop-blur-[12px] xl:h-full"
      data-ai-evidence-anchor="true"
    >
      <CardHeader className="px-4">
        <CardTitle>学习证据摘要</CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">
          只展示当前课程真实存在的数据，完整证据仍可逐条回查。
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4">
        {summaryNodes.map((node, index) => {
          const Icon = evidenceSummaryIcons[node.id];
          const content = (
            <div
              className={cn(
                "relative isolate flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 transition-colors",
                analyzing ? "border-primary/25 bg-primary/5" : "border-border/80 bg-white/65",
              )}
            >
              {analyzing && !reducedMotion ? (
                <motion.span
                  aria-hidden="true"
                  animate={{ opacity: [0.08, 0.42, 0.08], scale: [0.985, 1.008, 0.985] }}
                  className="pointer-events-none absolute inset-0 z-0 rounded-lg border border-primary/35"
                  transition={{ delay: index * 0.12, duration: 1.7, ease: "easeInOut", repeat: Infinity }}
                />
              ) : null}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium">{node.label}</p>
                  <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-primary">{node.value}</p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {node.description}
                </p>
              </div>
            </div>
          );

          return node.href ? (
            <Link
              className="group block"
              data-evidence-summary-node={node.id}
              href={node.href}
              key={node.id}
            >
              {content}
            </Link>
          ) : (
            <div data-evidence-summary-node={node.id} key={node.id}>{content}</div>
          );
        })}
        {!summaryNodes.length ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
            暂无可展示的证据摘要。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function KnowledgeGraphPreviewAnchor({
  attentionCount,
  courseId,
  difficulty,
}: {
  attentionCount: number;
  courseId: string;
  difficulty: {
    knowledge_point_id: string;
    name: string;
    average_score: number;
    affected_students: number;
  } | null;
}) {
  const graphHref = `/knowledge?courseId=${courseId}&tab=graph`;
  const focusHref = difficulty
    ? `${graphHref}&pointId=${difficulty.knowledge_point_id}`
    : graphHref;

  return (
    <Card
      className="min-h-[310px] gap-3 border-2 bg-card/90 py-4 backdrop-blur-[12px] xl:h-full"
      data-ai-graph-anchor="true"
    >
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          课程知识图谱
        </CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">
          承接真实课程风险节点，完整关系视图在知识图谱页中打开。
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4">
        <div className="relative flex min-h-[170px] items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-[radial-gradient(circle_at_50%_50%,rgba(219,237,255,0.92),rgba(247,251,255,0.96)_64%,rgba(255,255,255,0.98))]">
          <span aria-hidden="true" className="absolute size-40 rounded-full border border-primary/15" />
          <span aria-hidden="true" className="absolute size-28 rounded-full border border-primary/20" />
          <span aria-hidden="true" className="absolute size-16 rounded-full border border-primary/25 bg-white/65 shadow-[0_0_28px_rgba(47,124,246,0.14)]" />
          <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_24px_rgba(47,124,246,0.28)]">
            <Network className="size-5" />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border/80 bg-white/65 px-3 py-3">
          {difficulty ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold">{difficulty.name}</p>
                <StatusBadge tone="neutral">课程学情风险</StatusBadge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {difficulty.affected_students} 名学生受影响，平均掌握度 {Math.round(difficulty.average_score)}%。
              </p>
            </>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              当前课程暂无可展示的风险知识点，可进入完整图谱查看课程结构。
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            课程当前待关注知识点：{attentionCount} 个
          </p>
        </div>
        <div className="mt-auto grid gap-2 pt-3 sm:grid-cols-2 xl:grid-cols-1">
          {difficulty ? (
            <Link className={cn(buttonVariants({ size: "sm" }), "w-full")} href={focusHref}>
              在知识图谱中定位
            </Link>
          ) : null}
          <Link
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full")}
            href={graphHref}
          >
            前往完整知识图谱
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function FindingCard({
  icon: Icon,
  outcome,
  prominent = false,
}: {
  icon: LucideIcon;
  outcome: AiAnalysisOutcome;
  prominent?: boolean;
}) {
  const content = (
    <div className={cn("flex h-full min-w-0 flex-col rounded-xl border-2 px-4 py-4", toneClasses[outcome.tone])}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/75 text-primary">
          <Icon className="size-4" />
        </span>
        {outcome.insufficient ? <StatusBadge tone="neutral">证据不足</StatusBadge> : null}
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{outcome.label}</p>
      <p className={cn("mt-1 max-h-16 overflow-y-auto break-words pr-1 font-semibold leading-5 scrollbar-hidden", prominent ? "text-base" : "max-h-10 text-sm")}>
        {outcome.value}
      </p>
      <div className={cn("mt-2 max-h-16 flex-1 overflow-y-auto break-words pr-1 text-xs leading-5 text-muted-foreground scrollbar-hidden", prominent && "max-h-12")}>
        {outcome.description}
      </div>
      {outcome.href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
          查看依据 <ArrowRight className="size-3.5" />
        </span>
      ) : null}
    </div>
  );

  return outcome.href ? (
    <Link className="block h-full" href={outcome.href}>
      {content}
    </Link>
  ) : content;
}

