"use client";

import { useMotionValue, useMotionTemplate, motion, type Transition, type TargetAndTransition } from "framer-motion";
import { useRef, type ReactNode, type CSSProperties } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  whileHover?: TargetAndTransition;
  transition?: Transition;
  /** Render as article element (semantic) */
  asArticle?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function GlassCard({
  children,
  className = "",
  style,
  whileHover,
  transition,
  asArticle = false,
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(30);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(((e.clientX - rect.left) / rect.width) * 100);
    mouseY.set(((e.clientY - rect.top) / rect.height) * 100);
  }

  function handleMouseLeave() {
    mouseX.set(50);
    mouseY.set(30);
  }

  const lightGradient = useMotionTemplate`radial-gradient(180px circle at ${mouseX}% ${mouseY}%, rgba(255,255,255,0.16), transparent 70%)`;

  const Tag = asArticle ? motion.article : motion.div;

  return (
    <Tag
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={whileHover ?? { y: -3, scale: 1.015 }}
      transition={transition ?? { duration: 0.22, ease: EASE }}
      className={["relative overflow-hidden rounded-2xl", className].join(" ")}
      style={style}
    >
      {/* Cursor-tracked specular highlight */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
        style={{ background: lightGradient }}
      />
      {children}
    </Tag>
  );
}
