"use client";

import { ApiClientError } from "@echo/api-client";
import type { TeacherProfile, TeacherProfileUpdateRequest } from "@echo/shared-types";
import { BookOpen, Building2, CalendarDays, Camera, KeyRound, LayoutDashboard, Mail, Pencil, Plus, RefreshCw, Save, ServerCog, ShieldCheck, Sparkles, Trash2, User, Users, Waypoints, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { UserAvatar } from "@/components/common/user-avatar";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeacherDashboardOverview } from "@/features/dashboard/queries";
import { useDemoMode } from "@/features/demo/demo-provider";
import { useDemoStatus } from "@/features/demo/queries";
import { LegalLinks } from "@/features/dashboard/components/legal-links";
import { useKnowledgeBaseData } from "@/features/knowledge/queries";
import { useChangePassword, useDeleteAvatar, useTeacherProfile, useUpdateTeacherProfile, useUploadAvatar } from "@/features/me/queries";
import { useServerHealth, useSystemStatus } from "@/features/server-settings/queries";
import { serviceStateLabel } from "@/features/server-settings/view-model";
import { useStudentAnalytics } from "@/features/students/queries";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { TEACHER_WEB_VERSION } from "@/lib/version";
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

function roleLabel(role: string) {
  if (role === "teacher") return "教师";
  if (role === "student") return "学生";
  return "用户";
}

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
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const dashboard = useTeacherDashboardOverview(user?.id, selectedCourseId);
  const students = useStudentAnalytics(selectedCourseId);
  const knowledge = useKnowledgeBaseData(selectedCourseId);
  const health = useServerHealth();
  const system = useSystemStatus();
  const demoStatus = useDemoStatus();
  const demo = useDemoMode();
  const profile = useTeacherProfile();
  const [activeTab, setActiveTab] = useState<MeTab>(initialTab);
  const [preferences, setPreferences] = useState<LocalPreferences>(defaultPreferences);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
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

  const teacherFields = profile.data?.teaching_fields ?? [];

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
            profile={profile.data ?? null}
            profileLoading={profile.isLoading}
            profileNotice={profileNotice}
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
          <AboutTab apiVersion={health.data?.version} demoActive={demo.active} />
        </TabsContent>
      </Tabs>

      {profileOpen ? (
        <ProfileDrawer
          onOpenChange={setProfileOpen}
          onSaved={() => setProfileNotice("教师资料已保存，Header 与当前个人资料已同步更新。")}
          open
          profile={profile.data ?? null}
          user={user}
        />
      ) : null}
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
  profile,
  profileLoading,
  profileNotice,
}: {
  user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>;
  stats: { courses: number; students: number; interactions: number; resources: number };
  fields: string[];
  profile: TeacherProfile | null;
  profileLoading: boolean;
  profileNotice: string | null;
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
            <UserAvatar
              avatarUrl={user.avatar_url ?? profile?.avatar_url}
              className="size-24"
              fallbackClassName="bg-sidebar text-3xl font-semibold text-white"
              name={user.display_name}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{user.display_name}</h2>
                <StatusBadge tone="info">{roleLabel(profile?.role ?? user.role)}</StatusBadge>
              </div>
              <p className="mt-3 text-sm font-medium">教育创造更多可能</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">用技术连接教学证据、AI 辅助与教师判断，让每一次教学行动都可追踪。</p>
              <Button className="mt-4" onClick={onEdit} type="button" variant="outline">
                <Pencil data-icon="inline-start" />
                编辑教师资料
              </Button>
              {profileNotice ? <p className="mt-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{profileNotice}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4"><CardTitle>基本信息</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border px-0">
            <ProfileRow icon={User} label="姓名" value={user.display_name} />
            <ProfileRow icon={ShieldCheck} label="角色" value={roleLabel(profile?.role ?? user.role)} />
            <ProfileRow icon={Mail} label="邮箱" value={user.email} />
            <ProfileRow icon={Building2} label="学校" value={profile?.school_name || "未配置"} />
            <ProfileRow icon={Building2} label="所属院系" value={profile?.department || "未配置"} />
            <ProfileRow icon={KeyRound} label="工号" value={profile?.employee_no || "未配置"} />
            <ProfileRow icon={ShieldCheck} label="职称" value={profile?.title || "未配置"} />
            <ProfileRow icon={CalendarDays} label="加入时间" value={user.created_at.slice(0, 10)} />
            {profileLoading ? <p className="px-5 py-3 text-xs text-muted-foreground">正在读取教师资料...</p> : null}
          </CardContent>
        </Card>

        <Card className="gap-4 py-5">
          <CardHeader className="px-5"><CardTitle>教学领域</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 px-5">
            {fields.length ? fields.map((field) => <span className="rounded-full border-2 border-blue-100 bg-secondary px-3 py-1.5 text-xs font-medium text-primary" key={field}>{field}</span>) : <p className="text-sm text-muted-foreground">暂未配置教学领域，可在教师资料中新增。</p>}
            <p className="w-full text-xs text-muted-foreground">教学领域通过教师资料接口保存，修改后会同步到当前账号与后续 AI 教学上下文。</p>
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

function passwordErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 429) return "操作过于频繁，请稍后再试。";
    if (error.status === 503) return "认证服务暂时不可用，请稍后重试。";
    if (error.status === 504) return "认证服务响应超时，请稍后重试。";
    const detail = typeof error.detail === "string" ? error.detail : "";
    if (error.status === 409 || detail.includes("not configured")) {
      return "当前账号尚未配置密码，无法在教师端修改。";
    }
    if (error.status === 400 || detail.includes("invalid")) {
      return "当前密码不正确。";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "密码修改失败，请稍后重试。";
}

function SecurityTab({ user, deviceLabel }: { user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>; deviceLabel: string }) {
  const changePassword = useChangePassword();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function closeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
  }

  function submitPassword() {
    if (!currentPassword) {
      setError("请输入当前密码。");
      return;
    }
    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位。");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("新密码必须同时包含字母和数字。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }

    changePassword.mutate(
      { current_password: currentPassword, new_password: newPassword },
      {
        onSuccess: (result) => {
          setNotice(`密码已修改，已撤销 ${result.sessions_revoked} 个旧 Refresh Session。`);
          setOpen(false);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setError(null);
        },
        onError: (requestError) => setError(passwordErrorMessage(requestError)),
      },
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-0 overflow-hidden border-2 py-0">
        <CardHeader className="border-b px-5 py-4"><CardTitle>登录账号</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border px-0">
          <ProfileRow icon={Mail} label="登录邮箱" value={user.email} />
          <ProfileRow icon={ShieldCheck} label="身份" value={roleLabel(user.role)} />
          <ProfileRow icon={KeyRound} label="密码" value="可通过修改密码接口更新" />
        </CardContent>
      </Card>
      <Card className="gap-4 border-2 py-5">
        <CardHeader className="px-5"><CardTitle>账号安全</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5 text-sm text-muted-foreground">
          <p>{deviceLabel}</p>
          <p>修改密码会验证当前密码，并使用 Argon2id 更新凭证；旧 Refresh Session 会立即撤销。</p>
          {notice ? <p className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice}</p> : null}
          <Button onClick={() => setOpen(true)} type="button" variant="outline">修改密码</Button>
        </CardContent>
      </Card>

      <Dialog onOpenChange={closeDialog} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改登录密码</DialogTitle>
            <DialogDescription>新密码至少 8 位，并同时包含字母和数字。开发演示账号若未配置密码，后端会返回对应错误。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">当前密码</span><Input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} /></label>
            <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">新密码</span><Input autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} /></label>
            <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">确认新密码</span><Input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} /></label>
            {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={changePassword.isPending} onClick={() => closeDialog(false)} type="button" variant="outline">取消</Button>
            <Button disabled={changePassword.isPending} onClick={submitPassword} type="button">{changePassword.isPending ? "正在修改..." : "确认修改"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          <SettingLine label="演示路径" value={demoMode === "stable" ? "稳定路径" : "实时操作"} />
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

function AboutTab({ apiVersion, demoActive }: { apiVersion?: string; demoActive: boolean }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="gap-5 border-2 py-5">
        <CardHeader className="px-5"><CardTitle>ECHO</CardTitle><p className="text-xs text-muted-foreground">Educational Intelligence</p></CardHeader>
        <CardContent className="space-y-4 px-5 text-sm leading-6 text-muted-foreground">
          <p>ECHO 是面向高校教学场景的教育智能体系统，连接学生学习交互、课程知识、AI 教学与教师反馈。</p>
          <div className="grid gap-3 rounded-lg border-2 border-border bg-muted/20 p-4 sm:grid-cols-2">
            <SettingLine label="教师端 Web" value={`v${TEACHER_WEB_VERSION}`} />
            <SettingLine label="后端 API" value={apiVersion ? `v${apiVersion}` : "读取中"} />
            <SettingLine label="运行环境" value={process.env.NODE_ENV === "development" ? "开发环境" : "生产环境"} />
            <SettingLine label="Demo 状态" value={demoActive ? "运行中" : "未开启"} />
          </div>
        </CardContent>
      </Card>
      <Card className="gap-4 border-2 py-5">
        <CardHeader className="px-5"><CardTitle>政策与许可</CardTitle></CardHeader>
        <CardContent className="space-y-3 px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border px-3 py-3">
            <span className="text-sm">隐私与使用条款</span>
            <LegalLinks />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-border px-3 py-3 text-sm">
            <span>开源许可</span>
            <ThirdPartyLicenseDialog />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


const runtimeLicenses = [
  { name: "Next.js", version: "16.3.5", license: "MIT", url: "https://github.com/vercel/next.js" },
  { name: "React / React DOM", version: "19.2.8", license: "MIT", url: "https://react.dev" },
  { name: "@tanstack/react-query", version: "5.102.8", license: "MIT", url: "https://tanstack.com/query" },
  { name: "@base-ui/react", version: "1.8.0", license: "MIT", url: "https://base-ui.com" },
  { name: "Apache ECharts", version: "6.1.0", license: "Apache-2.0", url: "https://echarts.apache.org" },
  { name: "Motion", version: "13.3.0", license: "MIT", url: "https://motion.dev" },
  { name: "Zustand", version: "5.0.15", license: "MIT", url: "https://zustand.docs.pmnd.rs" },
  { name: "Zod", version: "4.6.5", license: "MIT", url: "https://zod.dev" },
  { name: "Lucide React", version: "1.46.0", license: "ISC", url: "https://lucide.dev" },
  { name: "qrcode.react", version: "4.2.0", license: "ISC", url: "https://github.com/zpao/qrcode.react" },
  { name: "class-variance-authority", version: "0.7.1", license: "Apache-2.0", url: "https://cva.style" },
  { name: "tailwind-merge", version: "3.7.0", license: "MIT", url: "https://github.com/dcastil/tailwind-merge" },
] as const;

function ThirdPartyLicenseDialog() {
  return (
    <Dialog>
      <button className="text-xs font-medium text-primary hover:underline" type="button">查看许可</button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>第三方开源许可</DialogTitle>
          <DialogDescription>
            以下列出教师端 Web 的关键运行时依赖及其许可证。完整传递依赖清单将在发布包中继续附带。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] divide-y divide-border overflow-y-auto rounded-lg border-2 border-border">
          {runtimeLicenses.map((item) => (
            <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_100px_auto] sm:items-center" key={item.name}>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">v{item.version}</p></div>
              <span className="text-xs text-muted-foreground">{item.license}</span>
              <a className="text-xs font-medium text-primary hover:underline" href={item.url} rel="noreferrer" target="_blank">项目主页</a>
            </div>
          ))}
        </div>
        <DialogFooter>
          <p className="text-xs text-muted-foreground">许可证名称来自各依赖发布包；使用和再分发时以对应项目的正式许可证文本为准。</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

interface TeacherProfileForm {
  displayName: string;
  schoolName: string;
  department: string;
  employeeNo: string;
  title: string;
  teachingFields: string[];
}

function profileForm(profile: TeacherProfile | null, user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>): TeacherProfileForm {
  return {
    displayName: profile?.display_name ?? user.display_name,
    schoolName: profile?.school_name ?? "",
    department: profile?.department ?? "",
    employeeNo: profile?.employee_no ?? "",
    title: profile?.title ?? "",
    teachingFields: profile?.teaching_fields ?? [],
  };
}

function ProfileDrawer({
  open,
  onOpenChange,
  onSaved,
  profile,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  profile: TeacherProfile | null;
  user: NonNullable<ReturnType<typeof useTeacherSession>["user"]>;
}) {
  const updateProfile = useUpdateTeacherProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TeacherProfileForm>(() => profileForm(profile, user));
  const [fieldDraft, setFieldDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);

  function uploadAvatarFile(file: File) {
    setAvatarNotice(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("头像仅支持 JPEG、PNG 或 WebP。");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("头像文件不能超过 2 MB。");
      return;
    }
    uploadAvatar.mutate(file, {
      onSuccess: () => {
        setError(null);
        setAvatarNotice("头像已更新。");
      },
      onError: (requestError) => setError(requestError.message || "头像上传失败。"),
    });
  }

  function removeAvatar() {
    setAvatarNotice(null);
    deleteAvatar.mutate(undefined, {
      onSuccess: () => {
        setError(null);
        setAvatarNotice("头像已删除。");
      },
      onError: (requestError) => setError(requestError.message || "头像删除失败。"),
    });
  }

  function updateField<Key extends keyof TeacherProfileForm>(key: Key, value: TeacherProfileForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function addTeachingField() {
    const value = fieldDraft.trim();
    if (!value) return;
    if (form.teachingFields.includes(value)) {
      setFieldDraft("");
      return;
    }
    if (form.teachingFields.length >= 50) {
      setError("教学领域最多添加 50 项。");
      return;
    }
    updateField("teachingFields", [...form.teachingFields, value]);
    setFieldDraft("");
  }

  function saveProfile() {
    const displayName = form.displayName.trim();
    if (!displayName) {
      setError("显示名称不能为空。");
      return;
    }
    const payload: TeacherProfileUpdateRequest = {
      display_name: displayName,
      school_name: form.schoolName.trim() || null,
      department: form.department.trim() || null,
      employee_no: form.employeeNo.trim() || null,
      title: form.title.trim() || null,
      teaching_fields: form.teachingFields,
    };
    updateProfile.mutate(payload, {
      onSuccess: () => {
        onSaved();
        onOpenChange(false);
      },
      onError: (requestError) => setError(requestError.message || "教师资料保存失败。"),
    });
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open} swipeDirection="right">
      <DrawerContent>
        <DrawerHeader><DrawerTitle>编辑教师资料</DrawerTitle><DrawerDescription>资料会保存到当前教师账号，用于个人页、Header 与后续教学上下文。</DrawerDescription></DrawerHeader>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="rounded-xl border-2 border-border bg-muted/20 p-4">
            <div className="flex items-center gap-4">
              <UserAvatar avatarUrl={user.avatar_url ?? profile?.avatar_url} className="size-16" name={form.displayName || user.display_name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">教师头像</p>
                <p className="mt-1 text-xs text-muted-foreground">支持 JPEG、PNG、WebP，最大 2 MB。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={uploadAvatar.isPending || deleteAvatar.isPending} onClick={() => avatarInputRef.current?.click()} size="sm" type="button" variant="outline">
                    <Camera data-icon="inline-start" />
                    {uploadAvatar.isPending ? "正在上传..." : "上传头像"}
                  </Button>
                  {user.avatar_url ?? profile?.avatar_url ? (
                    <Button disabled={uploadAvatar.isPending || deleteAvatar.isPending} onClick={removeAvatar} size="sm" type="button" variant="ghost">
                      <Trash2 data-icon="inline-start" />
                      {deleteAvatar.isPending ? "正在删除..." : "删除头像"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadAvatarFile(file); event.target.value = ""; }}
                ref={avatarInputRef}
                type="file"
              />
            </div>
            {avatarNotice ? <p className="mt-3 text-xs text-emerald-700">{avatarNotice}</p> : null}
          </div>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">显示名称</span><Input maxLength={120} onChange={(event) => updateField("displayName", event.target.value)} value={form.displayName} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">邮箱</span><Input disabled value={profile?.email ?? user.email} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">学校</span><Input maxLength={200} onChange={(event) => updateField("schoolName", event.target.value)} value={form.schoolName} /></label>
          <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">院系</span><Input maxLength={200} onChange={(event) => updateField("department", event.target.value)} value={form.department} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">工号</span><Input maxLength={100} onChange={(event) => updateField("employeeNo", event.target.value)} value={form.employeeNo} /></label>
            <label className="block"><span className="mb-1.5 block text-xs text-muted-foreground">职称</span><Input maxLength={100} onChange={(event) => updateField("title", event.target.value)} value={form.title} /></label>
          </div>
          <div>
            <span className="mb-1.5 block text-xs text-muted-foreground">教学领域</span>
            <div className="flex flex-wrap gap-2">
              {form.teachingFields.map((field) => (
                <span className="inline-flex items-center gap-1 rounded-full border-2 border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-900" key={field}>
                  {field}
                  <button aria-label={`删除教学领域 ${field}`} className="rounded-full p-0.5 hover:bg-blue-100" onClick={() => updateField("teachingFields", form.teachingFields.filter((item) => item !== field))} type="button"><X className="size-3" /></button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input onChange={(event) => setFieldDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTeachingField(); } }} placeholder="例如：软件测试" value={fieldDraft} />
              <Button onClick={addTeachingField} type="button" variant="outline"><Plus data-icon="inline-start" />添加</Button>
            </div>
          </div>
          {error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>
        <DrawerFooter>
          <Button disabled={updateProfile.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={updateProfile.isPending} onClick={saveProfile} type="button"><Save data-icon="inline-start" />{updateProfile.isPending ? "正在保存..." : "保存资料"}</Button>
        </DrawerFooter>
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
