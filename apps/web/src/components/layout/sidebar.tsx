"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  SIDEBAR_TRANSITION_CURVE,
  SIDEBAR_TRANSITION_EASING,
  SIDEBAR_TRANSITION_MS,
  SIDEBAR_TRANSITION_SECONDS,
} from "@/components/layout/sidebar-transition";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";

type MaterialSymbolName =
  | "account_circle"
  | "account_tree"
  | "dashboard"
  | "fact_check"
  | "groups"
  | "library_books"
  | "menu_book"
  | "monitoring"
  | "neurology"
  | "route"
  | "keyboard_arrow_down";

interface NavItem {
  href: string;
  label: string;
  icon: MaterialSymbolName;
}

type RegisterNavItem = (element: HTMLDivElement, centerY: MotionValue<number>) => () => void;

const primaryItems: NavItem[] = [{ href: "/dashboard", label: "总览 Dashboard", icon: "dashboard" }];
const coreItems: NavItem[] = [
  { href: "/ai-insights", label: "AI 教学洞察", icon: "monitoring" },
  { href: "/knowledge?tab=graph", label: "课程知识图谱", icon: "account_tree" },
];
const managementItems: NavItem[] = [
  { href: "/courses", label: "课程管理", icon: "menu_book" },
  { href: "/students", label: "学生学情", icon: "groups" },
  { href: "/knowledge", label: "知识库", icon: "library_books" },
];
const assistItems: NavItem[] = [
  { href: "/ai-review", label: "AI 回答审核", icon: "fact_check" },
  { href: "/teaching-strategies", label: "教学策略", icon: "route" },
];
const accountItem: NavItem = { href: "/me", label: "我的", icon: "account_circle" };

const ITEM_TILE_BASE = 40;
const ITEM_TILE_MAX = 72;
const MAX_SCALE = ITEM_TILE_MAX / ITEM_TILE_BASE;
const FOCUS_SCALE = 1.18;
const EXPANDED_HOVER_SCALE = 1.06;
const FALLOFF = 104;
const PROXIMITY_EXPONENT = 2.8;
const SPRING = { stiffness: 480, damping: 18, mass: 0.34 };
const EASE = SIDEBAR_TRANSITION_CURVE;

function NavPendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 z-20 size-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(47,124,246,0.18)] transition-opacity duration-150"
      data-link-pending={pending ? "true" : "false"}
      style={{ opacity: pending ? 1 : 0 }}
    />
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, searchParams: URLSearchParams, item: NavItem) {
  const [path, query = ""] = item.href.split("?");
  if (path === "/knowledge") {
    if (pathname !== "/knowledge") return false;
    const requestedTab = new URLSearchParams(query).get("tab") ?? "resources";
    const currentTab = searchParams.get("tab") ?? "resources";
    return requestedTab === "graph" ? currentTab === "graph" : currentTab !== "graph";
  }
  return isActivePath(pathname, path);
}

function withCourseId(href: string, courseId: string | null) {
  if (!courseId || href === "/dashboard" || href === "/me") return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("courseId", courseId);
  return `${path}?${params.toString()}`;
}

function SidebarLabel({
  children,
  index,
  reducedMotion,
  className,
}: {
  children: ReactNode;
  index: number;
  reducedMotion: boolean;
  className?: string;
}) {
  // Keep the icon rail anchored while labels alone fade and slide. This avoids
  // rebuilding navigation geometry on every expand/collapse transition.
  return (
    <motion.span
      animate={{
        opacity: 1,
        maxWidth: 180,
        x: 0,
      }}
      className={cn("min-w-0 overflow-hidden whitespace-nowrap will-change-[opacity,transform]", className)}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, maxWidth: 0, x: -6 }}
      transition={{
        maxWidth: {
          delay: reducedMotion ? 0 : 0.12 + Math.min(index, 3) * 0.012,
          duration: reducedMotion ? 0.01 : 0.08,
          ease: EASE,
        },
        opacity: {
          delay: reducedMotion ? 0 : 0.12 + Math.min(index, 3) * 0.012,
          duration: reducedMotion ? 0.01 : 0.08,
          ease: EASE,
        },
        x: {
          delay: reducedMotion ? 0 : 0.12 + Math.min(index, 3) * 0.012,
          duration: reducedMotion ? 0.01 : 0.08,
          ease: EASE,
        },
      }}
    >
      {children}
    </motion.span>
  );
}

function MaterialSymbol({
  name,
  className,
  filled = false,
  size = 18,
}: {
  name: MaterialSymbolName;
  className?: string;
  filled?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("material-symbols-sharp select-none leading-none", className)}
      style={{ fontSize: size, lineHeight: 1, fontVariationSettings: `"FILL" ${filled ? 1 : 0}` }}
    >
      {name}
    </span>
  );
}

const NavLink = memo(function NavLink({
  item,
  active,
  nested = false,
  collapsed = false,
  index = 0,
  pointerY,
  registerItem,
  reducedMotion,
  onPrefetch,
}: {
  item: NavItem;
  active: boolean;
  nested?: boolean;
  collapsed?: boolean;
  index?: number;
  pointerY: MotionValue<number>;
  registerItem: RegisterNavItem;
  reducedMotion: boolean;
  onPrefetch: (href: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const itemCenterY = useMotionValue(0);
  const focusScale = useSpring(1, SPRING);
  const hoverScale = useSpring(1, SPRING);
  const collapsedValue = useMotionValue(collapsed ? 1 : 0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    return registerItem(element, itemCenterY);
  }, [itemCenterY, registerItem]);

  useEffect(() => {
    const nextFocusScale = collapsed && !reducedMotion && focused ? FOCUS_SCALE : 1;
    focusScale.set(nextFocusScale);
  }, [collapsed, focusScale, focused, reducedMotion]);

  useEffect(() => {
    const nextHoverScale =
      !collapsed && !reducedMotion && (hovered || focused) ? EXPANDED_HOVER_SCALE : 1;
    hoverScale.set(nextHoverScale);
  }, [collapsed, focused, hoverScale, hovered, reducedMotion]);

  useEffect(() => {
    collapsedValue.set(collapsed ? 1 : 0);
  }, [collapsed, collapsedValue]);

  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => {
      setPendingHref((current) => current === item.href ? null : current);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [item.href, pendingHref]);

  const distanceY = useTransform<number, number>(
    [pointerY, itemCenterY],
    ([pointer, center]) => {
      if (!Number.isFinite(pointer)) return Number.POSITIVE_INFINITY;
      return pointer - (center ?? 0);
    },
  );
  const targetScale = useTransform<number, number>(
    [distanceY, collapsedValue],
    ([distance, isCollapsed]) => {
      if (!isCollapsed) return 1;
      const normalizedDistance = Math.min(Math.abs(distance) / FALLOFF, 1);
      const proximity = 1 - normalizedDistance;
      return 1 + (MAX_SCALE - 1) * Math.pow(proximity, PROXIMITY_EXPONENT);
    },
  );
  const proximityScale = useSpring(targetScale, SPRING);
  const scale = useTransform<number, number>(
    [proximityScale, focusScale, hoverScale],
    ([proximity, focus, hover]) => Math.max(proximity ?? 1, focus ?? 1, hover ?? 1),
  );

  const collapseTransition = {
    duration: reducedMotion ? 0 : SIDEBAR_TRANSITION_SECONDS,
    ease: EASE,
  };
  const expandedHighlighted = !collapsed && (hovered || focused);
  const navigating = pendingHref === item.href && !active;
  const visuallyActive = active || navigating;

  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-busy={navigating || undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 w-full touch-manipulation select-none items-center rounded-lg text-sm text-sidebar-foreground/70 outline-none transition-[gap,padding,color,background-color] focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-inset",
        collapsed ? "justify-center gap-0 px-0" : "gap-3 px-3",
        !collapsed && "overflow-hidden",
        nested && !collapsed && "pl-9",
        !collapsed && "hover:text-sidebar-accent-foreground",
        visuallyActive && "text-sidebar-accent-foreground",
        navigating && "cursor-progress",
      )}
      href={item.href}
      onClick={() => {
        if (!active) setPendingHref(item.href);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !active) {
          setPendingHref(item.href);
        }
      }}
      onPointerDown={() => {
        if (!active) {
          setPendingHref(item.href);
          onPrefetch(item.href);
        }
      }}
      onBlur={() => setFocused(false)}
      onFocus={() => {
        setFocused(true);
        onPrefetch(item.href);
      }}
      onMouseEnter={() => {
        setHovered(true);
        onPrefetch(item.href);
      }}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? item.label : undefined}
    >
      {!collapsed ? (
        <motion.span
          animate={{ opacity: expandedHighlighted ? 1 : 0, x: expandedHighlighted ? 0 : -4 }}
          className="absolute inset-0 z-0 rounded-lg bg-sidebar-accent"
          initial={false}
          transition={collapseTransition}
        />
      ) : null}
      {visuallyActive ? (
        <motion.span
          animate={{ left: collapsed ? 8 : 0, right: collapsed ? 8 : 0, opacity: collapsed ? 0 : 1 }}
          className="absolute inset-y-0 z-0 rounded-lg bg-sidebar-accent"
          initial={false}
          transition={collapseTransition}
        />
      ) : null}
      {visuallyActive ? (
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1 }}
          className="absolute inset-y-2 left-0 z-10 w-0.5 rounded-full bg-primary"
          initial={false}
          transition={collapseTransition}
        />
      ) : null}
      <motion.span
        className="pointer-events-none relative z-10 flex size-10 shrink-0 items-center justify-center"
        initial={false}
        style={{ scale: reducedMotion ? 1 : scale }}
        transition={collapseTransition}
      >
        {visuallyActive ? (
          <motion.span
            animate={{ opacity: collapsed ? 1 : 0 }}
            className="absolute inset-0 rounded-lg bg-sidebar-accent"
            initial={false}
            transition={collapseTransition}
          />
        ) : null}
        <MaterialSymbol
          className={cn(
            "relative z-10 shrink-0",
            visuallyActive ? "text-primary" : "text-sidebar-foreground/60",
          )}
          filled={visuallyActive}
          name={item.icon}
          size={20}
        />
      </motion.span>
      {!collapsed ? (
        <SidebarLabel className="relative z-10 flex-1" index={index} reducedMotion={reducedMotion}>
          {item.label}
        </SidebarLabel>
      ) : null}
      {navigating ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 z-20 size-2 -translate-y-1/2 animate-pulse rounded-full bg-primary shadow-[0_0_0_4px_rgba(47,124,246,0.18)]"
        />
      ) : null}
      <NavPendingIndicator />
    </Link>
  );

  return (
    <motion.div className="relative w-full transform-gpu" ref={wrapperRef} style={{ zIndex: hovered || focused ? 2 : 1 }}>
      <Tooltip disabled={!collapsed}>
        <TooltipTrigger render={link} />
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    </motion.div>
  );
});

function NavCategory({
  children,
  collapsed,
  label,
  reducedMotion,
}: {
  children: ReactNode;
  collapsed: boolean;
  label: string;
  reducedMotion: boolean;
}) {
  return (
    <section className="space-y-1">
      {collapsed ? (
        <div className="flex h-6 items-center px-3" aria-hidden="true">
          <span className="h-px w-full bg-sidebar-border/70" />
        </div>
      ) : (
        <motion.p
          animate={{ opacity: 1, x: 0 }}
          className="px-2.5 pb-1 pt-2 text-[10px] font-semibold tracking-[0.08em] text-sidebar-foreground/45"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -4 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.12, ease: EASE }}
        >
          {label}
        </motion.p>
      )}
      {children}
    </section>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedCourseId } = useCourseWorkspace();
  const reducedMotion = useReducedMotion() ?? false;
  const pointerY = useMotionValue(Number.POSITIVE_INFINITY);
  const prefetchedRoutes = useRef(new Set<string>());
  const itemRegistry = useRef(new Map<HTMLDivElement, MotionValue<number>>());
  const measureFrame = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const navContentRef = useRef<HTMLDivElement>(null);

  const measureItems = useCallback(() => {
    itemRegistry.current.forEach((centerY, element) => {
      const rect = element.getBoundingClientRect();
      centerY.set(rect.top + rect.height / 2);
    });
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (measureFrame.current !== null) {
      window.cancelAnimationFrame(measureFrame.current);
    }

    measureFrame.current = window.requestAnimationFrame(() => {
      measureFrame.current = null;
      measureItems();
    });
  }, [measureItems]);

  const registerItem = useCallback<RegisterNavItem>((element, centerY) => {
    itemRegistry.current.set(element, centerY);
    const rect = element.getBoundingClientRect();
    centerY.set(rect.top + rect.height / 2);

    return () => {
      itemRegistry.current.delete(element);
    };
  }, []);

  const prefetchRoute = useCallback(
    (href: string) => {
      if (prefetchedRoutes.current.has(href)) return;
      prefetchedRoutes.current.add(href);
      router.prefetch(href);
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      [...primaryItems, ...coreItems, ...managementItems, ...assistItems, accountItem].forEach((item) => {
        prefetchRoute(withCourseId(item.href, selectedCourseId));
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [prefetchRoute, selectedCourseId]);

  useLayoutEffect(() => {
    scheduleMeasure();
  }, [collapsed, scheduleMeasure]);

  useEffect(() => {
    const nav = navRef.current;
    const navContent = navContentRef.current;
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);

    if (navContent) observer?.observe(navContent);
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", scheduleMeasure);
    nav?.addEventListener("scroll", scheduleMeasure, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      nav?.removeEventListener("scroll", scheduleMeasure);

      if (measureFrame.current !== null) {
        window.cancelAnimationFrame(measureFrame.current);
        measureFrame.current = null;
      }
    };
  }, [scheduleMeasure]);

  const handlePointerLeave = () => {
    pointerY.set(Number.POSITIVE_INFINITY);
  };

  const handleToggle = () => {
    pointerY.set(Number.POSITIVE_INFINITY);
    onToggle();
  };

  const contentTransition = {
    duration: reducedMotion ? 0.01 : SIDEBAR_TRANSITION_SECONDS,
    ease: EASE,
  };
  const brandTransition = {
    duration: reducedMotion ? 0.01 : SIDEBAR_TRANSITION_SECONDS,
    ease: EASE,
  };

  const renderNavItems = (items: NavItem[], baseIndex: number) => items.map((item, index) => {
    const resolvedItem = { ...item, href: withCourseId(item.href, selectedCourseId) };
    return (
      <NavLink
        active={isNavItemActive(pathname, searchParams, item)}
        collapsed={collapsed}
        index={baseIndex + index}
        item={resolvedItem}
        key={item.href}
        onPrefetch={prefetchRoute}
        pointerY={pointerY}
        reducedMotion={reducedMotion}
        registerItem={registerItem}
      />
    );
  });

  return (
    <TooltipProvider delay={150}>
      <aside
        className="sticky top-0 z-40 hidden h-dvh w-full self-start flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
        onPointerCancel={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
        onPointerMove={(event) => {
          if (collapsed && !reducedMotion) pointerY.set(event.clientY);
        }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center overflow-hidden border-b border-sidebar-border transition-[height]",
            collapsed ? "h-16 justify-center" : "h-20 justify-between gap-3 pl-5 pr-3",
          )}
          style={{
            transitionDuration: `${SIDEBAR_TRANSITION_MS}ms`,
            transitionTimingFunction: SIDEBAR_TRANSITION_EASING,
          }}
        >
          {!collapsed ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex min-w-0 flex-1 items-center gap-3"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={brandTransition}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                E
              </div>
              <div className="min-w-0 overflow-hidden whitespace-nowrap">
                <p className="truncate text-base font-semibold tracking-[0.08em]">ECHO</p>
                <p className="truncate text-[11px] text-sidebar-foreground/55">
                  Educational Intelligence
                </p>
              </div>
            </motion.div>
          ) : null}
          <motion.div
            className="flex shrink-0 items-center justify-center"
            layout="position"
            transition={contentTransition}
          >
            <Button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              className="size-8 rounded-full border border-sidebar-border !bg-sidebar !text-sidebar-foreground shadow-[0_3px_12px_rgba(0,0,0,0.28)] hover:!bg-sidebar-accent hover:!text-sidebar-accent-foreground"
              onClick={handleToggle}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <motion.span
                animate={{ rotate: collapsed ? 180 : 0 }}
                className="flex will-change-transform"
                initial={false}
                transition={contentTransition}
              >
                <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
              </motion.span>
            </Button>
          </motion.div>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto transition-[padding]",
            collapsed ? "px-2 py-3" : "px-3 py-4",
          )}
          ref={navRef}
          style={{
            transitionDuration: `${SIDEBAR_TRANSITION_MS}ms`,
            transitionTimingFunction: SIDEBAR_TRANSITION_EASING,
          }}
        >
          <div className="flex flex-col gap-3" ref={navContentRef}>
            {renderNavItems(primaryItems, 0)}
            <NavCategory collapsed={collapsed} label="核心能力" reducedMotion={reducedMotion}>
              {renderNavItems(coreItems, 1)}
            </NavCategory>
            <NavCategory collapsed={collapsed} label="教学管理" reducedMotion={reducedMotion}>
              {renderNavItems(managementItems, 3)}
            </NavCategory>
            <NavCategory collapsed={collapsed} label="智能辅助" reducedMotion={reducedMotion}>
              {renderNavItems(assistItems, 6)}
            </NavCategory>
          </div>
        </nav>

        <div className={cn("border-t border-sidebar-border transition-[padding]", collapsed ? "px-2 py-3" : "px-3 py-4")}>
          <NavLink
            active={isActivePath(pathname, accountItem.href)}
            collapsed={collapsed}
            index={8}
            item={accountItem}
            onPrefetch={prefetchRoute}
            pointerY={pointerY}
            reducedMotion={reducedMotion}
            registerItem={registerItem}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}
