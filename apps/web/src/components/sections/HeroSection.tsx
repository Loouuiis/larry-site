"use client";

import { motion } from "framer-motion";
import { BlurReveal } from "@/components/ui/BlurReveal";
import { Button } from "@/components/ui/Button";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { ExecutionTimeline } from "@/components/ui/ExecutionTimeline";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.72;

export function HeroSection() {
  const onWaitlist = useOverlayTrigger("waitlist");
  const onIntro = useOverlayTrigger("intro");

  return (
    <section className="relative pt-20 sm:pt-32">
      {/* Ambient radial wash — preserved from existing design */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 hero-gradient-drift"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(139,92,246,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        {/* Eyebrow badge */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, ease: EASE }}
          className="inline-block rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-disabled)] uppercase text-[11px] tracking-[0.1em] px-3 py-1 mb-8"
        >
          AI-Powered Autonomous Execution
        </motion.span>

        {/* Headline with strokeDraw on "Run" */}
        <BlurReveal delay={0}>
          <h1
            className="font-extrabold text-[var(--text-1)]"
            style={{
              fontSize: "clamp(2.5rem, 8vw, 5rem)",
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
            }}
          >
            Making Projects{" "}
            <span className="stroke-draw">Run</span>{" "}
            Themselves.
          </h1>
        </BlurReveal>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, delay: 0.1, ease: EASE }}
          className="mt-6 max-w-2xl mx-auto text-[var(--text-2)] text-base sm:text-lg"
        >
          Larry connects to your existing tools and owns the execution layer —
          follow-ups, escalations, and status updates happen automatically.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, delay: 0.2, ease: EASE }}
          className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4"
        >
          <LiquidButton size="lg" onClick={onWaitlist}>
            Join the Waitlist
          </LiquidButton>
          <Button variant="secondary" size="lg" onClick={onIntro}>
            Book an intro
          </Button>
        </motion.div>
      </div>

      {/* Execution timeline — hero centerpiece */}
      <div className="mt-16 sm:mt-20 px-4 sm:px-6">
        <ExecutionTimeline />
      </div>

      {/* Warm fade into next section */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 -z-10 bg-gradient-to-t from-[#F8F7FF] to-transparent"
      />
    </section>
  );
}
