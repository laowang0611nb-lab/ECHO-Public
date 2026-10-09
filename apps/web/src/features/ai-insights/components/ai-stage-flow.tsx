"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type Trail = { id: string; d: string; color: string; kind: "evidence" | "output" };
type Geometry = { width: number; height: number; trails: Trail[] };

export function AiStageFlow({
  hostRef,
  evidenceCount,
  activeEvidenceId,
  activityPhase,
  state,
  paused,
}: {
  hostRef: RefObject<HTMLElement | null>;
  evidenceCount: number;
  activeEvidenceId?: string | null;
  activityPhase?: string;
  state: SecondaryAnalysisState;
  paused: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const filterId = useId().replace(/:/g, "");
  const [geometry, setGeometry] = useState<Geometry>({ width: 1, height: 1, trails: [] });
  const [inViewport, setInViewport] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const bounds = host.getBoundingClientRect();
        const drop = host.querySelector<HTMLElement>('[data-ai-drop-zone="true"]');
        const graph = host.querySelector<HTMLElement>('[data-ai-graph="true"]');
        const inputs = [...host.querySelectorAll<HTMLElement>('[data-evidence-stream="true"]')];
        if (!drop || !graph || bounds.width < 20) return;
        const sphere = drop.getBoundingClientRect();
        const centerX = sphere.left + sphere.width / 2 - bounds.left;
        const centerY = sphere.top + sphere.height / 2 - bounds.top;
        const trails: Trail[] = inputs.map((element, index) => {
          const r = element.getBoundingClientRect();
          const x = r.right - bounds.left;
          const y = r.top + r.height * .5 - bounds.top;
          // Paths stop at the sphere rim, rather than abruptly 90 px away.
          const endX = centerX - sphere.width * .485;
          const endY = centerY + (index - (inputs.length - 1) / 2) * 10;
          const c1 = x + Math.max(42, (endX - x) * .42);
          const c2 = endX - Math.max(38, (endX - x) * .3);
          return {
            id: element.dataset.evidenceId ?? `e-${index}`,
            d: `M ${x.toFixed(1)} ${y.toFixed(1)} C ${c1.toFixed(1)} ${y.toFixed(1)}, ${c2.toFixed(1)} ${endY.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`,
            color: element.dataset.evidenceAccent ?? "#368aff",
            kind: "evidence" as const,
          };
        });
        const r = graph.getBoundingClientRect();
        const targetX = r.left - bounds.left + 1;
        if (targetX > centerX + sphere.width / 2) {
          for (let index = 0; index < 3; index++) {
            const startX = centerX + sphere.width * .48;
            const startY = centerY + (index - 1) * 18;
            const endY = r.top - bounds.top + r.height * (.39 + index * .12);
            const mid = (targetX - startX) * .46;
            trails.push({
              id: `output-${index}`,
              d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${(startX + mid).toFixed(1)} ${startY.toFixed(1)}, ${(targetX - mid).toFixed(1)} ${endY.toFixed(1)}, ${targetX.toFixed(1)} ${endY.toFixed(1)}`,
              color: ["#4c9dff", "#9c72f3", "#36cddd"][index], kind: "output",
            });
          }
        }
        setGeometry({ width: bounds.width, height: bounds.height, trails });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    host.querySelectorAll('[data-evidence-stream="true"], [data-ai-drop-zone="true"], [data-ai-graph="true"]').forEach((element) => observer.observe(element));
    window.addEventListener("resize", sync, { passive: true });
    sync();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("resize", sync); };
  }, [evidenceCount, hostRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0 });
    observer.observe(host);
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hostRef]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try { if (paused || !inViewport || !tabVisible) svg.pauseAnimations(); else svg.unpauseAnimations(); }
    catch { /* Old browser: static curves remain visible. */ }
  }, [geometry, paused, inViewport, tabVisible]);

  const isActive = Boolean(activeEvidenceId);
  return (
    <svg aria-hidden="true" ref={svgRef} className={styles.signalLayer} data-ai-flow-layer="true" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none">
      <defs><filter id={`${filterId}-flow-glow`} x="-30%" y="-200%" width="160%" height="500%"><feGaussianBlur stdDeviation="3.2" /></filter></defs>
      {geometry.trails.map((trail, index) => {
        const active = trail.id === activeEvidenceId;
        const opacity = isActive && trail.kind === "evidence" && !active ? .20 : active ? 1 : trail.kind === "output" ? .67 : .78;
        const duration = active && activityPhase === "consuming" ? 1.2 : state === "analyzing" ? 3.8 : active ? 2.8 : 7.5;
        return (
          <g key={trail.id} opacity={opacity}>
            <path d={trail.d} fill="none" stroke={trail.color} strokeWidth={active ? 13 : 9} opacity={active ? .31 : .18} filter={`url(#${filterId}-flow-glow)`} />
            <path d={trail.d} fill="none" stroke={trail.color} strokeWidth={active ? 3.4 : 2.4} opacity={active ? .94 : .65} strokeLinecap="round" />
            <path d={trail.d} className={styles.signalTracer} stroke={trail.color} strokeWidth={active ? 4 : 2.8} fill="none" strokeDasharray="4 18" style={{ animationDuration: `${duration * 2.8}s` }} />
            {!paused ? (
              <>
                <circle r={active ? 5 : 3.5} fill={trail.color}>
                  <animateMotion path={trail.d} dur={`${duration}s`} repeatCount="indefinite" begin={`${-index * .45}s`} />
                </circle>
                <circle r="1.9" fill="#ffffff">
                  <animateMotion path={trail.d} dur={`${duration}s`} repeatCount="indefinite" begin={`${-index * .45}s`} />
                </circle>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
