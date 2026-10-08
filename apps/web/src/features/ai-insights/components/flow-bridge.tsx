"use client";

import { motion } from "motion/react";

export function FlowBridge({ active = false }: { active?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none relative hidden h-full min-h-[340px] items-center justify-center xl:flex">
      <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
      {[0, 0.45, 0.9].map((delay) => (
        <motion.span
          animate={{
            opacity: [0, 1, 0],
            x: ["-10px", "10px"],
          }}
          className="absolute size-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(47,124,246,0.7)]"
          key={delay}
          transition={{
            delay,
            duration: active ? 0.9 : 2.1,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      ))}
    </div>
  );
}
