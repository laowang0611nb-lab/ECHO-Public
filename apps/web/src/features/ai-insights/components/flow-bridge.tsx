"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type FlowBridgeState = "idle" | "analyzing" | "completed" | "failed";

const flowTiming: Record<FlowBridgeState, number> = {
  idle: 3.6,
  analyzing: 0.78,
  completed: 2.8,
  failed: 0,
};

const flowDotCount: Record<FlowBridgeState, number> = {
  idle: 2,
  analyzing: 5,
  completed: 2,
  failed: 0,
};

export function FlowBridge({
  state = "idle",
  direction = "forward",
  className,
}: {
  state?: FlowBridgeState;
  direction?: "forward" | "reverse";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const node = containerRef.current;
    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          ([entry]) => setInView(entry?.isIntersecting ?? true),
          { threshold: 0.05 },
        );

    const handleVisibility = () => setTabVisible(document.visibilityState !== "hidden");

    observer?.observe(node ?? document.body);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const running = !reducedMotion && inView && tabVisible && state !== "failed";
  const duration = flowTiming[state];
  const dotCount = flowDotCount[state];
  const directionStart = direction === "reverse" ? 14 : -14;
  const directionEnd = direction === "reverse" ? -14 : 14;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative hidden h-full min-h-[340px] items-center justify-center xl:flex",
        className,
      )}
      data-ai-flow-state={state}
      ref={containerRef}
    >
      <div
        className={cn(
          "absolute left-0 right-0 h-px",
          state === "failed"
            ? "bg-gradient-to-r from-transparent via-rose-300/45 to-transparent"
            : "bg-gradient-to-r from-transparent via-primary/45 to-transparent",
        )}
      />
      {running ? (
        <motion.span
          animate={{
            opacity: state === "analyzing" ? [0.18, 0.68, 0.18] : [0.08, 0.34, 0.08],
            x: [directionStart, directionEnd],
          }}
          className="absolute h-px w-20 bg-gradient-to-r from-transparent via-primary/70 to-transparent"
          transition={{
            duration: state === "analyzing" ? 0.78 : 3.6,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      ) : null}
      {Array.from({ length: running ? dotCount : 0 }).map((_, index) => (
        <motion.span
          animate={{
            opacity: [0, state === "analyzing" ? 1 : 0.72, 0],
            x: [directionStart, directionEnd],
          }}
          className={cn(
            "absolute size-1.5 rounded-full shadow-[0_0_10px_rgba(47,124,246,0.72)]",
            state === "analyzing" ? "bg-cyan-300" : "bg-primary",
          )}
          key={index}
          transition={{
            delay: index * (duration / Math.max(dotCount, 1)),
            duration,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      ))}
      {state === "failed" ? (
        <span className="absolute right-1 size-1.5 rounded-full bg-rose-400/70 shadow-[0_0_9px_rgba(244,63,94,0.45)]" />
      ) : null}
    </div>
  );
}
