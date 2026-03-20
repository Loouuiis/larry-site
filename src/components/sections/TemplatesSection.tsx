"use client";

import { FadeUp } from "@/components/ui/FadeUp";

// "What Larry handles" vs "What you control" — a clean division of labour.
// The previous version used amber warning icons on the "human approval" items,
// which signals risk on something that is actually a positive guarantee.
// Warning iconography on good features is a logic error. Fixed.
const AUTONOMOUS = [
  "Extracting action items from threads and meetings",
  "Assigning and clarifying ownership",
  "Sending reminders and follow-ups",
  "Escalating inactivity before deadlines slip",
  "Compiling standups and executive summaries",
] as const;

const HUMAN_DECISIONS = [
  "Deadline changes",
  "Ownership shifts",
  "Scope adjustments",
  "External commitments",
] as const;

const CheckIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M2 5.5L4 7.5L8 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PersonIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <circle cx="5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.25" />
    <path
      d="M2 9c0-1.657 1.343-3 3-3s3 1.343 3 3"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
);

export function TemplatesSection() {
  return (
    <section className="border-t border-neutral-100 bg-[#F2F2EF]/60 py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-2xl sm:mb-14">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 sm:mb-3 sm:text-xs">
            Built for control
          </p>
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-neutral-900 sm:mb-4 sm:text-4xl lg:text-5xl">
            AI that stays in its lane.
          </h2>
          <p className="text-sm leading-relaxed text-neutral-500 sm:text-base">
            Every action Larry takes is explainable, bounded, and reversible.
            Strategic decisions stay with you — always.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* What Larry handles */}
          <FadeUp>
            <div
              className="h-full rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                What Larry handles
              </p>
              <ul className="space-y-3" role="list">
                {AUTONOMOUS.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                    >
                      <CheckIcon />
                    </span>
                    <span className="text-sm text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Fully reversible", "Explainable", "Backed by signals"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-500"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>
          </FadeUp>

          {/* What you control */}
          <FadeUp delay={0.08}>
            <div
              className="h-full rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                What you control
              </p>
              <ul className="space-y-3" role="list">
                {HUMAN_DECISIONS.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
                    >
                      <PersonIcon />
                    </span>
                    <span className="text-sm text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3">
                <p className="text-xs leading-relaxed text-neutral-500">
                  Strategic decisions always require human approval. Larry
                  handles the operational layer — not the judgment calls.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
