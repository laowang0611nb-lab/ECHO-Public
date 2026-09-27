"use client";

import { BookOpen, BrainCircuit, FileCheck2, MessageSquare, MoveUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiEvidenceNode } from "@/features/ai-insights/view-model";

const evidenceIcons = {
  conversations: MessageSquare,
  quizzes: ShieldCheck,
  events: BrainCircuit,
  citations: BookOpen,
  mastery: FileCheck2,
} as const;

export function EvidenceFlow({
  nodes,
  analyzing,
}: {
  nodes: AiEvidenceNode[];
  analyzing: boolean;
}) {
  return (
    <Card className="min-h-[380px] gap-3 border-2 py-4 xl:h-full">
      <CardHeader className="px-4">
        <CardTitle>学习证据输入</CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">节点只使用当前课程已经存在的真实数据。</p>
      </CardHeader>
      <CardContent
        className="scrollbar-hidden min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-1"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)", maskImage: "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)" }}
      >
        {nodes.map((node, index) => {
          const Icon = evidenceIcons[node.id];
          const content = (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border-2 border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/35"
              initial={{ opacity: 0, x: -8 }}
              key={node.id}
              transition={{ delay: index * 0.06, duration: analyzing ? 0.28 : 0.18 }}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium" title={node.label}>{node.label}</p>
                    <p className="shrink-0 whitespace-nowrap text-right text-sm font-semibold text-primary">{node.value}</p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{node.description}</p>
                </div>
              </div>
            </motion.div>
          );

          return node.href ? (
            <Link className="group block" href={node.href} key={node.id}>
              {content}
              <span className="mt-1 inline-flex items-center gap-1 pl-11 text-[11px] text-muted-foreground group-hover:text-primary">
                查看证据 <MoveUpRight className="size-3" />
              </span>
            </Link>
          ) : (
            <div key={node.id}>{content}</div>
          );
        })}
      </CardContent>
    </Card>
  );
}
