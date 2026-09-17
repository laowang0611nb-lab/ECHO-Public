import type { TeacherDashboardOverview } from "@echo/shared-types";
import { ArrowRight, ClipboardCheck, Compass, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDashboardDate } from "@/features/dashboard/view-model";
import { cn } from "@/lib/utils";

function ActionCard({
  title,
  icon: Icon,
  children,
  href,
  action,
}: {
  title: string;
  icon: typeof Users;
  children: React.ReactNode;
  href: string;
  action: string;
}) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex flex-row items-center gap-3 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-primary">
          <Icon className="size-4" />
        </span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5">
        <div className="flex-1 text-sm text-muted-foreground">{children}</div>
        <Link className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-4 justify-start px-0 text-primary")} href={href}>
          {action} <ArrowRight data-icon="inline-end" />
        </Link>
      </CardContent>
    </Card>
  );
}

export function TeacherActionSection({ overview }: { overview: TeacherDashboardOverview }) {
  const topDifficulties = overview.learning_difficulties.slice(0, 2);
  const supportPoint = overview.learning_difficulties[0];
  const reviewAction = overview.teacher_actions.find((action) => action.action_type === "review_flags");
  const supportAction = overview.teacher_actions.find((action) => action.action_type === "support_knowledge_point");
  const recent = overview.trend.slice(-3).reverse();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">教师行动</h2>
        <p className="mt-1 text-sm text-muted-foreground">根据近期学习数据，为你整理值得关注的事项。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard action="查看学生学情" href="/students" icon={Users} title="待关注学生">
          {topDifficulties.length ? (
            <div className="space-y-2">
              {topDifficulties.map((item) => (
                <p key={item.knowledge_point_id}>
                  <span className="font-medium text-foreground">{item.name}</span> · {item.affected_students} 人受影响
                </p>
              ))}
            </div>
          ) : (
            <p>当前没有进入风险阈值的学生。</p>
          )}
        </ActionCard>

        <ActionCard action="查看审核" href="/ai-review" icon={ClipboardCheck} title="AI 回答待审核">
          <p className="text-2xl font-semibold text-foreground">{overview.stats.pending_review_count} 条</p>
          <p className="mt-2">
            {reviewAction?.priority === "high" ? "存在高优先级审核项。" : "按优先级处理教师审核队列。"}
          </p>
        </ActionCard>

        <ActionCard action="查看全部" href="/students" icon={MessageSquareText} title="最近学习动态">
          <div className="space-y-2">
            {recent.map((point) => (
              <p key={point.date}>
                {formatDashboardDate(point.date)} · 学习交互 {point.interaction_count} 次 · 活跃学生 {point.active_student_count} 人
              </p>
            ))}
            {!recent.length ? <p>暂无最近学习动态。</p> : null}
          </div>
        </ActionCard>

        <ActionCard
          action="创建教学任务"
          href={supportPoint ? `/execution-plans/new?knowledgePointId=${supportPoint.knowledge_point_id}` : "/execution-plans/new"}
          icon={Compass}
          title="ECHO 教师建议"
        >
          {supportPoint ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">建议支持“{supportPoint.name}”</p>
              <p>影响 {supportPoint.affected_students} 名学生，当前平均掌握度 {Math.round(supportPoint.average_score)}%。</p>
              {supportAction?.priority ? <p>优先级：{supportAction.priority}</p> : null}
            </div>
          ) : (
            <p>当前没有需要创建的教学行动。</p>
          )}
        </ActionCard>
      </div>
    </section>
  );
}
