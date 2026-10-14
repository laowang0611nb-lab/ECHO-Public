"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingState } from "@/components/common/loading-state";
import { AppShell } from "@/components/layout/app-shell";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, user } = useTeacherSession();
  const embed = searchParams.get("embed") === "1";

  useEffect(() => {
    if (!embed && ready && !user) {
      router.replace("/login");
    }
  }, [embed, ready, router, user]);

  if (embed) {
    return (
      <div className="h-[100dvh] w-screen overflow-hidden bg-[#06101f]">
        {children}
      </div>
    );
  }

  if (!ready || !user) {
    return <LoadingState label={ready ? "正在跳转登录页..." : "正在恢复教师会话..."} />;
  }

  return <AppShell>{children}</AppShell>;
}
