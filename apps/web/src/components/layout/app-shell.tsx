"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen bg-background"
      style={{ "--sidebar-width": sidebarCollapsed ? "5rem" : "258px" } as CSSProperties}
    >
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
      <div className={sidebarCollapsed ? "min-h-screen transition-[padding] duration-200 lg:pl-20" : "min-h-screen transition-[padding] duration-200 lg:pl-[258px]"}>
        <Header />
        <main className="mx-auto w-full max-w-[1680px] px-4 py-6 lg:px-6">{children}</main>
        <GuidedDemoBar />
      </div>
    </div>
  );
}
import { GuidedDemoBar } from "@/features/demo/components/guided-demo-bar";
