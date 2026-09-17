"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

export function AnimatedNumber({
  value,
  suffix = "",
  decimals = 0,
}: {
  value: number | null;
  suffix?: string;
  decimals?: number;
}) {
  const motionValue = useMotionValue(0);
  const displayValue = useTransform(motionValue, (latest) => `${latest.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    if (value === null) {
      motionValue.set(0);
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.55, ease: "easeOut" });
    return () => controls.stop();
  }, [motionValue, value]);

  if (value === null) {
    return <span>暂无</span>;
  }

  return <motion.span>{displayValue}</motion.span>;
}
