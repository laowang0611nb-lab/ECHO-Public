"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiClient } from "@/lib/api";
import { accountIdentifier } from "@/lib/account-identity";
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { TeacherAssistantTrigger } from "@/features/teacher-assistant/teacher-assistant-trigger";
import { useDemoMode } from "@/features/demo/demo-provider";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function Header() {
  const router = useRouter();
  const { user, logout } = useTeacherSession();
  const demo = useDemoMode();
  const { courses, selectedCourseId, setSelectedCourseId } = useCourseWorkspace();
  const healthQuery = useQuery({
    queryKey: ["system", "health"],
    queryFn: async () => {
      const startedAt = performance.now();
      const health = await apiClient.health();
      return { ...health, latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) };
    },
    refetchInterval: 30_000,
  });

  const selectableCourses = courses.filter((course) => course.status !== "archived");
  const selectedCourse = selectableCourses.find((course) => course.id === selectedCourseId);
  const serverHealthy = healthQuery.isSuccess && !healthQuery.isError;
  const serverStatusText = serverHealthy
    ? `Local Server 已连接 · ${healthQuery.data?.latencyMs ?? 1} ms`
    : healthQuery.isError
      ? "Local Server 未连接"
      : "Local Server 状态检查中";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-card/95 px-4 backdrop-blur lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground lg:inline-flex">ECHO</span>
        <Select
          items={selectableCourses.map((course) => ({ value: course.id, label: course.name }))}
          onValueChange={(value) => value && setSelectedCourseId(value)}
          value={selectedCourseId ?? null}
        >
          <SelectTrigger className="w-[min(280px,42vw)] border-0 bg-transparent px-1 text-base font-semibold shadow-none sm:w-[260px]" title={selectedCourse?.name}>
            <SelectValue className="truncate" placeholder="选择课程" />
          </SelectTrigger>
          <SelectContent align="start">
            {selectableCourses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden h-5 w-px bg-border sm:block" />
        <p className="hidden truncate text-sm text-muted-foreground sm:block">
          {selectedCourse?.term || "未设置学期"}
        </p>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-3">
        <TooltipProvider delay={150}>
          <Tooltip>
            <TooltipTrigger render={<span aria-label={serverStatusText} className="hidden size-5 items-center justify-center rounded-full outline-none xl:inline-flex" tabIndex={0} />}>
              <span className={serverHealthy ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-orange-400"} />
            </TooltipTrigger>
            <TooltipContent>{serverStatusText}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {demo.active ? <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">DEMO · 演示数据</span> : null}
        <TeacherAssistantTrigger />
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button aria-label="打开教师账号菜单" className="h-auto gap-2 px-1.5 py-1" variant="ghost" />}
          >
            <UserAvatar avatarUrl={user?.avatar_url} name={user?.display_name ?? "教师"} />
            <span className="hidden text-left md:block">
              <span className="block text-sm font-medium">{user?.display_name}</span>
              <span className="block text-xs text-muted-foreground">教师</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60" sideOffset={8}>
            <div className="px-2 py-2">
              <span className="block truncate text-sm font-medium text-foreground">{user?.display_name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user ? accountIdentifier(user) : "未登录"}</span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/me?tab=profile")}>
              <UserIcon />
              个人信息
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/me?tab=security")}>
              <ShieldCheck />
              账号与安全
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/server")}>
              <Settings />
              服务器设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()} variant="destructive">
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
