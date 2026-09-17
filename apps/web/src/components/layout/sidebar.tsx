"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Library,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const primaryItems: NavItem[] = [{ href: "/dashboard", label: "总览 Dashboard", icon: LayoutDashboard }];
const aiItems: NavItem[] = [
  { href: "/ai-insights", label: "AI 教学洞察", icon: Sparkles },
  { href: "/ai-review", label: "AI 回答审核", icon: ShieldCheck },
  { href: "/teaching-strategies", label: "教学策略", icon: Waypoints },
];
const moduleItems: NavItem[] = [
  { href: "/courses", label: "课程管理", icon: BookOpen },
  { href: "/students", label: "学生学情", icon: Users },
  { href: "/knowledge", label: "知识库", icon: Library },
];

function NavLink({ item, nested = false }: { item: NavItem; nested?: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        nested && "pl-9",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      href={item.href}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/60")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const [aiOpen, setAiOpen] = useState(true);
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[258px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
          E
        </div>
        <div>
          <p className="text-base font-semibold tracking-[0.08em]">ECHO</p>
          <p className="text-[11px] text-sidebar-foreground/55">Educational Intelligence</p>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-4">
        {primaryItems.map((item) => <NavLink item={item} key={item.href} />)}

        <section className="rounded-xl bg-blue-400/8 p-2">
          <button
            aria-expanded={aiOpen}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            onClick={() => setAiOpen((current) => !current)}
            type="button"
          >
            <Sparkles className="size-4 text-primary" />
            <span className="flex-1">AI 教学</span>
            <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-100">AI</span>
            <ChevronDown className={cn("size-4 transition-transform", aiOpen && "rotate-180")} />
          </button>
          {aiOpen ? (
            <div className="relative mt-1 space-y-1 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-sidebar-border">
              {aiItems.map((item) => <NavLink item={item} key={item.href} nested />)}
            </div>
          ) : null}
        </section>

        {moduleItems.map((item) => <NavLink item={item} key={item.href} />)}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4">
        <Link
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            pathname === "/me" && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          href="/me"
        >
          <Users className="size-4" />
          我的
        </Link>
        <p className="mt-4 px-3 text-xs leading-5 text-sidebar-foreground/45">让每一次学习都有回响。</p>
      </div>
    </aside>
  );
}
