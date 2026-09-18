"use client";

import { BookOpen, Building2, CalendarDays, Info, KeyRound, LayoutDashboard, Mail, RefreshCw, ServerCog, ShieldCheck, Sparkles, User, Users, Waypoints } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { useDemoMode } from "@/features/demo/demo-provider";
import { useDemoStatus } from "@/features/demo/queries";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { useServerHealth, useSystemStatus } from "@/features/server-settings/queries";
import { serviceStateLabel } from "@/features/server-settings/view-model";
import { useStudentAnalytics } from "@/features/students/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const tabs = [
  { value: "profile", label: "个人信息" },
  { value: "security", label: "账号与安全" },
  { value: "system", label: "系统设置" },
  { value: "notifications", label: "通知偏好" },
  { value: "appearance", label: "外观设置" },
  { value: "about", label: "关于 ECHO" },
] as const;

type MeTab = (typeof tabs)[number]["value"];

interface LocalPreferences {
  notifications: {
    highRiskReview: boolean;
    studentAnomaly: boolean;
    courseMember: boolean;
    systemStatus: boolean;
  };
  appearance: {
    density: "comfortable" | "compact";
    reduceMotion: boolean;
  };
}

const PREFERENCE_KEY = "echo.teacher.preferences";
const defaultPreferences: LocalPreferences = {
  notifications: {
    highRiskReview: true,
    studentAnomaly: true,
    courseMember: false,
    systemStatus: true,
  },
  appearance: {
    density: "comfortable",
    reduceMotion: false,
  },
};

export function MePage({ initialTab }: { initialTab: MeTab }) {
  const { user } = useTeacherSession();
  const { courses, selectedCourseId, selectedCourse, setSelectedCourseId } = useCourseWorkspace();
  const dashboard = useTeacherDashboardOverview(user?.id, selectedCourseId);
  const students = useStudentAnalytics(selectedCourseId);
  const knowledge = useKnowledgeBaseData(selectedCourseId);
  const health = useServerHealth();
  const system = useSystemStatus();
  const demoStatus = useDemoStatus();
  const demo = useDemoMode();
  const [activeTab, setActiveTab] = useState<MeTab>(initialTab);
  const [preferences, setPreferences] = useState<LocalPreferences>(defaultPreferences);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("当前浏览器会话");


  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(PREFERENCE_KEY);
      if (stored) {
        try {
          setPreferences({ ...defaultPreferences, ...(JSON.parse(stored) as Partial<LocalPreferences>) });
        } catch {
          window.localStorage.removeItem(PREFERENCE_KEY);
        }
      }
      setDeviceLabel(shortDeviceLabel(window.navigator.userAgent));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updatePreferences(next: LocalPreferences) {
    setPreferences(next);
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(next));
  }

  function changeTab(value: string) {
    const next = tabs.some((tab) => tab.value === value) ? (value as MeTab) : "profile";
    setActiveTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `/me?${params.toString()}`);
  }

  const teacherFields = useMemo(
    () => [
      selectedCourse?.name,
      ...courses.map((course) => course.term ?? "").filter(Boolean).slice(0, 2),
    ].filter((value): value is string => Boolean(value)),
    [courses, selectedCourse?.name],
  );

  if (!user) return <LoadingState label="正在读取教师账号..." />;

  const stats = {
    courses: courses.length,
    students: students.summary.studentCount,
    interactions: dashboard.data?.stats.weekly_interaction_count ?? 0,
    resources: knowledge.resources.length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { void health.refetch(); void system.refetch(); }} type="button" variant="outline">
              <RefreshCw data-icon="inline-start" />刷新状态
            </Button>
            <Link className={buttonVariants()} href="/settings/server">服务器设置</Link>
          </div>
        }
        breadcrumbs={[{ label: "我的" }]}
        description="管理个人信息、系统设置与偏好，让 ECHO 更好地为你的教学服务。"
        title="我的"
      />

      <Tabs onValueChange={changeTab} value={activeTab}>
        <TabsList className="h-auto w-full grid-cols-2 rounded-none border-b border-border px-0 sm:grid-cols-3 xl:grid-cols-6" variant="line">
          {tabs.map((tab) => <TabsTrigger className="h-11 w-full px-2" key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent className="mt-5" value="profile">
          <ProfileTab
            courses={courses}
            fields={teacherFields}
            onEdit={() => setProfileOpen(true)}
            selectedCourseId={selectedCourseId}
            stats={stats}
            user={user}
            setSelectedCourseId={setSelectedCourseId}
          />
        </TabsContent>

        <TabsContent className="mt-5" value="security">
          <SecurityTab deviceLabel={deviceLabel} user={user} />
        </TabsContent>

        <TabsContent className="mt-5" value="system">
          <SystemSettingsTab
            demoSeeded={demoStatus.data?.seeded ?? false}
            demoActive={demo.active}
            demoMode={demo.mode}
            healthVersion={health.data?.version}
            systemStatus={system.data?.status}
          />
        </TabsContent>

        <TabsContent className="mt-5" value="notifications">
          <NotificationTab preferences={preferences} update={updatePreferences} />
        </TabsContent>

        <TabsContent className="mt-5" value="appearance">
          <AppearanceTab preferences={preferences} update={updatePreferences} />
        </TabsContent>

        <TabsContent className="mt-5" value="about">
          <AboutTab version={health.data?.version} />
        </TabsContent>
      </Tabs>

      <ProfileDrawer onOpenChange={setProfileOpen} open={profileOpen} user={user} />
    </div>
  );
}

function ProfileTab({
  user,
  stats,
  fields,
  courses,
  selectedCourseId,
  setSelectedCourseId,
  onEdit,
}: {
  user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>;
  stats: { courses: number; students: number; interactions: number; resources: number };
  fields: string[];
  courses: ReturnType<typeof useCourseWorkspace>["courses"];
  selectedCourseId: string | null;
  setSelectedCourseId: (courseId: string) => void;
  onEdit: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <div className="space-y-5">
        <Card className="gap-5 py-5">
          <CardContent className="flex flex-col gap-5 px-5 sm:flex-row sm:items-start">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-full bg-sidebar text-3xl font-semibold text-white">
              {user.display_name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{user.display_name}</h2>
                <StatusBadge tone="info">教师</StatusBadge>
              </div>
              <p className="mt-3 text-sm font-medium">教育创造更多可能</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">用技术连接教学证据、AI 辅助与教师判断，让每一次教学行动都可追踪。</p>
              <Button className="mt-4" onClick={onEdit} type="button" variant="outline">查看资料边界</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4"><CardTitle>基本信息</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border px-0">
            <ProfileRow icon={User} label="姓名" value={user.display_name} />
            <ProfileRow icon={Mail} label="邮箱" value={user.email} />
            <ProfileRow icon={Building2} label="所属院系" value="未配置" />
            <ProfileRow icon={KeyRound} label="工号" value="未配置" />
            <ProfileRow icon={CalendarDays} label="加入时间" value={user.created_at.slice(0, 10)} />
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>教学领域</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 px-5">
            {fields.length ? fields.map((field) => <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-primary" key={field}>{field}</span>) : <p className="text-sm text-muted-foreground">暂无可识别教学领域。</p>}
            <p className="w-full text-xs text-muted-foreground">教学领域编辑接口尚未提供，当前仅展示课程中可识别的真实领域。</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="gap-4 border-blue-200 bg-blue-50/45 py-5">
          <CardContent className="px-5">
            <p className="text-lg font-semibold text-blue-950">教育不是灌输，而是点燃</p>
            <p className="mt-3 text-sm text-blue-800">—— ECHO</p>
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>我的教学数据</CardTitle>
              <select
                className="max-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-xs"
                onChange={(event) => setSelectedCourseId(event.target.value)}
                value={selectedCourseId ?? ""}
              >
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 sm:grid-cols-2">
            <SmallMetric icon={BookOpen} label="授课课程" value={stats.courses} />
            <SmallMetric icon={Users} label="学生总数" value={stats.students} />
            <SmallMetric icon={Sparkles} label="近七天交互" value={stats.interactions} />
            <SmallMetric icon={Waypoints} label="课程资源" value={stats.resources} />
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <QuickAction href="/courses" icon={BookOpen} title="课程管理" description="管理我的课程" />
          <QuickAction href="/knowledge" icon={LayoutDashboard} title="知识库" description="查看与编辑资源" />
          <QuickAction href="/teaching-strategies" icon={Waypoints} title="AI 教学策略" description="配置教学规则" />
          <QuickAction href="/settings/server" icon={ServerCog} title="系统设置" description="检查本地服务状态" />
        </div>

        <Card className="gap-4 border-blue-200 bg-blue-50/40 py-5">
          <CardContent className="flex items-center justify-between gap-4 px-5">
            <div><p className="font-semibold text-blue-950">与 ECHO 一起，让教学更智能</p><p className="mt-1 text-xs text-blue-800">基于数据 · 面向实践 · 持续进化</p></div>
            <Link className={buttonVariants({ variant: "outline" })} href="/ai-insights">进入 AI 教学</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SecurityTab({ user, deviceLabel }: { user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>; deviceLabel: string }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4"><CardTitle>登录账号</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border px-0">
          <ProfileRow icon={Mail} label="登录邮箱" value={user.email} />
          <ProfileRow icon={ShieldCheck} label="身份" value="教师" />
          <ProfileRow icon={KeyRound} label="密码" value="后端未提供密码接口" />
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>当前登录设备</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm text-muted-foreground">
          <p>{deviceLabel}</p>
          <p>当前使用开发认证 Session，登录设备历史与安全日志接口尚未提供。</p>
          <Button disabled type="button" variant="outline">修改密码（未提供）</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemSettingsTab({
  healthVersion,
  systemStatus,
  demoActive,
  demoSeeded,
  demoMode,
}: {
  healthVersion?: string;
  systemStatus?: string;
  demoActive: boolean;
  demoSeeded: boolean;
  demoMode: "stable" | "live";
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>服务器连接</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <SettingLine label="Local Server" value={systemStatus ? serviceStateLabel(systemStatus as "healthy" | "warning" | "offline" | "unconfigured") : "检测中"} />
          <SettingLine label="API 版本" value={healthVersion ?? "未知"} />
          <SettingLine label="运行模式" value="本地部署" />
          <Link className={buttonVariants({ variant: "outline" })} href="/settings/server">打开服务器设置</Link>
        </CardContent>
      </Card>
      <Card className="gap-4 border-blue-200 bg-blue-50/40 py-5">
        <CardHeader className="px-5"><CardTitle>Demo 模式</CardTitle><p className="text-xs text-muted-foreground">演示数据始终独立标记，不冒充真实教学结果。</p></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm">
          <SettingLine label="当前状态" value={demoActive ? "运行中" : "未开启"} />
          <SettingLine label="Demo 数据集" value={demoSeeded ? "已就绪" : "尚未生成"} />
          <SettingLine label="AI 模式" value={demoMode === "stable" ? "稳定模式" : "实时模式"} />
          <Link className={buttonVariants()} href="/settings/demo">进入 Demo 模式</Link>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationTab({ preferences, update }: { preferences: LocalPreferences; update: (next: LocalPreferences) => void }) {
  const rows = [
    ["highRiskReview", "AI 回答高风险提醒"],
    ["studentAnomaly", "学生连续错误与异常提醒"],
    ["courseMember", "课程成员加入提醒"],
    ["systemStatus", "系统运行状态提醒"],
  ] as const;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4"><CardTitle>通知偏好</CardTitle><p className="text-xs text-muted-foreground">本页偏好保存在当前教师浏览器，不上传后端。</p></CardHeader>
      <CardContent className="divide-y divide-border px-0">
        {rows.map(([key, label]) => (
          <div className="flex items-center justify-between gap-4 px-5 py-4" key={key}>
            <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">浏览器本地偏好</p></div>
            <Switch checked={preferences.notifications[key]} onCheckedChange={(checked) => update({ ...preferences, notifications: { ...preferences.notifications, [key]: checked } })} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AppearanceTab({ preferences, update }: { preferences: LocalPreferences; update: (next: LocalPreferences) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>界面密度</CardTitle></CardHeader>
        <CardContent className="flex gap-2 px-5">
          <Button onClick={() => update({ ...preferences, appearance: { ...preferences.appearance, density: "comfortable" } })} type="button" variant={preferences.appearance.density === "comfortable" ? "default" : "outline"}>舒适</Button>
          <Button onClick={() => update({ ...preferences, appearance: { ...preferences.appearance, density: "compact" } })} type="button" variant={preferences.appearance.density === "compact" ? "default" : "outline"}>紧凑</Button>
        </CardContent>
      </Card>
      <Card className="gap-4 py-5">
        <CardHeader className="px-5"><CardTitle>动画效果</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4 px-5">
          <div><p className="text-sm font-medium">减少动画</p><p className="mt-1 text-xs text-muted-foreground">仅影响当前浏览器中的后续浏览。</p></div>
          <Switch checked={preferences.appearance.reduceMotion} onCheckedChange={(checked) => update({ ...preferences, appearance: { ...preferences.appearance, reduceMotion: checked } })} />
        </CardContent>
      </Card>
      <Card className="gap-4 py-5 xl:col-span-2">
        <CardHeader className="px-5"><CardTitle>主题</CardTitle></CardHeader>
        <CardContent className="px-5 text-sm text-muted-foreground">当前比赛版本固定使用浅色主题；深色主题尚未进入 P0。</CardContent>
      </Card>
    </div>
  );
}

function AboutTab({ version }: { version?: string }) {
  const links = ["隐私政策", "使用条款", "帮助中心", "开源许可", "系统信息"];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="gap-5 py-5">
        <CardHeader className="px-5"><CardTitle>ECHO</CardTitle><p className="text-xs text-muted-foreground">Educational Intelligence</p></CardHeader>
        <CardContent className="space-y-4 px-5 text-sm leading-6 text-muted-foreground">
          <p>ECHO 是面向高校教学场景的教育智能体系统，连接学生学习交互、课程知识、AI 教学与教师反馈。</p>
          <p>当前版本：{version ?? "读取中"} · 本地部署教师端</p>
        </CardContent>
      </Card>
      <Card className="gap-3 py-5">
        <CardHeader className="px-5"><CardTitle>系统入口</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-5">
          {links.map((label) => <button className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm text-muted-foreground" disabled key={label} type="button">{label}<span className="text-xs">未提供</span></button>)}
          <button className={buttonVariants({ variant: "outline" })} disabled type="button"><Info data-icon="inline-start" />系统信息（后端未提供）</button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return <div className="flex items-center gap-3 px-5 py-3.5"><Icon className="size-4 shrink-0 text-muted-foreground" /><span className="w-24 text-sm text-muted-foreground">{label}</span><span className="min-w-0 flex-1 truncate text-right text-sm font-medium">{value}</span></div>;
}

function SmallMetric({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-muted/20 px-4 py-4"><Icon className="size-4 text-primary" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function QuickAction({ href, icon: Icon, title, description }: { href: string; icon: typeof BookOpen; title: string; description: string }) {
  return <Link className="rounded-xl border-2 border-border bg-card px-4 py-4 transition hover:-translate-y-px hover:border-primary/35" href={href}><Icon className="size-4 text-primary" /><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></Link>;
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function ProfileDrawer({ open, onOpenChange, user }: { open: boolean; onOpenChange: (open: boolean) => void; user: NonNullable<ReturnType<typeof useTeacherSession>["user"]> }) {
  return (
    <Drawer onOpenChange={onOpenChange} open={open} swipeDirection="right">
      <DrawerContent>
        <DrawerHeader><DrawerTitle>教师资料</DrawerTitle><DrawerDescription>当前后端只有开发认证的用户字段，完整教师资料编辑接口尚未提供。</DrawerDescription></DrawerHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">显示名称</span><Input disabled value={user.display_name} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">邮箱</span><Input disabled value={user.email} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">院系 / 工号 / 教学领域</span><Input disabled value="后端未提供" /></label>
        </div>
        <DrawerFooter><Button onClick={() => onOpenChange(false)} type="button">关闭</Button></DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function shortDeviceLabel(userAgent: string) {
  if (/Windows/i.test(userAgent)) return "Windows · ECHO Local Web";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "macOS · ECHO Local Web";
  if (/Android/i.test(userAgent)) return "Android · 浏览器";
  if (/iPhone|iPad/i.test(userAgent)) return "iOS · 浏览器";
  return "当前浏览器会话";
}

export function normalizeMeTab(value?: string): MeTab {
  return tabs.some((tab) => tab.value === value) ? (value as MeTab) : "profile";
}
