"use client";

import { Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

import styles from "./plasma.module.css";

type PlasmaDirection = "forward" | "reverse" | "pingpong";

interface PlasmaProps {
  color?: string;
  speed?: number;
  direction?: PlasmaDirection;
  scale?: number;
  opacity?: number;
  mouseInteractive?: boolean;
  renderScale?: number;
  maxDpr?: number;
  targetFps?: number;
  iterations?: number;
  lightMode?: boolean;
}

interface NumericUniform {
  value: number;
}

interface VectorUniform {
  value: Float32Array;
}

const ORIGINAL_QUALITY = 60;

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 position;
in vec2 uv;
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 0.5, 0.2];
  return [
    Number.parseInt(result[1], 16) / 255,
    Number.parseInt(result[2], 16) / 255,
    Number.parseInt(result[3], 16) / 255,
  ];
}

function buildFragmentShader() {
  return `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
uniform float uQuality;
uniform float uStepScale;
uniform float uLightMode;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;

  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);

  float i = 0.0;
  float d = 0.0;
  float z = 0.0;
  float T = iTime * uSpeed * uDirection;
  vec3 O = vec3(0.0);
  vec3 p = vec3(0.0);
  vec3 S = vec3(0.0);

  for (vec2 r = iResolution.xy, Q; i < 60.0; O += o.w / max(d, 8e-4) * o.xyz) {
    i += 1.0;
    p = z * normalize(vec3(C - 0.5 * r, r.y));
    p.z -= 4.0;
    S = p;
    d = p.y - T;

    p.x += 0.4 * (1.0 + p.y) * sin(d + p.x * 0.1) * cos(0.34 * d + p.x * 0.05);
    Q = p.xz *= mat2(cos(p.y + vec4(0.0, 11.0, 33.0, 0.0) - T));
    z += d = (abs(sqrt(length(Q * Q)) - 0.25 * (5.0 + S.y)) / 3.0 + 8e-4) * uStepScale;
    o = 1.0 + sin(S.y + p.z * 0.5 + S.z - length(S - p) + vec4(2.0, 1.0, 0.0, 8.0));
    if (i >= uQuality) break;
  }

  o.xyz = tanh(O / 1e4);
}

bool finite1(float x) {
  return !(isnan(x) || isinf(x));
}

vec3 sanitize(vec3 color) {
  return vec3(
    finite1(color.r) ? color.r : 0.0,
    finite1(color.g) ? color.g : 0.0,
    finite1(color.b) ? color.b : 0.0
  );
}

void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = sanitize(o.rgb);

  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 customColor = intensity * uCustomColor;
  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));

  float alpha = length(rgb) * uOpacity;
  if (uLightMode > 0.5) {
    vec3 source = clamp(finalColor, 0.0, 1.0);
    float peak = max(source.r, max(source.g, source.b));
    float floorColor = min(source.r, min(source.g, source.b));
    vec3 chroma = (source - vec3(floorColor)) / max(peak - floorColor, 0.0001);
    vec3 pigment = mix(source / max(peak, 0.0001), chroma, 0.68) * 0.72;
    float energy = clamp(length(rgb) / 1.7320508, 0.0, 1.0);
    float coverage = pow(smoothstep(0.035, 0.72, energy), 0.76) * min(uOpacity, 1.0) * 0.9;
    fragColor = vec4(mix(vec3(1.0), pigment, coverage), 1.0);
  } else {
    fragColor = vec4(finalColor, alpha);
  }
}
`;
}

export function Plasma({
  color = "#ffffff",
  speed = 1,
  direction = "forward",
  scale = 1,
  opacity = 1,
  mouseInteractive = true,
  renderScale = 0.55,
  maxDpr = 1.5,
  targetFps = 60,
  iterations = ORIGINAL_QUALITY,
  lightMode = false,
}: PlasmaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersReducedMotion = motionQuery.matches;
    const useCustomColor = color ? 1 : 0;
    const customColor = color ? hexToRgb(color) : [1, 1, 1];
    const directionMultiplier = direction === "reverse" ? -1 : 1;
    const canvas = document.createElement("canvas");
    const resizeScale = Math.max(0.2, Math.min(1, renderScale));
    const frameInterval = 1000 / Math.max(1, targetFps);
    let renderer: Renderer | null = null;
    let program: Program | null = null;
    let geometry: Triangle | null = null;
    let mesh: Mesh | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let resizeFrame = 0;
    let animationFrame = 0;
    let stopped = false;
    let contextLost = false;
    let isVisible = true;
    let tabVisible = document.visibilityState !== "hidden";
    let lastFrameTime = 0;
    let startedAt = 0;

    const dispose = () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      program?.remove();
      geometry?.remove();
      canvas.remove();
      renderer = null;
      program = null;
      geometry = null;
      mesh = null;
    };

    try {
      renderer = new Renderer({
        canvas,
        webgl: 2,
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
      });
    } catch {
      return;
    }

    if (!renderer.gl || !renderer.isWebgl2) {
      dispose();
      return;
    }

    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.background = "plasma";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    try {
      geometry = new Triangle(renderer.gl);
      program = new Program(renderer.gl, {
        vertex: VERTEX_SHADER,
        fragment: buildFragmentShader(),
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new Float32Array([1, 1]) },
          uCustomColor: { value: new Float32Array(customColor) },
          uUseCustomColor: { value: useCustomColor },
          uSpeed: { value: speed * 0.4 },
          uDirection: { value: directionMultiplier },
          uScale: { value: Math.max(0.1, scale) },
          uOpacity: { value: Math.max(0, Math.min(1, opacity)) },
          uMouse: { value: new Float32Array([0, 0]) },
          uMouseInteractive: { value: mouseInteractive ? 1 : 0 },
          uQuality: { value: Math.max(1, iterations) },
          uStepScale: { value: ORIGINAL_QUALITY / Math.max(1, iterations) },
          uLightMode: { value: lightMode ? 1 : 0 },
        },
      });
      mesh = new Mesh(renderer.gl, { geometry, program });
    } catch {
      dispose();
      return;
    }

    const setSize = () => {
      if (!renderer || !program) return;
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * resizeScale));
      const height = Math.max(1, Math.floor(rect.height * resizeScale));
      renderer.setSize(width, height);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const resolution = program.uniforms.iResolution as VectorUniform;
      resolution.value[0] = renderer.gl.drawingBufferWidth;
      resolution.value[1] = renderer.gl.drawingBufferHeight;
    };

    const render = () => {
      if (!renderer || !mesh || contextLost || stopped) return;
      try {
        renderer.render({ scene: mesh });
      } catch {
        contextLost = true;
        window.cancelAnimationFrame(animationFrame);
      }
    };

    const renderStaticFrame = () => {
      if (!program) return;
      const time = program.uniforms.iTime as NumericUniform;
      time.value = 0;
      render();
    };

    const loop = (time: number) => {
      if (stopped || contextLost || !isVisible || !tabVisible || motionQuery.matches) return;
      if (time - lastFrameTime < frameInterval) {
        animationFrame = window.requestAnimationFrame(loop);
        return;
      }
      lastFrameTime = time;
      if (!program) return;

      const timeUniform = program.uniforms.iTime as NumericUniform;
      if (direction === "pingpong") {
        const pingpongDuration = 10;
        const segmentTime = (time - startedAt) * 0.001 % pingpongDuration;
        const isForward = Math.floor((time - startedAt) * 0.001 / pingpongDuration) % 2 === 0;
        const progress = segmentTime / pingpongDuration;
        const smooth = progress * progress * (3 - 2 * progress);
        const pingpongTime = isForward
          ? smooth * pingpongDuration
          : (1 - smooth) * pingpongDuration;
        timeUniform.value = pingpongTime;
        const directionUniform = program.uniforms.uDirection as NumericUniform;
        directionUniform.value = 1;
      } else {
        timeUniform.value = (time - startedAt) * 0.001;
      }

      render();
      animationFrame = window.requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (stopped || contextLost || !isVisible || !tabVisible || motionQuery.matches) return;
      window.cancelAnimationFrame(animationFrame);
      lastFrameTime = 0;
      animationFrame = window.requestAnimationFrame(loop);
    };

    function handleVisibilityChange() {
      tabVisible = document.visibilityState !== "hidden";
      if (tabVisible) startLoop();
      else window.cancelAnimationFrame(animationFrame);
    }

    function handleContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      window.cancelAnimationFrame(animationFrame);
    }

    function handleContextRestored() {
      contextLost = false;
      if (motionQuery.matches) renderStaticFrame();
      else startLoop();
    }

    function handleMotionPreference() {
      window.cancelAnimationFrame(animationFrame);
      if (motionQuery.matches) renderStaticFrame();
      else startLoop();
    }

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", handleMotionPreference);

    resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        setSize();
        if (motionQuery.matches) renderStaticFrame();
      });
    });
    resizeObserver.observe(container);
    setSize();

    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          const wasVisible = isVisible;
          isVisible = entry?.isIntersecting ?? true;
          if (isVisible && !wasVisible) startLoop();
        },
        { threshold: 0 },
      );
      intersectionObserver.observe(container);
    }

    startedAt = performance.now();
    if (prefersReducedMotion) {
      renderStaticFrame();
    } else {
      startLoop();
    }

    return () => {
      motionQuery.removeEventListener("change", handleMotionPreference);
      dispose();
    };
  }, [
    color,
    direction,
    iterations,
    lightMode,
    maxDpr,
    mouseInteractive,
    opacity,
    renderScale,
    scale,
    speed,
    targetFps,
  ]);

  return <div className={styles.plasma} ref={containerRef} />;
}

export default Plasma;
