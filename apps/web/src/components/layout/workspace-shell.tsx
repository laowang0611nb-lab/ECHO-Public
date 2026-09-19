"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { AppShell } from "@/components/layout/app-shell";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { ready, user } = useTeacherSession();

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
    }
  }, [ready, router, user]);

  if (!ready || !user) {
    return <LoadingState label={ready ? "正在跳转登录页..." : "正在恢复教师会话..."} />;
  }

  return <AppShell>{children}</AppShell>;
}
