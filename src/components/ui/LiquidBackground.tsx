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
      {/* Blob 1 — top-left, soft purple */}
      <motion.div
        style={{
          x: blobX,
          y: blobY,
          filter: "blur(130px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.14, 1.03, 1],
          opacity: [0.38, 0.52, 0.42, 0.38],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.4, 0.7, 1],
        }}
        className="absolute -left-64 -top-64 h-[900px] w-[900px] rounded-full bg-[#c084fc]"
      />

      {/* Blob 2 — top-right, periwinkle blue */}
      <motion.div
        style={{
          x: useTransform(blobX, (v) => -v * 0.6),
          y: useTransform(blobY, (v) => v * 0.4),
          filter: "blur(140px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.1, 1.18, 1],
          opacity: [0.42, 0.55, 0.40, 0.42],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
          times: [0, 0.35, 0.65, 1],
        }}
        className="absolute -right-48 -top-48 h-[800px] w-[800px] rounded-full bg-[#818cf8]"
      />

      {/* Blob 3 — bottom-right, deeper blue */}
      <motion.div
        style={{
          x: useTransform(blobX, (v) => -v),
          y: useTransform(blobY, (v) => -v),
          filter: "blur(150px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.08, 1.16, 1],
          opacity: [0.32, 0.46, 0.34, 0.32],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 7,
          times: [0, 0.35, 0.65, 1],
        }}
        className="absolute -bottom-64 -right-32 h-[750px] w-[750px] rounded-full bg-[#60a5fa]"
      />

      {/* Blob 4 — centre-left, hot pink / fuchsia */}
      <motion.div
        style={{
          x: useTransform(blobX, (v) => v * 0.5),
          y: useTransform(blobY, (v) => -v * 0.3),
          filter: "blur(160px)",
          willChange: "transform, opacity",
        }}
        animate={{
          scale: [1, 1.12, 1.05, 1],
          opacity: [0.28, 0.42, 0.30, 0.28],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
          times: [0, 0.4, 0.7, 1],
        }}
        className="absolute left-1/4 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e879f9]"
      />

      {/* Blob 5 — centre, white glow for brightness like video */}
      <motion.div
        style={{ filter: "blur(120px)", willChange: "opacity" }}
        animate={{ opacity: [0.65, 0.85, 0.65] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
      />

      {/* Grain overlay — very subtle noise texture */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRAIN_SVG,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
          opacity: 0.022,
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
}
