"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface FadeUpProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** How far up from its resting position the element starts (px) */
  distance?: number;
  /** Duration in seconds */
  duration?: number;
}

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Wraps children in a scroll-triggered fade + upward reveal.
 * Fires once, uses physics-based easing — does not bounce or overshoot.
 */
export function FadeUp({
  children,
  className,
  delay = 0,
  distance = 40,
  duration = 0.7,
}: FadeUpProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration, delay, ease: PREMIUM_EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container that staggers its direct motion children.
 * Wrap with <StaggerContainer> and use <StaggerItem> inside.
 */
export function StaggerContainer({
  children,
  className,
  stagger = 0.09,
  delayStart = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayStart?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: stagger, delayChildren: delayStart },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Individual item inside a StaggerContainer.
 */
export function StaggerItem({
  children,
  className,
  distance = 24,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: distance },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: PREMIUM_EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
