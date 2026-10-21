"use client";

import {
  HugeiconsIcon,
  type IconSvgElement,
} from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import {
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

import type {
  BranchedMenuIcon,
  BranchedMenuLeaf,
  BranchedMenuSection,
} from "./types";

import "./branched-menu.css";

const PAD = 6;
const MARK = 16;

function renderIcon(icon: BranchedMenuIcon, size = 16) {
  if (isValidElement(icon)) {
    return icon;
  }
  return (
    <HugeiconsIcon
      icon={icon as IconSvgElement}
      size={size}
      strokeWidth={1.8}
    />
  );
}

export interface BranchedMenuProps {
  items: BranchedMenuSection[];
  activeValue?: string;
  openValues?: readonly string[];
  defaultOpenValues?: readonly string[];
  onSelect?: (value: string, item: BranchedMenuLeaf | BranchedMenuSection) => void;
  onOpenChange?: (openValues: ReadonlySet<string>) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
  emptyLabel?: ReactNode;
}

export function BranchedMenu({
  items,
  activeValue = "",
  openValues,
  defaultOpenValues,
  onSelect,
  onOpenChange,
  color = "#dce9fa",
  accentColor = "#7cc4ff",
  lineColor = "rgba(124, 196, 255, 0.3)",
  width = 280,
  rowHeight = 38,
  indent = 42,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 13,
  drawDuration = 400,
  foldDuration = 300,
  className,
  emptyLabel = "暂无可浏览内容",
}: BranchedMenuProps) {
  const baseId = useId().replace(/:/g, "");
  const initialOpen = new Set(
    defaultOpenValues ?? items.map((item) => item.value),
  );
  const [internalOpen, setInternalOpen] =
    useState<ReadonlySet<string>>(initialOpen);
  const controlled = openValues !== undefined;
  const open = controlled ? new Set(openValues) : new Set(internalOpen);
  const navRef = useRef<HTMLElement>(null);
  const headRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const markerRef = useRef<HTMLSpanElement>(null);

  const activeSection = items.findIndex(
    (item) =>
      item.value === activeValue ||
      item.children.some((child) => child.value === activeValue),
  );
  const markerShown =
    activeSection >= 0 && open.has(items[activeSection]?.value ?? "");

  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const marker = markerRef.current;
      const section = items[activeSection];
      const head = section ? headRefs.current[section.value] : null;
      if (!marker) {
        return;
      }
      const visible = markerShown && Boolean(head);
      if (!glide) {
        marker.style.transition = "none";
      }
      if (visible && head) {
        marker.style.top = `${
          head.offsetTop + (head.offsetHeight - MARK) / 2
        }px`;
      }
      marker.toggleAttribute("data-on", visible);
      if (!glide) {
        void marker.offsetHeight;
        marker.style.transition = "";
      }
    };

    place(true);
    let firstObservation = true;
    const observer = new ResizeObserver(() => {
      if (firstObservation) {
        firstObservation = false;
        return;
      }
      place(false);
    });
    if (navRef.current) {
      observer.observe(navRef.current);
    }
    return () => observer.disconnect();
  }, [activeSection, fontSize, items, markerShown, rowHeight]);

  function commitOpen(next: ReadonlySet<string>) {
    if (!controlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  function toggleSection(section: BranchedMenuSection) {
    const next = new Set(open);
    if (next.has(section.value)) {
      next.delete(section.value);
    } else {
      next.add(section.value);
    }
    commitOpen(next);
  }

  function selectItem(item: BranchedMenuLeaf | BranchedMenuSection) {
    onSelect?.(item.value, item);
  }

  const curveRadius = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (index: number) =>
    PAD + index * rowHeight + rowHeight / 2;
  const branchPath = (index: number) =>
    `M ${trunk} ${rowY(index) - curveRadius} A ${curveRadius} ${curveRadius} 0 0 0 ${trunk + curveRadius} ${rowY(index)} H ${endX}`;
  const reachPath = (index: number) =>
    `M ${trunk} 0 V ${rowY(index) - curveRadius} A ${curveRadius} ${curveRadius} 0 0 0 ${trunk + curveRadius} ${rowY(index)} H ${endX}`;
  const pathLength = (index: number) =>
    rowY(index) -
    curveRadius +
    (Math.PI * curveRadius) / 2 +
    (endX - trunk - curveRadius);

  return (
    <nav
      aria-label="课程知识与资源目录"
      className={cn("branched-menu", className)}
      ref={navRef}
      style={
        {
          "--bm-w": `${width}px`,
          "--bm-ink": color,
          "--bm-accent": accentColor,
          "--bm-line": lineColor,
          "--bm-font": `${fontSize}px`,
          "--bm-row": `${rowHeight}px`,
          "--bm-indent": `${indent}px`,
          "--bm-line-w": lineWidth,
          "--bm-draw": `${drawDuration}ms`,
          "--bm-fold": `${foldDuration}ms`,
        } as CSSProperties
      }
    >
      <span
        aria-hidden="true"
        className="branched-menu__marker"
        ref={markerRef}
      />
      {items.length ? (
        items.map((section) => {
          const isOpen = open.has(section.value);
          const sectionActive =
            section.value === activeValue ||
            section.children.some((child) => child.value === activeValue);
          const bodyHeight =
            PAD * 2 + Math.max(section.children.length, 1) * rowHeight;
          const bodyId = `${baseId}-${section.value.replace(/[^a-z0-9_-]/gi, "-")}`;
          return (
            <section
              className="branched-menu__section"
              data-open={isOpen ? "" : undefined}
              key={section.value}
            >
              <div
                className="branched-menu__head-row"
                data-active={sectionActive ? "" : undefined}
                ref={(node) => {
                  headRefs.current[section.value] = node;
                }}
              >
                <button
                  aria-current={sectionActive ? "true" : undefined}
                  className="branched-menu__head"
                  onClick={() => selectItem(section)}
                  title={section.label}
                  type="button"
                >
                  {section.icon ? (
                    <span aria-hidden="true" className="branched-menu__head-icon">
                      {renderIcon(section.icon, 17)}
                    </span>
                  ) : null}
                  <span className="branched-menu__head-copy">
                    <span className="branched-menu__head-label">
                      {section.label}
                    </span>
                    {section.meta ? (
                      <span className="branched-menu__head-meta">
                        {section.meta}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  aria-controls={bodyId}
                  aria-expanded={section.children.length ? isOpen : false}
                  aria-label={
                    section.children.length
                      ? `${isOpen ? "收起" : "展开"}${section.label}`
                      : `${section.label}暂无章节`
                  }
                  className="branched-menu__toggle"
                  disabled={!section.children.length}
                  onClick={() => toggleSection(section)}
                  type="button"
                >
                  {section.children.length ? (
                    <HugeiconsIcon
                      icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon}
                      size={15}
                      strokeWidth={1.8}
                    />
                  ) : null}
                </button>
              </div>
              <div className="branched-menu__body" id={bodyId}>
                <div className="branched-menu__fold">
                  <div
                    className="branched-menu__tree"
                    style={{ height: bodyHeight }}
                  >
                    {section.children.length ? (
                      <>
                        <svg
                          aria-hidden="true"
                          className="branched-menu__lines"
                          height={bodyHeight}
                          width={indent}
                        >
                          <path
                            className="branched-menu__base"
                            d={`M ${trunk} 0 V ${
                              rowY(section.children.length - 1) - curveRadius
                            }`}
                          />
                          {section.children.map((child, index) => (
                            <path
                              className="branched-menu__base"
                              d={branchPath(index)}
                              key={`base:${child.value}`}
                            />
                          ))}
                          {section.children.map((child, index) => (
                            <path
                              className="branched-menu__reach"
                              d={reachPath(index)}
                              key={`reach:${child.value}`}
                              style={{
                                strokeDasharray: pathLength(index),
                                strokeDashoffset:
                                  child.value === activeValue
                                    ? 0
                                    : pathLength(index),
                              }}
                            />
                          ))}
                        </svg>
                        {section.children.map((child) => (
                          <button
                            aria-current={
                              child.value === activeValue ? "true" : undefined
                            }
                            className="branched-menu__item"
                            data-active={
                              child.value === activeValue ? "" : undefined
                            }
                            key={child.value}
                            onClick={() => selectItem(child)}
                            tabIndex={isOpen ? 0 : -1}
                            title={child.label}
                            type="button"
                          >
                            {child.icon ? (
                              <span
                                aria-hidden="true"
                                className="branched-menu__icon"
                              >
                                {renderIcon(child.icon, 15)}
                              </span>
                            ) : null}
                            <span className="branched-menu__label">
                              {child.label}
                            </span>
                            {child.meta ? (
                              <span className="branched-menu__item-meta">
                                {child.meta}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </>
                    ) : (
                      <p className="branched-menu__empty">
                        {section.emptyLabel ?? "当前资源还没有章节"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })
      ) : (
        <div className="branched-menu__empty branched-menu__empty--root">
          {emptyLabel}
        </div>
      )}
    </nav>
  );
}
