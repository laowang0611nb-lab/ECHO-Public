"use client";

import { useEffect, useRef } from "react";

export const HEX_BACKGROUND_CONFIG = {
  hexSize: 78,
  baseOpacity: 0.2,
  activeCellCount: 9,
  pulseDuration: 2800,
  glowRadius: 18,
  mouseInteraction: true,
  animationEnabled: true,
} as const;

type ActiveColor = "#3196F3" | "#5DB7FF" | "#7872F2";

interface HexCell {
  col: number;
  row: number;
  x: number;
  y: number;
  index: number;
  glowColor: ActiveColor;
}

interface Pulse {
  cellIndex: number;
  color: ActiveColor;
  startedAt: number;
  duration: number;
}

const ACTIVE_COLORS: ActiveColor[] = ["#3196F3", "#5DB7FF", "#7872F2"];
const GRID_BLUE = "80, 155, 235";
const GRID_VIOLET = "120, 114, 242";
const SQRT_THREE = Math.sqrt(3);

function createHexPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }
  context.closePath();
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function smoothPulse(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.sin(Math.PI * clamped) ** 1.35;
}

function pickActiveColor() {
  return ACTIVE_COLORS[Math.floor(Math.random() * ACTIVE_COLORS.length)] ?? "#3196F3";
}

function createPulse(cellCount: number, now: number, seedProgress = false): Pulse {
  const duration = randomBetween(
    HEX_BACKGROUND_CONFIG.pulseDuration * 0.72,
    HEX_BACKGROUND_CONFIG.pulseDuration * 1.5,
  );
  return {
    cellIndex: Math.floor(Math.random() * cellCount),
    color: pickActiveColor(),
    startedAt: seedProgress ? now - Math.random() * duration : now + randomBetween(200, 1600),
    duration,
  };
}

function buildGrid(width: number, height: number) {
  const radius = HEX_BACKGROUND_CONFIG.hexSize;
  const horizontalSpacing = radius * 1.5;
  const verticalSpacing = SQRT_THREE * radius;
  const columns = Math.ceil(width / horizontalSpacing) + 4;
  const rows = Math.ceil(height / verticalSpacing) + 4;
  const originX = -horizontalSpacing * 2;
  const originY = -verticalSpacing * 2;
  const cells: HexCell[] = [];
  const cellByPosition = new Map<string, HexCell>();

  for (let col = 0; col < columns; col += 1) {
    const x = originX + col * horizontalSpacing;
    const rowOffset = col % 2 === 0 ? 0 : verticalSpacing / 2;
    for (let row = 0; row < rows; row += 1) {
      const y = originY + row * verticalSpacing + rowOffset;
      const colorSeed = Math.abs(Math.sin(col * 19.19 + row * 7.37));
      const cell: HexCell = {
        col,
        row,
        x,
        y,
        index: cells.length,
        glowColor: colorSeed > 0.91 ? "#7872F2" : colorSeed > 0.76 ? "#5DB7FF" : "#3196F3",
      };
      cells.push(cell);
      cellByPosition.set(`${col}:${row}`, cell);
    }
  }

  return { cells, cellByPosition };
}

function drawBaseGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cells: HexCell[],
) {
  const radius = HEX_BACKGROUND_CONFIG.hexSize;
  const backgroundGradient = context.createRadialGradient(
    width * 0.5,
    height * 0.44,
    0,
    width * 0.5,
    height * 0.44,
    Math.max(width, height) * 0.72,
  );
  backgroundGradient.addColorStop(0, "rgba(225, 241, 255, 0.88)");
  backgroundGradient.addColorStop(0.72, "rgba(255, 255, 255, 0.98)");
  backgroundGradient.addColorStop(1, "#FFFFFF");
  context.fillStyle = backgroundGradient;
  context.fillRect(0, 0, width, height);

  context.lineJoin = "round";
  context.lineCap = "round";
  for (const cell of cells) {
    const violet = cell.glowColor === "#7872F2";
    const alpha = HEX_BACKGROUND_CONFIG.baseOpacity * (violet ? 0.48 : 0.64);
    context.strokeStyle = `rgba(${violet ? GRID_VIOLET : GRID_BLUE}, ${alpha})`;
    context.lineWidth = violet ? 0.82 : 0.92;
    createHexPath(context, cell.x, cell.y, radius);
    context.stroke();
  }
}

function drawPulseCell(
  context: CanvasRenderingContext2D,
  cell: HexCell,
  color: ActiveColor,
  intensity: number,
) {
  if (intensity <= 0.015) return;
  const radius = HEX_BACKGROUND_CONFIG.hexSize;
  const violet = color === "#7872F2";
  const rgb = violet ? "120, 114, 242" : color === "#5DB7FF" ? "93, 183, 255" : "49, 150, 243";
  context.save();
  context.shadowBlur = HEX_BACKGROUND_CONFIG.glowRadius + intensity * 19;
  context.shadowColor = `rgba(${rgb}, ${(violet ? 0.28 : 0.35) * intensity})`;
  context.strokeStyle = `rgba(${rgb}, ${Math.min(0.92, 0.38 + intensity * 0.62)})`;
  context.lineWidth = 1.05 + intensity * 1.15;
  createHexPath(context, cell.x, cell.y, radius);
  context.stroke();
  context.restore();
}

function drawAnimatedGlow(
  context: CanvasRenderingContext2D,
  cells: HexCell[],
  cellByPosition: Map<string, HexCell>,
  pulses: Pulse[],
  now: number,
  mouse: { x: number; y: number; active: boolean },
) {
  const radius = HEX_BACKGROUND_CONFIG.hexSize;
  const intensityByIndex = new Map<number, { color: ActiveColor; intensity: number }>();

  for (const pulse of pulses) {
    if (now < pulse.startedAt) continue;
    const progress = (now - pulse.startedAt) / pulse.duration;
    if (progress >= 1) continue;
    const center = cells[pulse.cellIndex];
    if (!center) continue;
    const baseIntensity = smoothPulse(progress);

    for (let colOffset = -3; colOffset <= 3; colOffset += 1) {
      for (let rowOffset = -3; rowOffset <= 3; rowOffset += 1) {
        const cell = cellByPosition.get(`${center.col + colOffset}:${center.row + rowOffset}`);
        if (!cell) continue;
        const distance = Math.hypot(cell.x - center.x, cell.y - center.y);
        const ringIntensity =
          distance < radius * 0.5 ? 1 : distance < radius * 2 ? 0.42 : distance < radius * 3.15 ? 0.15 : 0;
        if (!ringIntensity) continue;
        const current = intensityByIndex.get(cell.index);
        const intensity = baseIntensity * ringIntensity;
        if (!current || intensity > current.intensity) {
          intensityByIndex.set(cell.index, { color: pulse.color, intensity });
        }
      }
    }
  }

  for (const cell of cells) {
    let glow = intensityByIndex.get(cell.index);
    if (HEX_BACKGROUND_CONFIG.mouseInteraction && mouse.active) {
      const distance = Math.hypot(cell.x - mouse.x, cell.y - mouse.y);
      const mouseIntensity = distance < 170 ? (1 - distance / 170) ** 2 * 0.18 : 0;
      if (mouseIntensity > (glow?.intensity ?? 0)) {
        glow = { color: cell.glowColor, intensity: mouseIntensity };
      }
    }
    if (glow) {
      drawPulseCell(context, cell, glow.color, glow.intensity);
    }
  }
}

export function HexagonBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const mouse = { x: -1000, y: -1000, active: false };
    const baseCanvas = document.createElement("canvas");
    const baseContext = baseCanvas.getContext("2d");
    let cells: HexCell[] = [];
    let cellByPosition = new Map<string, HexCell>();
    let pulses: Pulse[] = [];
    let targetPulseCount: number = HEX_BACKGROUND_CONFIG.activeCellCount;
    let animationFrame = 0;
    let lastFrame = 0;
    let stopped = false;

    const renderBase = () => {
      if (!baseContext) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      baseCanvas.width = canvas.width;
      baseCanvas.height = canvas.height;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grid = buildGrid(width, height);
      cells = grid.cells;
      cellByPosition = grid.cellByPosition;
      targetPulseCount = Math.min(
        HEX_BACKGROUND_CONFIG.activeCellCount,
        Math.max(3, Math.floor(cells.length * 0.05)),
      );
      pulses = Array.from({ length: targetPulseCount }, () =>
        createPulse(cells.length, performance.now(), true),
      );
      drawBaseGrid(baseContext, width, height, cells);
      context.clearRect(0, 0, width, height);
      context.drawImage(baseCanvas, 0, 0, baseCanvas.width, baseCanvas.height, 0, 0, width, height);
    };

    const renderFrame = (now: number) => {
      if (stopped) return;
      if (motionPreference.matches || !HEX_BACKGROUND_CONFIG.animationEnabled) {
        return;
      }

      const frameInterval = HEX_BACKGROUND_CONFIG.mouseInteraction ? 1000 / 45 : 1000 / 30;
      if (now - lastFrame >= frameInterval) {
        lastFrame = now;
        pulses = pulses.filter((pulse) => now - pulse.startedAt < pulse.duration);
        while (pulses.length < targetPulseCount) {
          pulses.push(createPulse(cells.length, now));
        }
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
        context.drawImage(
          baseCanvas,
          0,
          0,
          baseCanvas.width,
          baseCanvas.height,
          0,
          0,
          window.innerWidth,
          window.innerHeight,
        );
        drawAnimatedGlow(context, cells, cellByPosition, pulses, now, mouse);
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const startAnimation = () => {
      if (stopped || motionPreference.matches || !HEX_BACKGROUND_CONFIG.animationEnabled) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const stopAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stopAnimation();
      else startAnimation();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!HEX_BACKGROUND_CONFIG.mouseInteraction || !finePointer.matches) return;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      mouse.active = true;
    };

    const handlePointerLeave = (event: PointerEvent) => {
      if (!event.relatedTarget) mouse.active = false;
    };

    const handleResize = () => {
      renderBase();
      if (!motionPreference.matches && HEX_BACKGROUND_CONFIG.animationEnabled) startAnimation();
    };

    const handleMotionPreference = () => {
      stopAnimation();
      renderBase();
      if (!motionPreference.matches) startAnimation();
    };

    renderBase();
    startAnimation();
    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerout", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionPreference);

    return () => {
      stopped = true;
      stopAnimation();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionPreference.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(circle_at_50%_45%,rgba(225,241,255,0.86),rgba(255,255,255,0.98)_72%)]"
    >
      <canvas className="block size-full" ref={canvasRef} />
    </div>
  );
}
