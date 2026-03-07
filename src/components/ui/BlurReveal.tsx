"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface BlurRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /**
   * true  → scroll-triggered (whileInView)
   * false → immediate on mount (animate)
   */
  scrollTriggered?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// No blur filter — filter animations are not GPU-composited on mobile Safari
// and cause full repaint cycles, leading to jank and crashes on low-end devices.
// opacity + y is sufficient and runs entirely on the compositor thread.
const initial = { opacity: 0, y: 16 };
const revealed = { opacity: 1, y: 0 };

export function BlurReveal({
  children,
  className = "",
  delay = 0,
  scrollTriggered = false,
}: BlurRevealProps) {
  const transition = { duration: 0.85, delay, ease: EASE };

  if (scrollTriggered) {
    return (
      <motion.div
        initial={initial}
        whileInView={revealed}
        viewport={{ once: true, margin: "-80px" }}
        transition={transition}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={initial}
      animate={revealed}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
