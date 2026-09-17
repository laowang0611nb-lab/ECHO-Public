"use client";
import { Activity, AlertTriangle, ChevronRight, ClipboardCheck, GraduationCap, Search, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LearningTrendChart } from "@/components/charts/learning-trend-chart";
import { useStudentAnalytics } from "@/features/students/queries";
import type { StudentAnalyticsTab } from "@/features/students/types";
import { buildEvidenceTrend, eventLabel, statusLabel, statusTone } from "@/features/students/view-model";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "overview", label: "学情总览" },
  { value: "students", label: "学生列表" },
  { value: "behavior", label: "学习行为" },
  { value: "mastery", label: "知识掌握" },
  { value: "difficulty", label: "学习困难" },
  { value: "segments", label: "分层分析" },
] as const;

export function StudentLearningPage({
  initialCourseId,
  initialTab,
}: {
  initialCourseId?: string;
  initialTab: StudentAnalyticsTab;
}) {
  const router = useRouter();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const [activeTab, setActiveTab] = useState<StudentAnalyticsTab>(initialTab);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "stable" | "attention" | "risk" | "no_data">("all");
  const courseId = initialCourseId && courses.some((course) => course.id === initialCourseId)
    ? initialCourseId
    : selectedCourseId;
  const data = useStudentAnalytics(courseId);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.items.filter((item) => {
      const matchesSearch = !query || item.member.display_name.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data.items, search, statusFilter]);

  function handleTabChange(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as StudentAnalyticsTab) : "overview";
    setActiveTab(next);
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    params.set("tab", next);
    router.replace(`/students?${params.toString()}`, { scroll: false });
  }

  if (!courseId) {
    return <EmptyState action={<Link className={buttonVariants()} href="/courses">进入课程管理</Link>} description="请先选择课程，学生学情会围绕当前课程展示。" title="尚未选择课程" />;
  }
  if (data.isLoading) return <LoadingState label="正在加载学生学情..." />;
  if (data.isError) return <ErrorState description="学生学情加载失败，请确认后端服务后重试。" onRetry={data.refetch} />;

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              items={courses.map((item) => ({ value: item.id, label: item.name }))}
              onValueChange={(value) => value && setSelectedCourseId(value)}
              value={courseId}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{courses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
        }
        breadcrumbs={[{ label: "学生学情" }]}
        description="用数据看见每一位学生的学习状态，及时发现问题，提供更有针对性的教学支持。"
        title="学生学情"
      />

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto border-b border-border px-0" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-10 flex-none px-4" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent className="mt-5" value={activeTab}>
          {activeTab === "overview" ? <Overview items={filteredItems} summary={data.summary} /> : null}
          {activeTab === "students" ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="搜索学生姓名..." value={search} />
                </div>
                <Select
                  items={[
                    { value: "all", label: "全部状态" },
                    { value: "stable", label: "稳定掌握" },
                    { value: "attention", label: "需要关注" },
                    { value: "risk", label: "重点关注" },
                    { value: "no_data", label: "暂无证据" },
                  ]}
                  onValueChange={(value) => value && setStatusFilter(value as typeof statusFilter)}
                  value={statusFilter}
                >
                  <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="stable">稳定掌握</SelectItem>
                    <SelectItem value="attention">需要关注</SelectItem>
                    <SelectItem value="risk">重点关注</SelectItem>
                    <SelectItem value="no_data">暂无证据</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </div>
              <StudentList courseId={courseId} items={filteredItems} />
            </div>
          ) : null}
          {activeTab === "behavior" ? <BehaviorPanel items={filteredItems} /> : null}
          {activeTab === "mastery" ? <ClassMasteryPanel data={data} /> : null}
          {activeTab === "difficulty" ? <DifficultyPanel items={filteredItems} /> : null}
          {activeTab === "segments" ? <SegmentsPanel items={filteredItems} /> : null}
        </TabsContent>
      </Tabs>

      {!data.items.length ? <EmptyState description="当前课程还没有学生成员，学生加入后会同步显示学情。" title="暂无学生" /> : null}
    </div>
  );
}

function Overview({ items, summary }: { items: ReturnType<typeof useStudentAnalytics>["items"]; summary: ReturnType<typeof useStudentAnalytics>["summary"] }) {
  const trend = buildEvidenceTrend(items);
  const sorted = [...items].sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1));
  const attention = items.filter((item) => item.riskReason && (item.status === "risk" || item.status === "attention"));
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="学生总数" supporting="当前课程成员" value={summary.studentCount} />
        <StatCard icon={Activity} label="平均掌握度" suffix="%" supporting="有证据知识点的平均值" value={summary.averageMastery} />
        <StatCard icon={TrendingUp} label="近期活跃" supporting="最近 7 天有学习证据" value={summary.activeCount} />
        <StatCard icon={AlertTriangle} label="需要关注" supporting="基于当前真实证据" tone="warning" value={summary.attentionCount} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.65fr)]">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>学习证据趋势</CardTitle><p className="text-xs text-muted-foreground">基于最近 7 天真实 LearningEvent，不代表上课时长。</p></CardHeader>
          <CardContent className="px-5">
            <LearningTrendChart currentMastery={null} data={trend} metric="interaction" />
          </CardContent>
        </Card>
        <KnowledgeDistribution summary={summary} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <TopStudents courseId={items[0]?.member.course_id ?? ""} items={sorted.slice(0, 5)} />
        <AttentionStudents courseId={items[0]?.member.course_id ?? ""} items={attention.slice(0, 5)} />
        <BehaviorPanel items={items} compact />
      </section>

      <EchoStudentInsight items={items} summary={summary} />
    </div>
  );
}

function KnowledgeDistribution({ summary }: { summary: ReturnType<typeof useStudentAnalytics>["summary"] }) {
  const total = Math.max(1, summary.studentCount);
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>知识掌握分布</CardTitle><p className="text-xs text-muted-foreground">仅统计存在真实掌握状态的学生。</p></CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="mx-auto flex size-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(#2f7cf6 0 ${summary.masteryDistribution[0]?.value / total * 100}%, #22c55e ${summary.masteryDistribution[0]?.value / total * 100}% ${(summary.masteryDistribution[0]?.value + summary.masteryDistribution[1]?.value) / total * 100}%, #fb923c ${(summary.masteryDistribution[0]?.value + summary.masteryDistribution[1]?.value) / total * 100}% ${(summary.masteryDistribution[0]?.value + summary.masteryDistribution[1]?.value + summary.masteryDistribution[2]?.value) / total * 100}%, #fda4af ${(summary.masteryDistribution[0]?.value + summary.masteryDistribution[1]?.value + summary.masteryDistribution[2]?.value) / total * 100}% 100%)` }}>
          <div className="flex size-28 flex-col items-center justify-center rounded-full bg-card">
            <span className="text-2xl font-semibold">{summary.studentCount}</span>
            <span className="text-xs text-muted-foreground">学生总数</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {summary.masteryDistribution.map((item) => <div className="flex items-center gap-2 text-sm" key={item.label}><span className={cn("size-2 rounded-full", item.tone)} /><span className="flex-1 text-muted-foreground">{item.label}</span><span className="font-medium">{item.value}</span></div>)}
        </div>
      </CardContent>
    </Card>
  );
}

function TopStudents({ courseId, items }: { courseId: string; items: ReturnType<typeof useStudentAnalytics>["items"] }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>学生表现参考</CardTitle><p className="text-xs text-muted-foreground">仅用于发现学习模式，不对外公开排名。</p></CardHeader>
      <CardContent className="space-y-2 px-5">
        {items.length ? items.map((item, index) => <StudentCompactRow courseId={courseId} index={index + 1} item={item} key={item.member.id} />) : <p className="py-8 text-center text-sm text-muted-foreground">暂无学生证据。</p>}
      </CardContent>
    </Card>
  );
}

function AttentionStudents({ courseId, items }: { courseId: string; items: ReturnType<typeof useStudentAnalytics>["items"] }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5"><CardTitle>需要关注的学生</CardTitle><p className="text-xs text-muted-foreground">关注状态来自掌握度和学习证据规则。</p></CardHeader>
      <CardContent className="space-y-2 px-5">
        {items.length ? items.map((item) => (
          <Link className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 hover:border-orange-200" href={`/students/${item.member.user_id}?from=students&courseId=${courseId}`} key={item.member.id}>
            <span className="flex size-8 items-center justify-center rounded-full bg-orange-50 text-xs font-semibold text-orange-700">{item.member.display_name.slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.member.display_name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.riskReason}</span></span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        )) : <p className="py-8 text-center text-sm text-muted-foreground">当前没有需要关注的学生。</p>}
      </CardContent>
    </Card>
  );
}

function StudentCompactRow({ courseId, item, index }: { courseId: string; item: ReturnType<typeof useStudentAnalytics>["items"][number]; index: number }) {
  return (
    <Link className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/40" href={`/students/${item.member.user_id}?from=students&courseId=${courseId}`}>
      <span className="w-5 text-xs text-muted-foreground">{index}</span>
      <span className="flex size-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-primary">{item.member.display_name.slice(0, 1)}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.member.display_name}</span>
      <span className="text-sm font-semibold">{item.mastery === null ? "暂无" : `${Math.round(item.mastery)}%`}</span>
    </Link>
  );
}

function StudentList({ courseId, items }: { courseId: string; items: ReturnType<typeof useStudentAnalytics>["items"] }) {
  if (!items.length) return <EmptyState description="当前筛选条件下没有学生。" title="没有匹配学生" />;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4"><CardTitle>学生列表</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {items.map((item) => (
          <Link className="grid gap-3 px-5 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(180px,1fr)_120px_180px_180px_110px]" href={`/students/${item.member.user_id}?from=students&courseId=${courseId}`} key={item.member.id}>
            <span className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-primary">{item.member.display_name.slice(0, 1)}</span><span><span className="block text-sm font-medium">{item.member.display_name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.member.joined_at.slice(0, 10)} 加入</span></span></span>
            <StatusBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge>
            <span><span className="block text-xs text-muted-foreground">掌握度</span><span className="mt-1 block text-sm font-medium">{item.mastery === null ? "暂无" : `${Math.round(item.mastery)}%`}</span></span>
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">薄弱知识点</span><span className="mt-1 block truncate text-sm">{item.weakKnowledgePoints[0]?.name ?? "暂无"}</span></span>
            <span className="text-right text-xs text-muted-foreground">{item.latestEvidence ? item.latestEvidence.created_at.slice(0, 10) : "暂无证据"}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function BehaviorPanel({ items, compact = false }: { items: ReturnType<typeof useStudentAnalytics>["items"]; compact?: boolean }) {
  const counts = items.reduce<Record<string, number>>((result, item) => {
    for (const event of item.detail?.recent_evidence ?? []) result[event.event_type] = (result[event.event_type] ?? 0) + 1;
    return result;
  }, {});
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, compact ? 5 : 12);
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>学习行为分布</CardTitle><p className="text-xs text-muted-foreground">按真实 LearningEvent 类型统计。</p></CardHeader>
      <CardContent className="space-y-3 px-5">
        {rows.length ? rows.map(([type, count]) => (
          <div key={type}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span>{eventLabel(type)}</span><span className="text-muted-foreground">{count} 次</span></div>
            <Progress value={total ? (count / total) * 100 : 0} />
          </div>
        )) : <p className="py-8 text-center text-sm text-muted-foreground">暂无学习行为证据。</p>}
      </CardContent>
    </Card>
  );
}

function ClassMasteryPanel({ data }: { data: ReturnType<typeof useStudentAnalytics> }) {
  const chapters = data.chapterAnalytics;
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5"><CardTitle>章节掌握概览</CardTitle><p className="text-xs text-muted-foreground">来自真实章节学情接口。</p></CardHeader>
      <CardContent className="space-y-4 px-5">
        {chapters.length ? chapters.map((chapter) => (
          <div key={chapter.chapter_id}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{chapter.title}</span><span>{chapter.average_mastery === null ? "暂无" : `${Math.round(chapter.average_mastery)}%`}</span></div>
            <Progress value={chapter.average_mastery ?? 0} />
          </div>
        )) : <EmptyState description="当前课程还没有章节分析数据。" title="暂无章节证据" />}
      </CardContent>
    </Card>
  );
}

function DifficultyPanel({ items }: { items: ReturnType<typeof useStudentAnalytics>["items"] }) {
  const difficulties = items.flatMap((item) => item.weakKnowledgePoints.map((point) => ({ ...point, student: item.member.display_name })));
  if (!difficulties.length) return <EmptyState description="当前没有学生进入薄弱知识点阈值。" title="暂无学习困难证据" />;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4"><CardTitle>薄弱知识点</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {difficulties.slice(0, 30).map((item, index) => (
          <div className="flex items-center gap-4 px-5 py-4" key={`${item.student}-${item.id}-${index}`}>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.student}</span></span>
            <span className="text-sm font-semibold text-orange-600">{Math.round(item.score)}%</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SegmentsPanel({ items }: { items: ReturnType<typeof useStudentAnalytics>["items"] }) {
  const segments = [
    { label: "稳定掌握", tone: "success", values: items.filter((item) => item.status === "stable") },
    { label: "基本掌握", tone: "info", values: items.filter((item) => item.status === "basic") },
    { label: "需要加强", tone: "warning", values: items.filter((item) => item.status === "attention") },
    { label: "重点关注", tone: "danger", values: items.filter((item) => item.status === "risk") },
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {segments.map((segment) => (
        <Card className="gap-3 py-5" key={segment.label}>
          <CardHeader className="px-5"><StatusBadge tone={segment.tone}>{segment.label}</StatusBadge></CardHeader>
          <CardContent className="px-5"><p className="text-3xl font-semibold">{segment.values.length}</p><p className="mt-2 text-sm text-muted-foreground">来自当前证据规则分组。</p></CardContent>
        </Card>
      ))}
    </div>
  );
}

function EchoStudentInsight({ items, summary }: { items: ReturnType<typeof useStudentAnalytics>["items"]; summary: ReturnType<typeof useStudentAnalytics>["summary"] }) {
  const mastered = summary.masteryDistribution[0]?.value ?? 0;
  const risks = summary.attentionCount;
  return (
    <Card className="gap-4 border-blue-100 bg-blue-50/35 py-5">
      <CardHeader className="px-5"><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />ECHO 学情洞察</CardTitle><p className="text-xs text-muted-foreground">由当前真实掌握状态与 LearningEvent 规则生成。</p></CardHeader>
      <CardContent className="grid gap-3 px-5 md:grid-cols-3">
        <InsightItem icon={GraduationCap} text={`${mastered} 名学生已达到 80% 以上掌握参考值。`} />
        <InsightItem icon={AlertTriangle} text={`${risks} 名学生需要基于低掌握或低活跃证据进一步关注。`} />
        <InsightItem icon={ClipboardCheck} text={`${items.filter((item) => item.evidenceCount > 0).length} 名学生已有可追溯学习证据。`} tone="info" />
      </CardContent>
    </Card>
  );
}

function InsightItem({ icon: Icon, text, tone = "warning" }: { icon: typeof Users; text: string; tone?: "warning" | "info" }) {
  return <div className={cn("rounded-lg border border-border bg-card px-4 py-3 text-sm", tone === "warning" && "border-orange-100")}><Icon className={cn("size-4", tone === "warning" ? "text-orange-500" : "text-primary")} /><p className="mt-2 leading-6 text-muted-foreground">{text}</p></div>;
}
