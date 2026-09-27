"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
const ITEM_TILE_MAX = 64;
const MAX_SCALE = ITEM_TILE_MAX / ITEM_TILE_BASE;
const FOCUS_SCALE = 1.18;
const FALLOFF = 104;
const PROXIMITY_EXPONENT = 2.8;
const SPRING = { stiffness: 480, damping: 18, mass: 0.34 };
const EASE = "easeOut" as const;

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

function NavLink({
  item,
  nested = false,
  collapsed = false,
  index = 0,
  pointerY,
  registerItem,
  reducedMotion,
}: {
  item: NavItem;
  nested?: boolean;
  collapsed?: boolean;
  index?: number;
  pointerY: MotionValue<number>;
  registerItem: RegisterNavItem;
  reducedMotion: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const itemCenterY = useMotionValue(0);
  const focusScale = useSpring(1, SPRING);
  const [focused, setFocused] = useState(false);

  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!collapsed || !element) return;
    return registerItem(element, itemCenterY);
  }, [collapsed, itemCenterY, registerItem]);

  useEffect(() => {
    const nextFocusScale = collapsed && !reducedMotion && focused ? FOCUS_SCALE : 1;
    focusScale.set(nextFocusScale);
  }, [collapsed, focusScale, focused, reducedMotion]);

  const distanceY = useTransform<number, number>(
    [pointerY, itemCenterY],
    ([pointer, center]) => {
      if (!Number.isFinite(pointer)) return Number.POSITIVE_INFINITY;
      return pointer - (center ?? 0);
    },
  );
  const targetScale = useTransform<number, number>(distanceY, (distance) => {
    const normalizedDistance = Math.min(Math.abs(distance) / FALLOFF, 1);
    const proximity = 1 - normalizedDistance;
    return 1 + (MAX_SCALE - 1) * Math.pow(proximity, PROXIMITY_EXPONENT);
  });
  const proximityScale = useSpring(targetScale, SPRING);
  const scale = useTransform<number, number>(
    [proximityScale, focusScale],
    ([proximity, focus]) => Math.max(proximity ?? 1, focus ?? 1),
  );

  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center overflow-hidden rounded-lg text-sm text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-inset",
        collapsed ? "size-10 justify-center" : "gap-3 px-3 py-2.5",
        nested && !collapsed && "pl-9",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      href={item.href}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      title={collapsed ? item.label : undefined}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <MaterialSymbol
        className={cn(
          "shrink-0",
          active ? "text-primary" : "text-sidebar-foreground/60",
        )}
        filled={active}
        name={item.icon}
        size={collapsed ? 22 : 18}
      />
      {!collapsed ? (
        <SidebarLabel className="truncate" collapsed={collapsed} index={index} reducedMotion={reducedMotion}>
          {item.label}
        </SidebarLabel>
      ) : null}
    </Link>
  );

  return (
    <motion.div
      className={cn(
        "transform-gpu",
        collapsed ? "mx-auto w-10" : "w-full",
      )}
      ref={wrapperRef}
      style={{ scale: collapsed && !reducedMotion ? scale : 1 }}
    >
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={link} />
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </motion.div>
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
  const reducedMotion = useReducedMotion() ?? false;
  const pointerY = useMotionValue(Number.POSITIVE_INFINITY);
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
          <Button
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className={cn(
              "absolute top-1/2 -translate-y-1/2",
              collapsed ? "left-1/2 -translate-x-1/2" : "right-3",
            )}
            onClick={handleToggle}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MaterialSymbol name={collapsed ? "chevron_right" : "chevron_left"} size={18} />
          </Button>
        </div>

        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
          ref={navRef}
        >
          <div className="flex flex-col gap-2" ref={navContentRef}>
            {primaryItems.map((item, index) => (
              <NavLink
                collapsed={collapsed}
                index={index}
                item={item}
                key={item.href}
                pointerY={pointerY}
                reducedMotion={reducedMotion}
                registerItem={registerItem}
              />
            ))}

            {collapsed ? (
              <section className="space-y-1 border-t border-sidebar-border pt-3">
                {aiItems.map((item, index) => (
                  <NavLink
                    collapsed
                    index={index + 1}
                    item={item}
                    key={item.href}
                    pointerY={pointerY}
                    reducedMotion={reducedMotion}
                    registerItem={registerItem}
                  />
                ))}
              </section>
            ) : (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-blue-400/8 p-2"
                initial={animateExpandedContent ? { opacity: 0, y: -6 } : false}
                transition={contentTransition}
              >
                <button
                  aria-expanded={aiOpen}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                  onClick={() => setAiOpen((current) => !current)}
                  type="button"
                >
                  <MaterialSymbol className="shrink-0 text-primary" filled name="neurology" size={18} />
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

                <AnimatePresence initial={false}>
                  {aiOpen ? (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="relative mt-1 space-y-1 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-sidebar-border"
                      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      initial={animateExpandedContent ? (reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }) : false}
                      key="ai-submenu"
                      transition={contentTransition}
                    >
                      {aiItems.map((item, index) => (
                        <motion.div
                          animate={{ opacity: 1, x: 0 }}
                          initial={
                            animateExpandedContent
                              ? reducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, x: -6 }
                              : false
                          }
                          key={item.href}
                          transition={{
                            ...contentTransition,
                            delay: animateExpandedContent && !reducedMotion ? 0.04 + index * 0.055 : 0,
                          }}
                        >
                          <NavLink
                            index={index + 2}
                            item={item}
                            nested
                            pointerY={pointerY}
                            reducedMotion={reducedMotion}
                            registerItem={registerItem}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.section>
            )}

            {moduleItems.map((item, index) => (
              <NavLink
                collapsed={collapsed}
                index={index + 5}
                item={item}
                key={item.href}
                pointerY={pointerY}
                reducedMotion={reducedMotion}
                registerItem={registerItem}
              />
            ))}
          </div>
        </nav>

        <div className={cn("border-t border-sidebar-border py-4", collapsed ? "px-2" : "px-3")}>
          <NavLink
            collapsed={collapsed}
            index={8}
            item={accountItem}
            pointerY={pointerY}
            reducedMotion={reducedMotion}
            registerItem={registerItem}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}
