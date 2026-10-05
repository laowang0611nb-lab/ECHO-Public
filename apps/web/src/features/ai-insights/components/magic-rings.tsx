"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import styles from "./magic-rings.module.css";

export type MagicRingsState = "idle" | "hover" | "processing";

type MagicRingsProps = {
  state: MagicRingsState;
  className?: string;
};

const COLOR_ONE = "#2F80FF";
const COLOR_TWO = "#62D4FF";
const BASE_SPEED = 0.24;
const PROCESSING_SPEED = 0.54;
const HOVER_SPEED = 0.32;
const BASE_OPACITY = 0.27;
const PROCESSING_OPACITY = 0.35;
const HOVER_OPACITY = 0.31;
const LINE_THICKNESS = 1.2;
const BASE_RADIUS = 0.28;
const RADIUS_STEP = 0.095;
const SCALE_RATE = 0.045;
const ATTENUATION = 15;
const RING_GAP = 1.42;
const NOISE_AMOUNT = 0.008;
const MAX_DPR = 2;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function mixColor(from: string, to: string, amount: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const mix = (left: number, right: number) => Math.round(left + (right - left) * amount);
  return `rgb(${mix(start.r, end.r)}, ${mix(start.g, end.g)}, ${mix(start.b, end.b)})`;
}

export function MagicRings({ state, className }: MagicRingsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (reducedMotion) return;
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const drawingContext = canvasElement.getContext("2d");
    if (!drawingContext) return;
    const canvas = canvasElement;
    const context = drawingContext;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();
    let inView = true;
    let currentSpeed = BASE_SPEED;
    let currentOpacity = BASE_OPACITY;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => resizeCanvas());
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          inView = entry?.isIntersecting ?? true;
          if (inView) start();
        }, { threshold: 0.05 });

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function start() {
      if (frame) cancelAnimationFrame(frame);
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    }

    function draw(time: number) {
      frame = 0;
      if (!inView || document.visibilityState === "hidden") return;

      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      context.clearRect(0, 0, width, height);

      const currentState = stateRef.current;
      const targetSpeed =
        currentState === "processing"
          ? PROCESSING_SPEED
          : currentState === "hover"
            ? HOVER_SPEED
            : BASE_SPEED;
      const targetOpacity =
        currentState === "processing"
          ? PROCESSING_OPACITY
          : currentState === "hover"
            ? HOVER_OPACITY
            : BASE_OPACITY;
      currentSpeed += (targetSpeed - currentSpeed) * Math.min(1, delta * 6);
      currentOpacity += (targetOpacity - currentOpacity) * Math.min(1, delta * 6);

      const ringCount = window.innerWidth < 768 ? 3 : window.innerWidth < 1200 ? 4 : 5;
      const minDimension = Math.min(width, height);
      const maxRadius = minDimension * 0.46;
      const totalWeight = BASE_RADIUS + (ringCount - 1) * RADIUS_STEP * RING_GAP;
      const radiusScale = maxRadius / totalWeight;
      const rotation = (time / 1000) * currentSpeed;

      for (let index = 0; index < ringCount; index += 1) {
        const normalizedRadius = (BASE_RADIUS + index * RADIUS_STEP * RING_GAP) * radiusScale;
        const wave = Math.sin(rotation * Math.PI * 2 + index * 0.74) * minDimension * SCALE_RATE * 0.22;
        const radius = Math.max(8, normalizedRadius + wave);
        const ringOpacity = currentOpacity * Math.exp(-index / (ATTENUATION * 0.5));
        const color = mixColor(COLOR_ONE, COLOR_TWO, index / Math.max(1, ringCount - 1));
        const lineWidth = LINE_THICKNESS + Math.sin(rotation * 0.8 + index) * NOISE_AMOUNT;

        context.beginPath();
        context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
        context.strokeStyle = color;
        context.globalAlpha = ringOpacity;
        context.lineWidth = lineWidth;
        context.stroke();

        const highlightStart = rotation * (0.72 + index * 0.08) + index * 0.9;
        context.beginPath();
        context.arc(width / 2, height / 2, radius, highlightStart, highlightStart + Math.PI * 0.42);
        context.strokeStyle = mixColor(COLOR_ONE, COLOR_TWO, (index + 1) / ringCount);
        context.globalAlpha = Math.min(0.42, ringOpacity * 1.85);
        context.lineWidth = LINE_THICKNESS + 0.2;
        context.lineCap = "round";
        context.stroke();
      }

      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else {
        start();
      }
    }

    resizeCanvas();
    resizeObserver?.observe(canvas);
    intersectionObserver?.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibility);
    start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className={cn(styles.staticRings, className)}>
        <span className={styles.staticRingOne} />
        <span className={styles.staticRingTwo} />
        <span className={styles.staticRingThree} />
      </div>
    );
  }

  return <canvas aria-hidden="true" className={cn(styles.canvas, className)} ref={canvasRef} />;
}
