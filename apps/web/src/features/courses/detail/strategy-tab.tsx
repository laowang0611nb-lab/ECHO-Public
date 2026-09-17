import type { Course, TeachingPolicy } from "@echo/shared-types";
import { ArrowRight, BookOpenCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/common/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/features/courses/detail/utils";

const fallbackPolicy = "课程知识优先。\n概念问题可以直接讲解。\n习题优先引导，不直接给出最终答案。\n超出课程资料时明确标记为课程外补充。";

export function CourseStrategyTab({ course, policy }: { course: Course; policy: TeachingPolicy | null }) {
  const strategyHref = policy
    ? `/teaching-strategies/${policy.id}`
    : `/teaching-strategies?courseId=${course.id}`;

  return (
    <div className="space-y-4">
      <Card className="gap-5 border-blue-100 bg-blue-50/35 py-5">
        <CardHeader className="px-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary ring-1 ring-blue-100">
                <Sparkles className="size-5" />
              </span>
              <div>
                <CardTitle>当前课程教学策略</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">课程创建时保存的自然语言教学规则，会直接约束 AI 的回答行为。</p>
              </div>
            </div>
            <StatusBadge tone={policy ? "success" : "warning"}>
              {policy ? "已保存" : "默认规则"}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5">
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-card p-5 text-sm leading-7">
            {policy?.content || fallbackPolicy}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{policy ? `最后更新 ${formatDate(policy.updated_at)}` : "后端尚未返回课程级策略，当前显示前端默认规则。"}</span>
            <Link className={buttonVariants({ variant: "outline" })} href={strategyHref}>
              {policy ? "打开教学策略详情" : "进入教学策略中心"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <RuleCard label="知识边界" value="优先引用课程资料，课程外内容需要明确标记。" />
        <RuleCard label="回答方式" value="概念可直接讲解，习题优先提示、追问和分步引导。" />
        <RuleCard label="教学目标" value="帮助学生形成对课程知识结构的持续理解与迁移能力。" />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>课程创建向导与课程详情读取同一课程级教学策略接口。完整策略管理、版本记录和执行计划仍属于后续教学策略模块。</p>
      </div>
    </div>
  );
}

function RuleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <p className="text-xs font-medium text-primary">{label}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{value}</p>
    </div>
  );
}
