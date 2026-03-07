"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

// Grain SVG as a data URL — feTurbulence at high frequency for fine noise
const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`;

export function LiquidBackground() {
  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);

  // Very gentle spring so the parallax is barely perceptible
  const springX = useSpring(rawX, { stiffness: 30, damping: 40, mass: 1.2 });
  const springY = useSpring(rawY, { stiffness: 30, damping: 40, mass: 1.2 });

  // Map 0→1 mouse position to -8→8px parallax shift
  const blobX = useTransform(springX, [0, 1], [-8, 8]);
  const blobY = useTransform(springY, [0, 1], [-8, 8]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rawX.set(e.clientX / window.innerWidth);
      rawY.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [rawX, rawY]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-50 overflow-hidden"
    >
      {/* Blob 1 — top-left, primary brand green */}
      <motion.div
        style={{
          x: blobX,
          y: blobY,
          filter: "blur(130px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.14, 1.03, 1],
          opacity: [0.05, 0.08, 0.06, 0.05],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.4, 0.7, 1],
        }}
        className="absolute -left-72 -top-72 h-[800px] w-[800px] rounded-full bg-[#2e7d4f]"
      />

      {/* Blob 2 — bottom-right, slightly warmer teal offset */}
      <motion.div
        style={{
          x: useTransform(blobX, (v) => -v),
          y: useTransform(blobY, (v) => -v),
          filter: "blur(150px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.08, 1.16, 1],
          opacity: [0.04, 0.065, 0.04, 0.04],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 5,
          times: [0, 0.35, 0.65, 1],
        }}
        className="absolute -bottom-72 -right-48 h-[700px] w-[700px] rounded-full bg-[#1a6640]"
      />

      {/* Blob 3 — centre, very faint ambient warmth */}
      <motion.div
        style={{ filter: "blur(180px)", willChange: "opacity" }}
        animate={{ opacity: [0.025, 0.045, 0.025] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2e7d4f]"
      />

      {/* Grain overlay — very subtle noise texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRAIN_SVG,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          opacity: 0.028,
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
}
