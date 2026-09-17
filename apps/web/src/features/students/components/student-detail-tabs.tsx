"use client";

import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TeacherNoteForm, MasteryCorrectionDialog } from "@/features/students/components/student-event-forms";
import type { ConversationEvidenceGroup, StudentDetailContext } from "@/features/students/types";
import { buildChapterMastery, buildConversationEvidenceGroups, buildWeakPoints, eventCategoryCounts, eventLabel } from "@/features/students/view-model";
import { cn } from "@/lib/utils";

export function StudentOverview({ context }: { context: StudentDetailContext }) {
  const mastery = context.detail.average_mastery;
  const chapterMastery = buildChapterMastery(context.chapters, context.masteryStates, context.chapterAnalytics);
  const weakPoints = buildWeakPoints(context.masteryStates, context.chapters).slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <div className="space-y-4">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>知识点掌握情况</CardTitle>
            <p className="text-xs text-muted-foreground">掌握度只来自后端状态与证据，不根据聊天次数推断。</p>
          </CardHeader>
          <CardContent className="grid gap-4 px-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
            <div className="relative mx-auto flex size-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(#2f7cf6 ${mastery ?? 0}%, #e5eaf2 ${mastery ?? 0}% 100%)` }}>
              <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-3xl font-semibold">{mastery === null ? "暂无" : `${Math.round(mastery)}%`}</span>
                <span className="mt-1 text-xs text-muted-foreground">总体掌握度</span>
              </div>
            </div>
            <div className="space-y-3">
              <InfoLine label="有状态知识点" value={`${context.masteryStates.length} 个`} />
              <InfoLine label="低于 60%" value={`${weakPoints.length} 个`} />
              <Progress value={mastery ?? 0} />
              <p className="text-xs leading-5 text-muted-foreground">暂无长期趋势接口，因此不展示虚构增长曲线。</p>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>各章节掌握度</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-5">
            {chapterMastery.length ? chapterMastery.map((chapter) => (
              <div key={chapter.chapterId}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{chapter.title}</span>
                  <span className="shrink-0">{chapter.score === null ? "暂无" : `${Math.round(chapter.score)}%`}</span>
                </div>
                <Progress value={chapter.score ?? 0} />
              </div>
            )) : <EmptyState description="当前学生没有章节掌握证据。" title="暂无章节数据" />}
          </CardContent>
        </Card>

        <Card className="gap-3 py-5">
          <CardHeader className="px-5"><CardTitle>薄弱知识点 Top 5</CardTitle></CardHeader>
          <CardContent className="space-y-2 px-5">
            {weakPoints.length ? weakPoints.map((point) => (
              <Link className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 hover:border-blue-200" href={`/knowledge/points/${point.knowledge_point_id}?from=student&studentId=${context.member.user_id}&tab=mastery`} key={point.id}>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{point.name}</span><span className="mt-1 block text-xs text-muted-foreground">来自后端掌握状态</span></span>
                <span className="text-sm font-semibold text-orange-600">{Math.round(point.score)}%</span>
              </Link>
            )) : <EmptyState description="暂无低于 60% 的知识点证据。" title="暂无薄弱知识点" />}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <RecentEvents context={context} />
        <StudentAiEvaluation context={context} compact />
      </aside>
    </div>
  );
}

export function StudentMasteryTab({ context, onChanged }: { context: StudentDetailContext; onChanged: () => void }) {
  const pointMap = new Map(context.chapters.flatMap((chapter) => chapter.knowledge_points.map((point) => [point.id, { id: point.id, name: point.name, chapter: chapter.title }])));
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle>知识点掌握</CardTitle>
        <p className="text-xs text-muted-foreground">教师修正会追加 LearningEvent，并保留原始状态与事件证据。</p>
      </CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {context.masteryStates.length ? context.masteryStates.map((state) => {
          const point = pointMap.get(state.knowledge_point_id);
          return (
            <div className="flex flex-wrap items-center gap-3 px-5 py-4" key={state.id}>
              <span className="min-w-0 flex-1">
                {point ? <Link className="block truncate text-sm font-medium hover:text-primary" href={`/knowledge/points/${point.id}?from=student&studentId=${context.member.user_id}&tab=mastery`}>{point.name}</Link> : <span className="block truncate text-sm font-medium">未命名知识点</span>}
                <span className="mt-1 block text-xs text-muted-foreground">{point?.chapter ?? "未知章节"}</span>
              </span>
              <StatusBadge tone={state.score < 50 ? "danger" : state.score < 70 ? "warning" : "success"}>
                {state.score < 50 ? "重点关注" : state.score < 70 ? "需要加强" : "掌握中"}
              </StatusBadge>
              <span className="w-16 text-right text-sm font-semibold">{Math.round(state.score)}%</span>
              <MasteryCorrectionDialog
                courseId={context.course.id}
                knowledgePointId={state.knowledge_point_id}
                knowledgePointName={point?.name ?? "未命名知识点"}
                onChanged={onChanged}
                originalScore={state.score}
                studentId={context.member.user_id}
              />
            </div>
          );
        }) : <EmptyState description="暂无真实知识点掌握状态。" title="暂无知识点证据" />}
      </CardContent>
    </Card>
  );
}

export function StudentBehaviorTab({ context }: { context: StudentDetailContext }) {
  const counts = eventCategoryCounts(context.detail.recent_evidence);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const repeatedErrors = context.detail.recent_evidence.filter((event) => event.event_type === "repeated_error");
  const recentEvents = context.detail.recent_evidence.slice(0, 8);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle>学习行为分布</CardTitle>
          <p className="text-xs text-muted-foreground">来自最近 LearningEvent，不代表学习时长或人格特征。</p>
        </CardHeader>
        <CardContent className="space-y-4 px-5">
          {Object.entries(counts).length ? Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{eventLabel(type)}</span><span>{count} 次</span></div>
              <Progress value={total ? (count / total) * 100 : 0} />
            </div>
          )) : <EmptyState description="当前学生还没有可展示的 LearningEvent。" title="暂无学习记录" />}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="gap-3 py-5">
          <CardHeader className="px-5"><CardTitle>重复错误</CardTitle><p className="text-xs text-muted-foreground">仅展示真实 `repeated_error` LearningEvent。</p></CardHeader>
          <CardContent className="space-y-2 px-5">
            {repeatedErrors.length ? repeatedErrors.slice(0, 5).map((event) => (
              <div className="rounded-lg border border-orange-100 bg-orange-50/40 px-4 py-3" key={event.event_id}>
                <p className="text-sm font-medium">{event.knowledge_point_name || "未关联知识点"}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.evidence || "重复错误证据"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{event.created_at.slice(0, 16).replace("T", " ")}</p>
              </div>
            )) : <EmptyState description="当前没有重复错误事件。" title="暂无重复错误" />}
          </CardContent>
        </Card>

        <Card className="gap-3 py-5">
          <CardHeader className="px-5"><CardTitle>最近 LearningEvent</CardTitle><p className="text-xs text-muted-foreground">显示时间、事件类型、知识点和描述。</p></CardHeader>
          <CardContent className="space-y-3 px-5">
            {recentEvents.length ? recentEvents.map((event) => (
              <div className="flex items-start gap-3" key={event.event_id}>
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{eventLabel(event.event_type)}</p><span className="text-[11px] text-muted-foreground">{event.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.knowledge_point_name || "课程学习事件"} · {event.evidence || "无附加描述"}</p>
                </div>
              </div>
            )) : <EmptyState description="当前学生没有可展示的学习事件。" title="暂无 LearningEvent" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function StudentConversationsTab({ context }: { context: StudentDetailContext }) {
  const conversations = buildConversationEvidenceGroups(context.studentConversations, context.reviewFlags);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-900">
        <p>完整对话、Citation 和知识点来自教师权限接口；未审核会话也会显示，不会用 Mock 补齐消息。</p>
      </div>
      {conversations.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4"><CardTitle>完整对话</CardTitle><p className="text-xs text-muted-foreground">点击进入教师证据查看器，可定位审核消息、知识点与教材来源。</p></CardHeader>
          <CardContent className="divide-y divide-border px-0">
            {conversations.map((conversation) => (
              <Link className="grid gap-3 px-5 py-4 hover:bg-muted/40 lg:grid-cols-[minmax(0,1fr)_120px_120px]" href={`/students/${context.member.user_id}/conversations/${conversation.conversationId}?from=student&tab=conversations${conversation.messageIds[0] ? `&messageId=${conversation.messageIds[0]}` : ""}`} key={conversation.conversationId}>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{conversation.title}</span><span className="mt-1 block text-xs text-muted-foreground">{conversation.flags.length} 条审核证据 · {conversation.messageIds.length} 个消息标识</span></span>
                <StatusBadge tone={conversationStatusTone(conversation.status)}>{conversationStatusLabel(conversation.status)}</StatusBadge>
                <span className="text-right text-xs text-muted-foreground">{conversation.updatedAt.slice(0, 10)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : <EmptyState description="当前学生还没有会话记录。" title="暂无对话记录" />}
    </div>
  );
}

export function StudentAssignmentsTab({ context }: { context: StudentDetailContext }) {
  const quizEvents = context.detail.recent_evidence.filter((event) => event.event_type === "quiz_correct" || event.event_type === "quiz_wrong");
  const correct = quizEvents.filter((event) => event.event_type === "quiz_correct").length;
  const wrong = quizEvents.filter((event) => event.event_type === "quiz_wrong").length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={ClipboardCheck} label="快速验证" value={quizEvents.length} />
        <SummaryCard icon={CheckCircle2} label="正确" value={correct} />
        <SummaryCard icon={AlertTriangle} label="错误" value={wrong} tone="warning" />
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4"><CardTitle>作业与测验证据</CardTitle><p className="text-xs text-muted-foreground">当前后端没有独立 LMS 列表，显示真实 Quiz 类 LearningEvent。</p></CardHeader>
        <CardContent className="divide-y divide-border px-0">
          {quizEvents.length ? quizEvents.map((event) => (
            <div className="flex items-center gap-4 px-5 py-4" key={event.event_id}>
              <StatusBadge tone={event.event_type === "quiz_correct" ? "success" : "warning"}>{eventLabel(event.event_type)}</StatusBadge>
              <span className="min-w-0 flex-1 truncate text-sm">{event.evidence || event.knowledge_point_name || "快速验证记录"}</span>
              <span className="text-xs text-muted-foreground">{event.created_at.slice(0, 10)}</span>
            </div>
          )) : <EmptyState description="当前学生没有 Quiz / Quick Check 事件。" title="暂无测验证据" />}
        </CardContent>
      </Card>
    </div>
  );
}

export function StudentAiEvaluation({ context, compact = false }: { context: StudentDetailContext; compact?: boolean }) {
  const mastery = context.detail.average_mastery;
  const weakPoints = buildWeakPoints(context.masteryStates, context.chapters);
  const advantages = context.masteryStates.filter((state) => state.score >= 80).length;
  const uncertain = context.masteryStates.filter((state) => state.score >= 50 && state.score < 80).length;
  const summary = mastery === null
    ? "当前学习证据不足，暂不生成强结论。"
    : mastery >= 80
      ? "整体掌握稳定，可增加综合应用与迁移任务。"
      : mastery >= 65
        ? "整体掌握基本稳定，建议优先补齐薄弱知识点。"
        : "当前掌握度偏低，建议基于具体知识点安排短周期练习与复习。";
  return (
    <Card className={cn("gap-4 py-5", !compact && "border-blue-100 bg-blue-50/35")}>
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI 学习评价与建议</CardTitle><p className="text-xs text-muted-foreground">基于真实掌握状态与 LearningEvent 的规则评价，不读取单句聊天做推断。</p></CardHeader>
      <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
        <p>{summary}</p>
        <div className="grid grid-cols-2 gap-3">
          <InfoLine label="稳定掌握" value={`${advantages} 个知识点`} />
          <InfoLine label="过渡状态" value={`${uncertain} 个知识点`} />
        </div>
        {weakPoints.length ? <p>建议优先复习：{weakPoints.slice(0, 3).map((point) => point.name).join("、")}。</p> : null}
        <p className="text-xs">评价依据：掌握状态、Quiz 事件、重复错误、教师修正和最近 LearningEvent。</p>
      </CardContent>
    </Card>
  );
}

export function TeacherNotesTab({ context, onChanged }: { context: StudentDetailContext; onChanged: () => void }) {
  const notes = context.detail.recent_evidence.filter((event) => event.event_type === "teacher_adjustment" && event.knowledge_point_id === null);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>教师备注</CardTitle><p className="text-xs text-muted-foreground">备注以教师修正事件持久化，不参与学生/AI 消息顺序。</p></CardHeader>
        <CardContent className="space-y-3 px-5">
          {notes.length ? notes.map((note) => (
            <div className="rounded-lg border border-border px-4 py-3" key={note.event_id}><p className="text-sm leading-6">{note.evidence || "教师备注"}</p><p className="mt-2 text-xs text-muted-foreground">{note.created_at.slice(0, 16).replace("T", " ")}</p></div>
          )) : <EmptyState description="当前还没有教师备注。" title="暂无教师记录" />}
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>新增备注</CardTitle></CardHeader>
        <CardContent className="px-5"><TeacherNoteForm courseId={context.course.id} onChanged={onChanged} studentId={context.member.user_id} /></CardContent>
      </Card>
    </div>
  );
}

export function RecentEvents({ context }: { context: StudentDetailContext }) {
  const events = context.detail.recent_evidence.slice(0, 6);
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>最近学习活动</CardTitle><p className="text-xs text-muted-foreground">最多展示最近 6 条真实事件。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        {events.length ? events.map((event) => (
          <div className="flex items-start gap-3" key={event.event_id}>
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0"><p className="truncate text-sm font-medium">{eventLabel(event.event_type)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{event.knowledge_point_name || event.evidence || "课程学习事件"}</p><p className="mt-1 text-[11px] text-muted-foreground">{event.created_at.slice(0, 16).replace("T", " ")}</p></div>
          </div>
        )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无 LearningEvent。</p>}
      </CardContent>
    </Card>
  );
}

function conversationStatusLabel(status: ConversationEvidenceGroup["status"]) {
  if (status === "pending") return "待审核";
  if (status === "rejected") return "已判错";
  if (status === "reviewed") return "已审核";
  return "未审核";
}

function conversationStatusTone(status: ConversationEvidenceGroup["status"]) {
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "reviewed") return "success" as const;
  return "neutral" as const;
}

function SummaryCard({ icon: Icon, label, value, tone = "default" }: { icon: typeof BookOpen; label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <Card className={cn("gap-2 py-4", tone === "warning" && "bg-orange-50/40")} size="sm">
      <CardContent className="px-5"><Icon className={cn("size-4", tone === "warning" ? "text-orange-500" : "text-primary")} /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></CardContent>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
