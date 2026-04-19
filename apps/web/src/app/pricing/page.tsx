"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { LiquidBackground } from "@/components/ui/LiquidBackground";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function PricingPage() {
  const onIntro = useOverlayTrigger("intro");
  return (
    <>
      <LiquidBackground />
      <Navbar />
      <main className="relative min-h-screen flex items-center justify-center pt-32 pb-24">
        <div
          className="absolute inset-x-0 bottom-0 h-[40vh] pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 50% 110%, rgba(108,68,246,0.12) 0%, transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase"
          >
            Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="mt-4 font-bold text-[var(--text-1)]"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", letterSpacing: "-0.03em", lineHeight: 1.05 }}
          >
            Get pricing tailored to your needs.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="mt-6 text-base sm:text-lg text-[var(--text-2)] max-w-xl mx-auto"
          >
            Book an intro call and we&rsquo;ll walk you through it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
            className="mt-10"
          >
            <LiquidButton size="lg" onClick={onIntro}>
              Book an intro
            </LiquidButton>
          </motion.div>
        </div>
      </main>
      <Footer />
    </>
  );
}
