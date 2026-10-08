"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { WorkspacePlasmaBackground } from "@/components/backgrounds/workspace-plasma-background";
import { GuidedDemoBar } from "@/features/demo/components/guided-demo-bar";
import { PageMotion } from "@/components/layout/page-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { setSidebarTransitioning } from "@/components/layout/sidebar-transition";

const SIDEBAR_TRANSITION_MS = 260;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }
    setSidebarTransitioning(false);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((current) => !current);
    setSidebarTransitioning(true);
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }
    transitionTimer.current = window.setTimeout(() => {
      transitionTimer.current = null;
      setSidebarTransitioning(false);
    }, SIDEBAR_TRANSITION_MS);
  }

  return (
    <div
      className="relative isolate min-h-screen bg-transparent"
      style={{ "--sidebar-width": sidebarCollapsed ? "5rem" : "258px" } as CSSProperties}
    >
      <WorkspacePlasmaBackground />
      <div className="relative z-10 min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className={sidebarCollapsed ? "min-h-screen transition-[padding] duration-200 lg:pl-20" : "min-h-screen transition-[padding] duration-200 lg:pl-[258px]"}>
          <Header />
          <main className="mx-auto w-full max-w-[1680px] px-4 py-6 lg:px-6">
            {pathname === "/dashboard" ? children : <PageMotion key={pathname}>{children}</PageMotion>}
          </main>
          <GuidedDemoBar />
        </div>
      </div>
    </div>
  );
}
