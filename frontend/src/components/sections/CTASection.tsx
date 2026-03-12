"use client";

import { motion } from "framer-motion";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { Button } from "@/components/ui/Button";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CTASection() {
  const openWaitlist = useOverlayTrigger("waitlist");
  const openFounders = useOverlayTrigger("founders");

  return (
    <section id="pricing" className="relative overflow-hidden border-t border-neutral-900 bg-neutral-950 py-14 sm:py-28">
      {/* Brand radial — restrained, just enough warmth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 50% 45% at 50% 110%, rgba(139,92,246,0.14) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        {/* Headline leads */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.72, ease: EASE }}
          className="mb-4 text-2xl font-bold text-white sm:mb-5 sm:text-4xl md:text-5xl lg:text-[3.5rem]"
        >
          Stop <em>Managing</em> Work.
          <br />
          Start Delivering It.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
          className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-neutral-400 sm:mb-10 sm:text-base"
        >
          Let AI handle coordination — so your team can focus on building,
          shipping, and delivering.
        </motion.p>

        {/* CTAs — stacked full-width on mobile, row on sm+ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
          className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center sm:justify-center"
        >
          <div className="text-center">
            {/* White-outlined primary on dark background */}
            <LiquidButton
              size="lg"
              className="w-full border-white text-white hover:bg-white hover:text-neutral-950 sm:w-auto"
              onClick={openWaitlist}
            >
              Join the Waitlist
            </LiquidButton>
            <p className="mt-2 text-[11px] text-neutral-600">
              Early access · Priority onboarding · Direct input into roadmap
            </p>
          </div>

          <div className="text-center">
            <Button
              size="lg"
              variant="ghost"
              className="w-full border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors duration-200 sm:w-auto"
              onClick={openFounders}
            >
              Speak to the Founders
            </Button>
            <p className="mt-2 text-[11px] text-neutral-600">
              Explore a structured pilot for your team
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
