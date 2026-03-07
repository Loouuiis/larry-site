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

const initial = { opacity: 0, filter: "blur(10px)", scale: 0.99 };
const revealed = { opacity: 1, filter: "blur(0px)", scale: 1 };

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
