"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api";
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
        <p className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
          <span className={serverHealthy ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-orange-400"} />
          {serverHealthy
            ? `Local Server 已连接 · ${healthQuery.data?.latencyMs ?? 1} ms`
            : "Local Server 状态检查中"}
        </p>
        {demo.active ? <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">DEMO · 演示数据</span> : null}
        <span title="通知功能暂未开放">
          <Button aria-label="通知功能暂未开放" disabled size="icon" type="button" variant="ghost">
            <Bell data-icon="inline-start" />
          </Button>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button className="h-auto gap-2 px-1.5 py-1" variant="ghost" />}
          >
            <Avatar className="size-8">
              <AvatarFallback>{user?.display_name.slice(0, 1) || "教"}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left md:block">
              <span className="block text-sm font-medium">{user?.display_name}</span>
              <span className="block text-xs text-muted-foreground">教师</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/me")}>
              <UserIcon />
              我的
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} variant="destructive">
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
