"use client";

import { motion } from "motion/react";

export function AnalysisConnectors({ analyzing }: { analyzing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden size-full xl:block"
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 1200 430"
    >
      {[
        "M 290 84 C 370 84, 390 168, 470 168",
        "M 290 154 C 370 154, 400 190, 470 190",
        "M 290 224 C 380 224, 400 210, 470 210",
        "M 290 294 C 380 294, 400 230, 470 230",
        "M 290 364 C 370 364, 390 252, 470 252",
        "M 730 168 C 810 168, 830 108, 910 108",
        "M 730 190 C 810 190, 830 180, 910 180",
        "M 730 210 C 810 210, 830 250, 910 250",
        "M 730 230 C 810 230, 830 322, 910 322",
      ].map((path, index) => (
        <motion.path
          animate={{ pathLength: 1, opacity: analyzing ? 1 : 0.45 }}
          d={path}
          initial={{ pathLength: 0.15, opacity: 0.25 }}
          key={path}
          stroke="var(--primary)"
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeWidth="1.4"
          transition={{ delay: index * 0.04, duration: analyzing ? 0.6 : 0.3 }}
        />
      ))}
    </svg>
  );
}
