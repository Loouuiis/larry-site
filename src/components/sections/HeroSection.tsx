"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { AmbientFeed } from "@/components/ui/AmbientFeed";
import { BlurReveal } from "@/components/ui/BlurReveal";
import { useOverlayTrigger } from "@/components/ui/LiquidOverlay";

// Physics-based easing — weighted, deliberate, not springy
const EASE = [0.22, 1, 0.36, 1] as const;

const heroItem = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.72, delay, ease: EASE },
});

const MOCK_TASKS = [
  { id: 1, title: "Finalise Q3 deliverables with client", assignee: "SR", status: "overdue" },
  { id: 2, title: "Engineering sign-off on API spec",     assignee: "TK", status: "pending" },
  { id: 3, title: "Update project tracker post-standup",  assignee: "ME", status: "done"    },
  { id: 4, title: "Chase budget approval from Finance",   assignee: "LP", status: "pending" },
];

const STATUS_PILL: Record<string, string> = {
  overdue: "bg-red-50 text-red-500 border border-red-100",
  pending: "bg-amber-50 text-amber-600 border border-amber-100",
  done:    "bg-emerald-50 text-emerald-600 border border-emerald-100",
};
const STATUS_LABEL: Record<string, string> = {
  overdue: "Overdue",
  pending: "Pending",
  done:    "Done",
};

export function HeroSection() {
  const openWaitlist = useOverlayTrigger("waitlist");
  const openFounders = useOverlayTrigger("founders");

  return (
    <section className="relative overflow-hidden pt-24 pb-0 sm:pt-32">
      {/* Ambient radial brand wash — barely perceptible, adds warmth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(46,125,79,0.055) 0%, transparent 70%)",
        }}
      />

      {/* Dot grid removed — InteractiveBackground renders the global canvas dot field */}

      {/* Warm fade — matches the off-white body background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 -z-10 h-56 bg-gradient-to-t from-[#F7F7F4] to-transparent"
      />

      {/* ── Headline + CTAs ────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <BlurReveal delay={0}>
          <h1 className="text-[2.25rem] font-bold text-neutral-900 sm:text-5xl md:text-6xl lg:text-[4.5rem]">
            The AI Project Manager That Actually <em>Runs</em> Execution
          </h1>
        </BlurReveal>

        <motion.p
          {...heroItem(0.1)}
          className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-neutral-500 sm:text-lg"
        >
          Projects don&apos;t fail because of bad strategy.{" "}
          They fail because no one owns coordination.
        </motion.p>

        <motion.p
          {...heroItem(0.18)}
          className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-neutral-500 sm:text-lg"
        >
          Larry autonomously manages follow-ups, updates, dependencies, and
          alignment — so your team can focus on delivering outcomes.
        </motion.p>

        <motion.div
          {...heroItem(0.28)}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <LiquidButton size="lg" onClick={openWaitlist}>Join the Waitlist</LiquidButton>
          <Button size="lg" variant="secondary" onClick={openFounders}>
            Speak to the Founders
          </Button>
        </motion.div>
      </div>

      {/* ── Hero UI mockup ─────────────────────────────────────────── */}
      {/* Slight scale-in reinforces that it's emerging, not just appearing */}
      <motion.div
        initial={{ opacity: 0, y: 36, scale: 0.984 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.92, delay: 0.4, ease: EASE }}
        className="relative mx-auto mt-10 max-w-5xl px-4 sm:mt-16 sm:px-6"
      >
        <div
          className="overflow-hidden rounded-t-2xl border border-b-0 border-neutral-200 bg-white"
          style={{
            boxShadow:
              "0 32px 64px rgba(0,0,0,0.09), 0 8px 24px rgba(0,0,0,0.05)",
          }}
        >
          {/* Browser chrome */}
          <div className="flex h-9 items-center gap-1.5 border-b border-neutral-100 bg-neutral-50/70 px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
            <div className="mx-auto h-5 w-56 rounded-full bg-neutral-200/70" />
          </div>

          {/* App shell */}
          <div className="flex min-h-[380px]">
            {/* Sidebar */}
            <aside className="hidden w-52 shrink-0 border-r border-neutral-100 bg-neutral-50/60 p-4 sm:block">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Projects
              </div>
              {[
                "Alpha Launch",
                "Q3 Programme",
                "Vendor Onboarding",
                "Platform Migration",
              ].map((p, i) => (
                <div
                  key={p}
                  className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${
                    i === 0
                      ? "bg-white font-medium text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                      : "text-neutral-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      i === 0 ? "bg-[#2e7d4f]" : "bg-neutral-200"
                    }`}
                  />
                  {p}
                </div>
              ))}
            </aside>

            {/* Main panel */}
            <div className="flex-1 p-5">
              {/* Panel header */}
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900">
                    Alpha Launch
                  </h2>
                  <p className="text-xs text-neutral-400">
                    12 open actions · 3 overdue
                  </p>
                </div>

                {/* Active indicator */}
                <div className="flex items-center gap-1.5 rounded-full border border-[#2e7d4f]/20 bg-[#2e7d4f]/5 px-3 py-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[#2e7d4f] live-pulse"
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium text-[#2e7d4f]">
                    Larry is active
                  </span>
                </div>
              </div>

              {/* Task rows */}
              <div className="space-y-1.5">
                {MOCK_TASKS.map(({ id, title, assignee, status }) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-xs transition-colors hover:border-neutral-200"
                    style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STATUS_PILL[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="flex-1 truncate text-neutral-700">
                      {title}
                    </span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[9px] font-bold text-neutral-500">
                      {assignee}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Ambient feed — Larry working in the background ─── */}
              <div
                className="mt-4 rounded-xl border border-[#2e7d4f]/12 px-3.5 py-3"
                style={{ background: "rgba(46,125,79,0.035)" }}
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2e7d4f] text-[8px] font-bold text-white select-none">
                    L
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#2e7d4f]/60">
                    Larry
                  </span>
                </div>
                <AmbientFeed />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
