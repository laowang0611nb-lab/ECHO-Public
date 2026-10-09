"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type Point = { x: number; y: number };
type Trail = { id: string; d: string; color: string; kind: "evidence" | "output"; start: Point; end: Point };
type Geometry = { width: number; height: number; trails: Trail[] };
const EMPTY: Geometry = { width: 1, height: 1, trails: [] };

/**
 * One SVG coordinate space for all paths. Its measured endpoints belong to REAL
 * evidence rows, the real drop sphere and the graph. No hard-coded column widths.
 */
export function AiStageFlow({
  hostRef,
  evidenceSignature,
  activeEvidenceId,
  activityPhase,
  state,
  paused,
}: {
  hostRef: RefObject<HTMLElement | null>;
  evidenceSignature: string;
  activeEvidenceId?: string | null;
  activityPhase?: string;
  state: SecondaryAnalysisState;
  paused: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stableId = useId().replace(/:/g, "");
  const [geometry, setGeometry] = useState<Geometry>(EMPTY);
  const [inViewport, setInViewport] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    let disposed = false;
    let lastSignature = "";

    const measure = () => {
      frame = 0;
      if (disposed) return;
      const bounds = host.getBoundingClientRect();
      const drop = host.querySelector<HTMLElement>('[data-ai-drop-zone="true"]');
      const graph = host.querySelector<HTMLElement>('[data-ai-graph="true"]');
      if (!drop || !graph || bounds.width <= 20 || bounds.height <= 20) return;

      const sphere = drop.getBoundingClientRect();
      const center = {
        x: sphere.left + sphere.width / 2 - bounds.left,
        y: sphere.top + sphere.height / 2 - bounds.top,
      };
      const inputs = Array.from(host.querySelectorAll<HTMLElement>('[data-evidence-stream="true"]'));
      const trails: Trail[] = [];
      for (let index = 0; index < inputs.length; index += 1) {
        const element = inputs[index];
        const rect = element.getBoundingClientRect();
        // Terminate at the actual spherical rim. Five distinct arrival heights
        // prevent the lines from collapsing onto one pixel at the AI core.
        const spread = (index - (inputs.length - 1) / 2) * 13;
        const endY = center.y + spread;
        const radius = Math.max(0, sphere.width / 2 - 5);
        const endX = center.x - Math.sqrt(Math.max(0, radius * radius - spread * spread));
        const start = { x: rect.right - bounds.left - 1, y: rect.top + rect.height / 2 - bounds.top };
        const end = { x: endX, y: endY };
        const distance = end.x - start.x;
        if (distance < 15) continue; // Compact layout: do not draw a backwards line.
        trails.push({
          id: element.dataset.evidenceId ?? `source-${index}`,
          d: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${(start.x + distance * .42).toFixed(2)} ${start.y.toFixed(2)}, ${(end.x - distance * .38).toFixed(2)} ${end.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
          color: element.dataset.evidenceAccent ?? "#368aff",
          kind: "evidence", start, end,
        });
      }

      const r = graph.getBoundingClientRect();
      const graphX = r.left - bounds.left + 2;
      const rightStartX = center.x + sphere.width / 2 - 5;
      if (graphX - rightStartX > 20) {
        for (let index = 0; index < 3; index += 1) {
          const start = { x: rightStartX, y: center.y + (index - 1) * 17 };
          const end = { x: graphX, y: r.top - bounds.top + r.height * (.34 + index * .16) };
          const distance = end.x - start.x;
          trails.push({
            id: `output-${index}`,
            d: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${(start.x + distance * .43).toFixed(2)} ${start.y.toFixed(2)}, ${(end.x - distance * .36).toFixed(2)} ${end.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
            color: ["#438eff", "#9a79fa", "#25c6d8"][index], kind: "output", start, end,
          });
        }
      }
      const next: Geometry = { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height), trails };
      // ResizeObserver can run after every React commit. Avoid state update loops.
      const signature = `${next.width.toFixed(1)}:${next.height.toFixed(1)}:${trails.map((t) => `${t.id}|${t.d}|${t.color}`).join(";")}`;
      if (signature !== lastSignature) { lastSignature = signature; setGeometry(next); }
    };
    const schedule = () => {
      if (!frame && !disposed) frame = requestAnimationFrame(measure);
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(host);
    host.querySelectorAll('[data-evidence-stream="true"], [data-ai-drop-zone="true"], [data-ai-graph="true"]').forEach((el) => resizeObserver.observe(el));
    // Handles course swaps with the SAME number of evidence rows, and elements
    // appearing later after async loading without resizing the outer stage.
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-evidence-stream", "data-evidence-id", "data-evidence-accent"] });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, true);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect(); mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [hostRef, evidenceSignature]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting));
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
    catch { /* Static paths remain legible in browsers without SMIL controls. */ }
  }, [geometry, paused, inViewport, tabVisible]);

  const focused = Boolean(activeEvidenceId);
  return (
    <svg ref={svgRef} aria-hidden="true" className={styles.signalLayer} data-ai-flow-layer="true"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none">
      {geometry.trails.map((trail, index) => {
        const active = trail.id === activeEvidenceId;
        const muted = focused && trail.kind === "evidence" && !active;
        const duration = active && activityPhase === "consuming" ? 1.1 : state === "analyzing" ? 3.5 : active ? 2.8 : 6.4;
        return (
          <g key={`${stableId}-${trail.id}`} className={styles.flowTrail} data-flow-evidence-id={trail.id}
            opacity={muted ? .19 : 1}>
            {/* No SVG blur filter is necessary: multi-width translucent strokes
                have stable compositing and are visible even on light Plasma. */}
            <path d={trail.d} fill="none" stroke={trail.color} strokeWidth={active ? 18 : 13} opacity={active ? .21 : .12} strokeLinecap="round" />
            <path d={trail.d} fill="none" stroke={trail.color} strokeWidth={active ? 8 : 6} opacity={active ? .30 : .20} strokeLinecap="round" />
            <path d={trail.d} fill="none" stroke={trail.color} strokeWidth={active ? 3.5 : 2.7} opacity={active ? 1 : .82} strokeLinecap="round" />
            <circle cx={trail.start.x} cy={trail.start.y} r={active ? 5 : 3.5} fill="white" stroke={trail.color} strokeWidth="2.5" />
            <circle cx={trail.end.x} cy={trail.end.y} r="3.2" fill="white" stroke={trail.color} strokeWidth="2" />
            {!paused && inViewport && tabVisible ? (
              <g>
                <circle r={active ? 6 : 4.5} fill={trail.color} opacity=".28">
                  <animateMotion path={trail.d} dur={`${duration}s`} repeatCount="indefinite" begin={`${-index * .41}s`} />
                </circle>
                <circle r={active ? 3.5 : 2.7} fill="#ffffff" stroke={trail.color} strokeWidth="1.3">
                  <animateMotion path={trail.d} dur={`${duration}s`} repeatCount="indefinite" begin={`${-index * .41}s`} />
                </circle>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
