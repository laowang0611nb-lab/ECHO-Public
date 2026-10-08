"use client";

import { Plasma } from "@/components/backgrounds/plasma";

export function WorkspacePlasmaBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#f6f9ff]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.94),rgba(239,247,255,0.88)_42%,rgba(246,249,255,1)_100%)]" />
      <div className="absolute inset-0">
        <Plasma
          color="#054bce"
          direction="forward"
          iterations={48}
          lightMode
          maxDpr={1.25}
          mouseInteractive={false}
          opacity={0.58}
          renderScale={0.5}
          scale={1.1}
          speed={0.6}
          targetFps={30}
        />
      </div>
    </div>
  );
}
