"use client";

import { BrainCircuit, CircleAlert } from "lucide-react";
import { useId, useMemo, type CSSProperties } from "react";

import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type Orbit = { front: string; back: string; color: string; offset: number };
type ActivityPhase = "idle" | "dragging" | "hovering-orb" | "consuming" | "analyzing-item" | "item-complete";

/**
 * Split each static orbit at the two EXACT depth zero-crossings (t=0 and t=PI).
 * Both halves share identical endpoints; only the light travelling on the track
 * moves, never its geometry, mask or stacking context.
 */
function orbitHalf(rx: number, ry: number, angle: number, start: number, end: number) {
  const rotation = (angle * Math.PI) / 180;
  const parts: string[] = [];
  for (let index = 0; index <= 100; index += 1) {
    const t = start + ((end - start) * index) / 100;
    const x = 220 + rx * Math.cos(t) * Math.cos(rotation) - ry * Math.sin(t) * Math.sin(rotation);
    const y = 192 + rx * Math.cos(t) * Math.sin(rotation) + ry * Math.sin(t) * Math.cos(rotation);
    parts.push(`${index === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`);
  }
  return parts.join(" ");
}

function makeOrbit(rx: number, ry: number, angle: number, color: string, offset: number): Orbit {
  return {
    front: orbitHalf(rx, ry, angle, 0, Math.PI),
    back: orbitHalf(rx, ry, angle, Math.PI, Math.PI * 2),
    color,
    offset,
  };
}

export function AiStageOrb({
  state,
  paused,
  subtitle,
  activeColor,
  activeLabel,
  activityPhase = "idle",
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
    makeOrbit(188, 76, -20, "#54b9ff", 0),
    makeOrbit(173, 94, 33, "#9b79fa", -2.6),
    makeOrbit(158, 116, -55, "#59d7f7", -4.8),
  ], []);
  const interacting = activityPhase !== "idle";
  const fast = activityPhase === "consuming" || activityPhase === "analyzing-item";
  const cssVars = {
    "--orb-speed": fast ? "3.4s" : interacting ? "6.5s" : state === "analyzing" ? "8s" : "15s",
    "--orb-active-color": activeColor ?? "#54b9ff",
  } as CSSProperties;
  const status = state === "analyzing" ? "AI 正在分析" : state === "completed" ? "分析已完成" : state === "failed" ? "分析失败" : "等待分析";
  const visualStatus = activityPhase === "consuming" ? `正在吸入${activeLabel ?? "学习证据"}…` :
    activityPhase === "analyzing-item" ? `正在分析该项：${activeLabel ?? "学习证据"}（交互演示）` :
    activityPhase === "item-complete" ? `${activeLabel ?? "证据"}已投入 · 未生成新结论` : null;

  return (
    <div className={styles.orbArea} data-ai-core="true" data-motion={paused ? "paused" : "running"} data-analysis-state={state} data-activity={activityPhase} style={cssVars}>
      <div aria-hidden="true" className={styles.coreAura} />
      <svg aria-hidden="true" className={styles.orbitsBack} viewBox="0 0 440 390" preserveAspectRatio="xMidYMid meet">
        <defs><filter id={`${id}-rear-glow`} x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="3" /></filter></defs>
        {tracks.map((track, index) => (
          <g key={index}>
            <path d={track.back} stroke={track.color} className={styles.orbitGlow} filter={`url(#${id}-rear-glow)`} />
            <path d={track.back} stroke={track.color} className={styles.orbitSolidRear} />
            <path d={track.back} stroke={track.color} className={styles.orbitTrace} style={{ animationDelay: `${track.offset}s` }} />
          </g>
        ))}
      </svg>
      <div aria-hidden="true" className={styles.coreOuterRing} />
      <div className={styles.sphere} data-ai-drop-zone="true">
        <div aria-hidden="true" className={styles.sphereLattice} />
        <div aria-hidden="true" className={styles.sphereRefraction} />
        <div aria-hidden="true" className={styles.sphereHighlight} />
        <div className={styles.sphereContent}>
          {state === "failed" ? <CircleAlert size={50} strokeWidth={1.45} /> : <BrainCircuit size={55} strokeWidth={1.35} />}
          <strong>ECHO AI</strong>
          <span>推理 · 归因 · 决策</span>
        </div>
      </div>
      <svg aria-hidden="true" className={styles.orbitsFront} viewBox="0 0 440 390" preserveAspectRatio="xMidYMid meet">
        <defs>
          <mask id={`${id}-logo-protect`} maskUnits="userSpaceOnUse" x="0" y="0" width="440" height="390">
            <rect x="0" y="0" width="440" height="390" fill="white" />
            <ellipse cx="220" cy="192" rx="93" ry="92" fill="black" />
          </mask>
          <filter id={`${id}-front-glow`} x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <g mask={`url(#${id}-logo-protect)`}>
          {tracks.map((track, index) => (
            <g key={index}>
              <path d={track.front} stroke={track.color} className={styles.orbitGlow} filter={`url(#${id}-front-glow)`} />
              <path d={track.front} stroke={track.color} className={styles.orbitSolidFront} />
              <path d={track.front} stroke="#f7fdff" className={styles.orbitTrace} style={{ animationDelay: `${track.offset}s` }} />
            </g>
          ))}
        </g>
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
