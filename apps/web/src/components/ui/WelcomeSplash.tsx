"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

// Duration of the hold before the fade begins automatically (ms)
const HOLD_MS = 2_000;
// Duration of the fade-out animation (seconds)
const FADE_S = 1;

/**
 * WelcomeSplash
 *
 * Behaviour:
 *   1. Renders fully opaque (opacity: 1) and holds for HOLD_MS.
 *   2. A click anywhere on the overlay triggers the fade immediately.
 *   3. After HOLD_MS with no click, the fade starts automatically.
 *   4. The 3-second linear fade runs to opacity 0, then the element unmounts.
 *
 * Implementation:
 *   `fading` is the single trigger. False = hold; true = fade.
 *   Framer Motion watches `fading` — when it flips, `animate` changes from
 *   opacity:1 to opacity:0 and the animation begins.
 *   `onAnimationComplete` is guarded by `fading` to prevent premature unmount
 *   (Framer Motion calls it even when the initial "hold" pose resolves).
 */
export function WelcomeSplash() {
  const [fading, setFading] = useState(false);
  const [done, setDone]     = useState(false);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setFading(true), HOLD_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = () => {
    if (fading) return; // already fading — ignore
    if (timerRef.current) clearTimeout(timerRef.current);
    setFading(true);
  };

  if (done) return null;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: FADE_S, ease: [0.4, 0, 0.9, 1] }}
      onAnimationComplete={() => {
        // Guard: only unmount after the fade-out, not after the initial hold
        if (fading) setDone(true);
      }}
      onClick={dismiss}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          color: "#8b5cf6",
          fontSize: "clamp(1.75rem, 4vw, 3.5rem)",
          fontWeight: 300,
          letterSpacing: "0.45em",
          textTransform: "lowercase",
          fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
          userSelect: "none",
        }}
      >
        Larry
      </span>
    </motion.div>
  );
}
