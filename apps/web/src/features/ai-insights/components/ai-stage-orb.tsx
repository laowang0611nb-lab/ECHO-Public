"use client";

import { BrainCircuit, CircleAlert } from "lucide-react";
import { useId, useMemo } from "react";

import type { SecondaryAnalysisState } from "./analysis-engine";
import styles from "./ai-neural-stage.module.css";

type Track = { behind: string; ahead: string; color: string; delay: number; thickness: number };

/** A physical-looking orbit, divided by its simulated depth before painting.
 * The rear half lives BELOW the globe; the near half lives ABOVE it but is
 * masked away from the center logo. No CSS z-index trick changes this order.
 */
function makeOrbit(rx: number, ry: number, angle: number, phase: number, color: string, delay: number): Track {
  const rot = (angle * Math.PI) / 180;
  const front: string[] = [];
  const rear: string[] = [];
  const steps = 180;
  let wasFront: boolean | undefined;
  for (let index = 0; index <= steps; index++) {
    const t = phase + (index / steps) * Math.PI * 2;
    const baseX = rx * Math.cos(t);
    const baseY = ry * Math.sin(t);
    const x = 220 + baseX * Math.cos(rot) - baseY * Math.sin(rot);
    const y = 190 + baseX * Math.sin(rot) + baseY * Math.cos(rot);
    const near = Math.sin(t) >= 0;
    const point = `${x.toFixed(2)} ${y.toFixed(2)}`;
    if (wasFront !== near) {
      // Both layers share the boundary point, so there is no visible seam.
      if (wasFront !== undefined) {
        (wasFront ? front : rear).push(`L${point}`);
      }
      (near ? front : rear).push(`M${point}`);
    } else {
      (near ? front : rear).push(`L${point}`);
    }
    wasFront = near;
  }
  return { behind: rear.join(" "), ahead: front.join(" "), color, delay, thickness: 1.6 };
}

export function AiStageOrb({
  state,
  paused,
  subtitle,
}: {
  state: SecondaryAnalysisState;
  paused: boolean;
  subtitle: string;
}) {
  const id = useId().replace(/:/g, "");
  const maskId = `${id}-safe-center`;
  const tracks = useMemo(() => [
    makeOrbit(187, 74, -20, 0, "#54b9ff", 0),
    makeOrbit(173, 93, 33, Math.PI / 4, "#9b79fa", -3),
    makeOrbit(157, 119, -55, Math.PI / 8, "#81dcf8", -1.6),
  ], []);
  const status = state === "analyzing" ? "AI 正在分析" : state === "completed" ? "分析已完成" : state === "failed" ? "分析失败" : "等待分析";
  return (
    <div className={styles.orbArea} data-ai-core="true" data-motion={paused ? "paused" : "running"} data-analysis-state={state}>
      <div aria-hidden="true" className={styles.coreAura} />
      <svg aria-hidden="true" className={styles.orbitsBack} viewBox="0 0 440 390" preserveAspectRatio="xMidYMid meet">
        {tracks.map((track, index) => (
          <g key={index}>
            <path d={track.behind} fill="none" stroke={track.color} strokeWidth="8" opacity=".10" filter={`url(#${id}-blur)`} />
            <path className={styles.orbitRay} d={track.behind} fill="none" stroke={track.color} strokeWidth={track.thickness} opacity=".48" style={{ animationDelay: `${track.delay}s` }} />
          </g>
        ))}
        <defs><filter id={`${id}-blur`}><feGaussianBlur stdDeviation="5" /></filter></defs>
      </svg>
      <div aria-hidden="true" className={styles.coreOuterRing} />
      <div className={styles.sphere}>
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
          <mask id={maskId}>
            <rect width="440" height="410" fill="white" />
            {/* A modest safety mask shields the central logo from crossing rails. */}
            <ellipse cx="220" cy="190" rx="104" ry="88" fill="black" />
          </mask>
          <filter id={`${id}-front-blur`}><feGaussianBlur stdDeviation="2.8" /></filter>
        </defs>
        <g mask={`url(#${maskId})`}>
          {tracks.map((track, index) => (
            <g key={index}>
              <path d={track.ahead} fill="none" stroke={track.color} strokeWidth="8" opacity=".17" filter={`url(#${id}-front-blur)`} />
              <path className={styles.orbitRay} d={track.ahead} fill="none" stroke={track.color} strokeWidth="1.8" opacity=".85" style={{ animationDelay: `${track.delay}s` }} />
              <path className={styles.orbitSpark} d={track.ahead} fill="none" stroke="#f7fdff" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 110 1 190" style={{ animationDelay: `${track.delay}s` }} />
            </g>
          ))}
        </g>
      </svg>
      <div aria-hidden="true" className={styles.orbPedestal}>
        <span className={styles.pedestalDisc} />
        <span className={styles.pedestalRing} />
        <span className={styles.pedestalRingSecondary} />
      </div>
      <div className={styles.orbStatus} role="status" aria-live="polite">
        <span className={styles.liveDot} />
        <strong>{status}</strong><span className={styles.orbStatusDivider}>·</span><span>{subtitle}</span>
      </div>
    </div>
  );
}
