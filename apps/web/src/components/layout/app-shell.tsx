import type { ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="min-h-screen lg:pl-[258px]">
        <Header />
        <main className="mx-auto w-full max-w-[1680px] px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
