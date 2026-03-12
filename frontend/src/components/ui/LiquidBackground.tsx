"use client";

import { motion } from "framer-motion";

export function LiquidBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-50 overflow-hidden bg-white"
    >
      {/* Blob 1 — purple, drifts top-left → centre-right */}
      <motion.div
        style={{ filter: "blur(120px)", willChange: "transform" }}
        animate={{
          x: ["-10%", "15%", "5%", "-10%"],
          y: ["-15%", "5%", "20%", "-15%"],
        }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-32 -top-32 h-[700px] w-[700px] rounded-full bg-[#c084fc] opacity-[0.18]"
      />

      {/* Blob 2 — blue, drifts top-right → centre */}
      <motion.div
        style={{ filter: "blur(130px)", willChange: "transform" }}
        animate={{
          x: ["5%", "-20%", "-5%", "5%"],
          y: ["-10%", "10%", "25%", "-10%"],
        }}
        transition={{ duration: 38, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        className="absolute -right-32 -top-32 h-[650px] w-[650px] rounded-full bg-[#818cf8] opacity-[0.16]"
      />

      {/* Blob 3 — fuchsia, drifts centre → bottom-left */}
      <motion.div
        style={{ filter: "blur(140px)", willChange: "transform" }}
        animate={{
          x: ["0%", "20%", "-10%", "0%"],
          y: ["0%", "15%", "-10%", "0%"],
        }}
        transition={{ duration: 42, repeat: Infinity, ease: "easeInOut", delay: 10 }}
        className="absolute left-1/3 top-1/4 h-[550px] w-[550px] rounded-full bg-[#e879f9] opacity-[0.13]"
      />

      {/* Blob 4 — sky blue, drifts bottom-right */}
      <motion.div
        style={{ filter: "blur(150px)", willChange: "transform" }}
        animate={{
          x: ["0%", "-15%", "10%", "0%"],
          y: ["0%", "-20%", "10%", "0%"],
        }}
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut", delay: 18 }}
        className="absolute -bottom-48 -right-24 h-[600px] w-[600px] rounded-full bg-[#60a5fa] opacity-[0.14]"
      />
    </div>
  );
}
