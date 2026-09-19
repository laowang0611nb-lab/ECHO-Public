"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Library,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
const accountItem: NavItem = { href: "/me", label: "我的", icon: Users };

function NavLink({
  item,
  nested = false,
  collapsed = false,
}: {
  item: NavItem;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center rounded-lg text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5",
        nested && !collapsed && "pl-9",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      href={item.href}
      title={collapsed ? item.label : undefined}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-sidebar-foreground/60")} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [aiOpen, setAiOpen] = useState(true);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-20" : "w-[258px]",
      )}
    >
      <div className={cn("flex h-20 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-3 px-3")}>
        {!collapsed ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
              E
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[0.08em]">ECHO</p>
              <p className="truncate text-[11px] text-sidebar-foreground/55">Educational Intelligence</p>
            </div>
          </div>
        ) : null}
        <Button
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          onClick={onToggle}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>

      <nav className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {primaryItems.map((item) => <NavLink collapsed={collapsed} item={item} key={item.href} />)}

        {collapsed ? (
          <section className="space-y-1 border-t border-sidebar-border pt-3">
            {aiItems.map((item) => <NavLink collapsed item={item} key={item.href} />)}
          </section>
        ) : (
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
        )}

        {moduleItems.map((item) => <NavLink collapsed={collapsed} item={item} key={item.href} />)}
      </nav>

      <div className={cn("border-t border-sidebar-border py-4", collapsed ? "px-2" : "px-3")}>
        <NavLink collapsed={collapsed} item={accountItem} />
      </div>
    </aside>
  );
}
