"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type Trail = { id: string; d: string; color: string };
const colors = ["#2f8dff", "#916bf0", "#2cc8ce", "#bc8bff", "#5a9cf7"];

export function AiStageFlow({
  hostRef,
  evidenceCount,
  state,
  paused,
}: {
  hostRef: RefObject<HTMLElement | null>;
  evidenceCount: number;
  state: SecondaryAnalysisState;
  paused: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; trails: Trail[] }>({ width: 1, height: 1, trails: [] });
  const [inViewport, setInViewport] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const region = host.getBoundingClientRect();
        const core = host.querySelector<HTMLElement>('[data-ai-core="true"]');
        const graph = host.querySelector<HTMLElement>('[data-ai-graph="true"]');
        const inputs = [...host.querySelectorAll<HTMLElement>('[data-evidence-stream="true"]')];
        if (!core || !graph || region.width < 20) return;
        const hub = core.getBoundingClientRect();
        const visualCenter = { x: hub.left + hub.width / 2 - region.left, y: hub.top + Math.min(hub.height * 0.44, 200) - region.top };
        const graphRect = graph.getBoundingClientRect();
        const connections: Trail[] = inputs.map((element, index) => {
          const r = element.getBoundingClientRect();
          const x = r.right - region.left - 1;
          const y = r.top + r.height / 2 - region.top;
          const endX = visualCenter.x - Math.min(94, hub.width * 0.22);
          const endY = visualCenter.y + (index - (inputs.length - 1) / 2) * 8;
          return { id: `e-${index}`, color: colors[index % colors.length], d: `M ${x} ${y} C ${x + 70} ${y}, ${endX - 95} ${endY}, ${endX} ${endY}` };
        });
        if (graphRect.left - region.left > visualCenter.x + 80) {
          for (let index = 0; index < 3; index++) {
            const startX = visualCenter.x + Math.min(90, hub.width * .21);
            const y = visualCenter.y + (index - 1) * 16;
            const targetX = graphRect.left - region.left + 7;
            const endY = graphRect.top - region.top + graphRect.height * (.39 + index * .12);
            connections.push({ id: `out-${index}`, color: colors[[0,1,2][index]], d: `M ${startX} ${y} C ${startX + 72} ${y}, ${targetX - 72} ${endY}, ${targetX} ${endY}` });
          }
        }
        setGeometry({ width: region.width, height: region.height, trails: connections });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    const roTargets = [...host.querySelectorAll('[data-evidence-stream="true"], [data-ai-core="true"], [data-ai-graph="true"]')];
    roTargets.forEach((el) => observer.observe(el));
    sync();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [evidenceCount, hostRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(([entry]) => { setInViewport(entry.isIntersecting); }, { threshold: 0 });
    io.observe(host);
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [hostRef]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try { if (paused || !inViewport || !tabVisible) svg.pauseAnimations(); else svg.unpauseAnimations(); } catch { /* Browser SVG fallback: static paths stay visible. */ }
  }, [geometry, paused, inViewport, tabVisible]);

  return (
    <svg
      aria-hidden="true"
      className={styles.signalLayer}
      ref={svgRef}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      data-ai-flow-layer="true"
    >
      <defs>
        <filter id="echo-flow-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      {geometry.trails.map((trail, index) => (
        <g key={trail.id}>
          <path d={trail.d} fill="none" stroke={trail.color} strokeWidth="7" opacity=".10" filter="url(#echo-flow-glow)" />
          <path d={trail.d} fill="none" stroke={trail.color} strokeWidth="2" opacity=".63" strokeDasharray="8 9" />
          {!paused && inViewport && tabVisible ? (
            <>
              <circle r="4.5" fill={trail.color} opacity=".9"><animateMotion path={trail.d} dur={`${state === "analyzing" ? 2.8 + index * .28 : 6 + index * .45}s`} repeatCount="indefinite" begin={`${-index * .57}s`} /></circle>
              <circle r="2.1" fill="#f8fdff"><animateMotion path={trail.d} dur={`${state === "analyzing" ? 2.8 + index * .28 : 6 + index * .45}s`} repeatCount="indefinite" begin={`${-index * .57 - 1.5}s`} /></circle>
            </>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
