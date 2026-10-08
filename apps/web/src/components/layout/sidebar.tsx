"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type MaterialSymbolName =
  | "account_circle"
  | "dashboard"
  | "fact_check"
  | "groups"
  | "library_books"
  | "menu_book"
  | "monitoring"
  | "neurology"
  | "route"
  | "chevron_left"
  | "chevron_right"
  | "keyboard_arrow_down";

interface NavItem {
  href: string;
  label: string;
  icon: MaterialSymbolName;
}

type RegisterNavItem = (element: HTMLDivElement, centerY: MotionValue<number>) => () => void;

const primaryItems: NavItem[] = [{ href: "/dashboard", label: "总览 Dashboard", icon: "dashboard" }];
const aiItems: NavItem[] = [
  { href: "/ai-insights", label: "AI 教学洞察", icon: "monitoring" },
  { href: "/ai-review", label: "AI 回答审核", icon: "fact_check" },
  { href: "/teaching-strategies", label: "教学策略", icon: "route" },
];
const moduleItems: NavItem[] = [
  { href: "/courses", label: "课程管理", icon: "menu_book" },
  { href: "/students", label: "学生学情", icon: "groups" },
  { href: "/knowledge", label: "知识库", icon: "library_books" },
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
const EASE = "easeOut" as const;

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

function SidebarLabel({
  children,
  collapsed,
  index,
  reducedMotion,
  className,
}: {
  children: ReactNode;
  collapsed: boolean;
  index: number;
  reducedMotion: boolean;
  className?: string;
}) {
  const initial = reducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 };
  const exit = reducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 };

  return (
    <AnimatePresence initial={false}>
      {!collapsed ? (
        <motion.span
          animate={{ opacity: 1, x: 0 }}
          className={cn("min-w-0", className)}
          exit={exit}
          initial={initial}
          transition={{
            delay: reducedMotion ? 0 : index * 0.055,
            duration: reducedMotion ? 0.01 : 0.16,
            ease: EASE,
          }}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
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
    duration: reducedMotion ? 0 : 0.2,
    ease: EASE,
  };
  const expandedHighlighted = !collapsed && (hovered || focused);
  const iconShift = reducedMotion ? 0 : collapsed ? (nested ? -24 : 0) : expandedHighlighted ? 4 : 0;
  const navigating = pendingHref === item.href && !active;
  const visuallyActive = active || navigating;

  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-busy={navigating || undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-10 w-full touch-manipulation select-none items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-inset",
        nested && "pl-9",
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
          animate={{ left: collapsed ? 12 : 0, right: collapsed ? 12 : 0, opacity: collapsed ? 0 : 1 }}
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
        animate={{ x: iconShift }}
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
        <SidebarLabel className="relative z-10 truncate" collapsed={collapsed} index={index} reducedMotion={reducedMotion}>
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

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(true);
  const reducedMotion = useReducedMotion() ?? false;
  const pointerY = useMotionValue(Number.POSITIVE_INFINITY);
  const prefetchedRoutes = useRef(new Set<string>());
  const itemRegistry = useRef(new Map<HTMLDivElement, MotionValue<number>>());
  const measureFrame = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const navContentRef = useRef<HTMLDivElement>(null);
  const [expandedFromCollapsed, setExpandedFromCollapsed] = useState(false);

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
      [...primaryItems, ...aiItems, ...moduleItems, accountItem].forEach((item) => {
        prefetchRoute(item.href);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [prefetchRoute]);

  useLayoutEffect(() => {
    scheduleMeasure();
  }, [aiOpen, collapsed, scheduleMeasure]);

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
    setExpandedFromCollapsed(collapsed);
    onToggle();
  };

  const animateExpandedContent = !collapsed && expandedFromCollapsed && !reducedMotion;
  const contentTransition = {
    duration: reducedMotion ? 0.01 : 0.16,
    ease: EASE,
  };

  return (
    <TooltipProvider delay={150}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-20" : "w-[258px]",
        )}
        onPointerCancel={handlePointerLeave}
        onPointerLeave={handlePointerLeave}
        onPointerMove={(event) => {
          if (collapsed && !reducedMotion) pointerY.set(event.clientY);
        }}
      >
        <div className="relative flex h-20 items-center border-b border-sidebar-border">
          <AnimatePresence initial={false}>
            {!collapsed ? (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-y-0 left-0 right-14 flex items-center gap-3 pl-5 pr-2"
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                transition={contentTransition}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
                  E
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-[0.08em]">ECHO</p>
                  <p className="truncate text-[11px] text-sidebar-foreground/55">
                    Educational Intelligence
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <motion.div
            animate={{ x: collapsed ? -14 : 0, y: "-50%" }}
            className="absolute top-1/2 right-3"
            initial={false}
            transition={contentTransition}
          >
            <Button
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              onClick={handleToggle}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MaterialSymbol name={collapsed ? "chevron_right" : "chevron_left"} size={18} />
            </Button>
          </motion.div>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto py-4 transition-[padding] duration-200 ease-out",
            collapsed ? "px-2" : "px-3",
          )}
          ref={navRef}
        >
          <div className="flex flex-col gap-2" ref={navContentRef}>
            {primaryItems.map((item, index) => (
              <NavLink
                active={isActivePath(pathname, item.href)}
                collapsed={collapsed}
                index={index}
                item={item}
                key={item.href}
                onPrefetch={prefetchRoute}
                pointerY={pointerY}
                reducedMotion={reducedMotion}
                registerItem={registerItem}
              />
            ))}

            <section
              className={cn(
                "rounded-xl border-t transition-[padding,background-color,border-color] duration-200 ease-out",
                collapsed
                  ? "border-sidebar-border bg-transparent p-0 pt-3"
                  : "border-transparent bg-blue-400/8 p-2",
              )}
            >
              <motion.div
                animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
                aria-hidden={collapsed}
                className={cn("overflow-hidden", collapsed && "pointer-events-none")}
                initial={false}
                transition={contentTransition}
              >
                <button
                  aria-expanded={aiOpen}
                  className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                  onClick={() => setAiOpen((current) => !current)}
                  tabIndex={collapsed ? -1 : undefined}
                  type="button"
                >
                  <MaterialSymbol className="shrink-0 text-primary" filled name="neurology" size={20} />
                  <SidebarLabel className="flex-1" collapsed={collapsed} index={1} reducedMotion={reducedMotion}>
                    AI 教学
                  </SidebarLabel>
                  <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-100">
                    AI
                  </span>
                  <motion.span
                    animate={{ rotate: aiOpen ? 180 : 0 }}
                    className="flex shrink-0"
                    transition={contentTransition}
                  >
                    <MaterialSymbol name="keyboard_arrow_down" size={18} />
                  </motion.span>
                </button>
              </motion.div>

              <AnimatePresence initial={false}>
                {collapsed || aiOpen ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "relative space-y-1",
                      !collapsed &&
                        "mt-1 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-sidebar-border",
                    )}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    initial={animateExpandedContent ? (reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }) : false}
                    key="ai-submenu"
                    transition={contentTransition}
                  >
                    {aiItems.map((item, index) => (
                      <NavLink
                        active={isActivePath(pathname, item.href)}
                        collapsed={collapsed}
                        index={index + 2}
                        item={item}
                        key={item.href}
                        nested
                        onPrefetch={prefetchRoute}
                        pointerY={pointerY}
                        reducedMotion={reducedMotion}
                        registerItem={registerItem}
                      />
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            {moduleItems.map((item, index) => (
              <NavLink
                active={isActivePath(pathname, item.href)}
                collapsed={collapsed}
                index={index + 5}
                item={item}
                key={item.href}
                onPrefetch={prefetchRoute}
                pointerY={pointerY}
                reducedMotion={reducedMotion}
                registerItem={registerItem}
              />
            ))}
          </div>
        </nav>

        <div className={cn("border-t border-sidebar-border py-4 transition-[padding] duration-200 ease-out", collapsed ? "px-2" : "px-3")}>
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
