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
    <section className="relative overflow-hidden pt-20 pb-0 sm:pt-32">
      {/* Ambient radial brand wash — drifts slowly for a living, premium feel.
          transform-only animation keeps this on the compositor thread (no repaints).
          The gradient fades to transparent well before the div edges, so the
          translate never exposes a hard boundary. */}
      <div
        aria-hidden="true"
        className="hero-gradient-drift pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(139,92,246,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Dot grid removed — InteractiveBackground renders the global canvas dot field */}

      {/* Warm fade — matches the off-white body background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 -z-10 h-56 bg-gradient-to-t from-[#F8F7FF] to-transparent"
      />

      {/* ── Headline + CTAs ────────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <BlurReveal delay={0}>
          <h1
            className="text-[1.75rem] font-bold text-[var(--text-1)] sm:text-5xl md:text-6xl lg:text-[4.5rem]"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.06 }}
          >
            The AI Project Manager That Actually <em>Runs</em> Execution
          </h1>
        </BlurReveal>

        <motion.p
          {...heroItem(0.1)}
          className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--text-muted)] sm:mt-6 sm:text-lg"
        >
          Projects don&apos;t fail because of bad strategy.{" "}
          They fail because no one owns coordination.
        </motion.p>

        <motion.p
          {...heroItem(0.18)}
          className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-muted)] sm:mt-3 sm:text-lg"
        >
          Larry autonomously manages follow-ups, updates, dependencies, and
          alignment — so your team can focus on delivering outcomes.
        </motion.p>

        <motion.div
          {...heroItem(0.28)}
          className="mt-6 flex flex-col items-center gap-3 sm:mt-8 sm:flex-row sm:justify-center"
        >
          <LiquidButton size="lg" onClick={openWaitlist} className="w-full max-w-xs sm:w-auto sm:max-w-none">
            Join the Waitlist
          </LiquidButton>
          <Button size="lg" variant="secondary" onClick={openFounders} className="w-full max-w-xs sm:w-auto sm:max-w-none">
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
        className="relative mx-auto mt-8 max-w-5xl px-3 sm:mt-16 sm:px-6"
      >
        <div
          className="overflow-hidden rounded-t-2xl border border-b-0 border-[var(--border)] bg-white"
          style={{
            boxShadow:
              "0 32px 64px rgba(0,0,0,0.09), 0 8px 24px rgba(0,0,0,0.05)",
          }}
        >
          {/* Browser chrome */}
          <div className="flex h-8 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 sm:h-9 sm:px-4">
            <span className="h-2 w-2 rounded-full bg-[var(--border)] sm:h-2.5 sm:w-2.5" />
            <span className="h-2 w-2 rounded-full bg-[var(--border)] sm:h-2.5 sm:w-2.5" />
            <span className="h-2 w-2 rounded-full bg-[var(--border)] sm:h-2.5 sm:w-2.5" />
            <div className="mx-auto h-4 w-32 rounded-full bg-[var(--border)] sm:h-5 sm:w-56" />
          </div>

          {/* App shell — min-height is shorter on mobile; no min-height on xs to let content dictate height */}
          <div className="flex min-h-[220px] sm:min-h-[380px]">
            {/* Sidebar — hidden on all mobile, visible sm+ */}
            <aside className="hidden w-52 shrink-0 border-r border-[var(--border)] bg-[var(--surface-2)] p-4 sm:block">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
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
                      ? "bg-white font-medium text-[var(--text-1)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                      : "text-[var(--text-disabled)]"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      i === 0 ? "bg-[var(--color-brand)]" : "bg-[var(--border)]"
                    }`}
                  />
                  {p}
                </div>
              ))}
            </aside>

            {/* Main panel */}
            <div className="flex-1 overflow-hidden p-3 sm:p-5">
              {/* Panel header */}
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <div>
                  <h2 className="text-xs font-semibold text-[var(--text-1)] sm:text-sm">
                    Alpha Launch
                  </h2>
                  <p className="text-[10px] text-[var(--text-disabled)] sm:text-xs">
                    12 open actions · 3 overdue
                  </p>
                </div>

                {/* Active indicator */}
                <div className="flex items-center gap-1 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-2 py-0.5 sm:gap-1.5 sm:px-3 sm:py-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] live-pulse"
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-medium text-[var(--color-brand)] sm:text-[11px]">
                    Larry is active
                  </span>
                </div>
              </div>

              {/* Task rows — show fewer on mobile to keep mockup compact */}
              <div className="space-y-1 sm:space-y-1.5">
                {MOCK_TASKS.slice(0, 3).map(({ id, title, assignee, status }) => (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 text-xs transition-colors hover:border-[var(--border)] sm:gap-3 sm:rounded-xl sm:px-3 sm:py-2.5"
                    style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium sm:px-2.5 sm:text-[10px] ${STATUS_PILL[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="flex-1 truncate text-[11px] text-[var(--text-2)] sm:text-xs">
                      {title}
                    </span>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[8px] font-bold text-[var(--text-muted)] sm:h-5 sm:w-5 sm:text-[9px]">
                      {assignee}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Ambient feed — Larry working in the background ─── */}
              <div
                className="mt-3 rounded-lg border border-[var(--color-brand)]/12 px-3 py-2.5 sm:mt-4 sm:rounded-xl sm:px-3.5 sm:py-3"
                style={{ background: "rgba(var(--color-brand-rgb,139,92,246),0.04)" }}
              >
                <div className="mb-2 flex items-center gap-1.5 sm:mb-2.5 sm:gap-2">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-[7px] font-bold text-white select-none sm:h-4 sm:w-4 sm:text-[8px]">
                    L
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--color-brand)]/60 sm:text-[10px]">
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
