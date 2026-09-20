"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

export const pageContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const pageItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

export function PageMotion({ children }: { children: ReactNode }) {
  return (
    <motion.div animate="show" initial="hidden" variants={pageContainerVariants}>
      <motion.div variants={pageItemVariants}>{children}</motion.div>
    </motion.div>
  );
}
