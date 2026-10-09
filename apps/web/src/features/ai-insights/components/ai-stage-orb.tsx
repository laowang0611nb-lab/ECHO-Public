"use client";

import { BrainCircuit, CircleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type ActivityPhase = "idle" | "dragging" | "hovering-orb" | "consuming" | "analyzing-item" | "item-complete";
type Orbit = { path: string; frontClip: string; backClip: string; color: string; delay: number };

/**
 * Draw the SAME unbroken full orbit in both layers, and statically clip each
 * copy along the projected depth axis. Both copies use the same pathLength,
 * animation phase and duration, so the tracer crosses the depth boundary
 * without a dash reset, an opacity jump, an animated mask, or a DOM reorder.
 *
 * The front arc lives above the globe; the back arc lives below it. We do not
 * mask a guessed central circle: that old mask sliced arcs into visible gaps.
 */
export function buildOrbit(rx: number, ry: number, angle: number, color: string, delay: number): Orbit {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const coords: string[] = [];
  const steps = 360;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const x = 220 + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin;
    const y = 192 + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos;
    coords.push(`${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`);
  }
  // Large parallelograms are mathematical half-planes for the two depth arcs.
  // Their common boundary is the projected major axis through the orb centre.
  const extent = 900;
  const left = { x: 220 - extent * cos, y: 192 - extent * sin };
  const right = { x: 220 + extent * cos, y: 192 + extent * sin };
  const normal = { x: -extent * sin, y: extent * cos };
  const point = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  const clip = (sign: number) => [
    point(left.x, left.y), point(right.x, right.y),
    point(right.x + normal.x * sign, right.y + normal.y * sign),
    point(left.x + normal.x * sign, left.y + normal.y * sign),
  ].join(" ");
  return { path: `${coords.join(" ")} Z`, frontClip: clip(1), backClip: clip(-1), color, delay };
}

export function AiStageOrb({
  state, paused, subtitle, activeColor, activeLabel, activityPhase = "idle",
}: {
  state: SecondaryAnalysisState;
  paused: boolean;
  subtitle: string;
  activeColor?: string;
  activeLabel?: string | null;
  activityPhase?: ActivityPhase;
}) {
  const id = useId().replace(/:/g, "");
  const tracks = useMemo(() => [
    buildOrbit(188, 76, -20, "#54b9ff", -1.4),
    buildOrbit(173, 94, 33, "#9b79fa", -4.2),
    buildOrbit(158, 116, -55, "#59d7f7", -7.0),
  ], []);
  const backRef = useRef<SVGSVGElement>(null);
  const frontRef = useRef<SVGSVGElement>(null);
  const interacting = activityPhase !== "idle";
  const fast = activityPhase === "consuming" || activityPhase === "analyzing-item";
  const speed = fast ? "3.4s" : interacting ? "6.5s" : state === "analyzing" ? "8s" : "15s";
  const cssVars = { "--orb-speed": speed, "--orb-active-color": activeColor ?? "#54b9ff" } as CSSProperties;
  const status = state === "analyzing" ? "AI 正在分析" : state === "completed" ? "分析已完成" : state === "failed" ? "分析失败" : "等待分析";
  const visualStatus = activityPhase === "consuming" ? `正在吸入${activeLabel ?? "学习证据"}…` :
    activityPhase === "analyzing-item" ? `正在分析该项：${activeLabel ?? "学习证据"}（交互演示）` :
    activityPhase === "item-complete" ? `${activeLabel ?? "证据"}已投入 · 未生成新结论` : null;

  useEffect(() => {
    for (const svg of [backRef.current, frontRef.current]) {
      if (!svg) continue;
      try { if (paused) svg.pauseAnimations(); else svg.unpauseAnimations(); }
      catch { /* Static orbit contours still render. */ }
    }
  }, [paused]);

  const renderTracks = (side: "front" | "back") => tracks.map((track, index) => {
    const clipId = `${id}-${side}-${index}`;
    return (
      <g key={index} clipPath={`url(#${clipId})`} style={{ "--orbit-delay": `${track.delay}s` } as CSSProperties}>
        <path d={track.path} pathLength={1000} stroke={track.color} className={styles.orbitGlow} />
        <path d={track.path} pathLength={1000} stroke={track.color}
          className={side === "front" ? styles.orbitSolidFront : styles.orbitSolidRear} />
        <path d={track.path} pathLength={1000} stroke={side === "front" ? "#f6fcff" : track.color} className={styles.orbitTrace} />
      </g>
    );
  });

  return (
    <div className={styles.orbArea} data-ai-core="true" data-motion={paused ? "paused" : "running"}
      data-analysis-state={state} data-activity={activityPhase} style={cssVars}>
      <div aria-hidden="true" className={styles.coreAura} />
      <svg ref={backRef} aria-hidden="true" className={styles.orbitsBack} viewBox="0 0 440 390" preserveAspectRatio="xMidYMid meet">
        <defs>{tracks.map((track, index) => <clipPath key={index} id={`${id}-back-${index}`} clipPathUnits="userSpaceOnUse"><polygon points={track.backClip} /></clipPath>)}</defs>
        {renderTracks("back")}
      </svg>
      <div aria-hidden="true" className={styles.coreOuterRing} />
      <div className={styles.sphere} data-ai-drop-zone="true">
        <div aria-hidden="true" className={styles.sphereLattice} />
        <div aria-hidden="true" className={styles.sphereRefraction} />
        <div aria-hidden="true" className={styles.sphereHighlight} />
        <div className={styles.sphereContent}>
          {state === "failed" ? <CircleAlert size={50} strokeWidth={1.45} /> : <BrainCircuit size={55} strokeWidth={1.35} />}
          <strong>ECHO AI</strong><span>推理 · 归因 · 决策</span>
        </div>
      </div>
      <svg ref={frontRef} aria-hidden="true" className={styles.orbitsFront} viewBox="0 0 440 390" preserveAspectRatio="xMidYMid meet">
        <defs>{tracks.map((track, index) => <clipPath key={index} id={`${id}-front-${index}`} clipPathUnits="userSpaceOnUse"><polygon points={track.frontClip} /></clipPath>)}</defs>
        {renderTracks("front")}
      </svg>
      <div aria-hidden="true" className={styles.orbPedestal}>
        <span className={styles.pedestalDisc} /><span className={styles.pedestalRing} /><span className={styles.pedestalRingSecondary} />
      </div>
      {visualStatus ? <div className={styles.orbActivityMessage} role="status">{visualStatus}</div> : null}
      <div className={styles.orbStatus} role="status" aria-live="polite">
        <span className={styles.liveDot} /><strong>{status}</strong><span className={styles.orbStatusDivider}>·</span><span>{subtitle}</span>
      </div>
    </div>
  );
}
