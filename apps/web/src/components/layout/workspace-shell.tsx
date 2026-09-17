"use client";

import type { ReactNode } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { AppShell } from "@/components/layout/app-shell";
import { LoginScreen } from "@/features/auth/login-screen";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { ready, user } = useTeacherSession();

  if (!ready) {
    return <LoadingState label="正在恢复教师会话..." />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppShell>{children}</AppShell>;
}
