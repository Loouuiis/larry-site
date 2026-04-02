"use client";

import { FadeUp } from "@/components/ui/FadeUp";

// Plain divs for informational cards — GlassCard's mouse-tracking specular
// highlight is interactive decoration on passive content. It signals
// interactivity where there is none.
const PAIN_POINTS = [
  "Chasing updates",
  "Sending reminders",
  "Running status meetings",
  "Clarifying ownership",
  "Manually updating systems",
] as const;

const CONSEQUENCES = [
  "Delays that compound into months",
  "Budget overruns",
  "Expensive rework",
  "Unclear accountability",
  "Leadership flying blind",
] as const;

const SCATTERED_SOURCES = ["Slack", "Tickets", "Meetings", "Inboxes"] as const;

// Minus dash — signals wasted time without alarm-state red
const MinusIcon = () => (
  <svg width="8" height="2" viewBox="0 0 8 2" fill="none" aria-hidden="true">
    <path d="M0 1h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Chevron right — consequence arrow, directional and serious
const ChevronIcon = () => (
  <svg width="7" height="10" viewBox="0 0 7 10" fill="none" aria-hidden="true">
    <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function UseCasesSection() {
  return (
    <section className="border-t border-[var(--border)] bg-[#F2F2EF] py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-2xl sm:mb-14">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)] sm:mb-3 sm:text-xs">
            The problem
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl lg:text-5xl">
            Where execution breaks down.
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Pain points */}
          <FadeUp>
            <div
              className="h-full rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-sm text-[var(--text-muted)]">
                Every day, project managers lose hours to:
              </p>
              <ul className="space-y-3" role="list">
                {PAIN_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-disabled)]"
                    >
                      <MinusIcon />
                    </span>
                    <span className="text-sm text-[var(--text-2)]">{point}</span>
                  </li>
                ))}
              </ul>

              {/* Scattered sources */}
              <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  Critical information is scattered across:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SCATTERED_SOURCES.map((src) => (
                    <span
                      key={src}
                      className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-2)]"
                      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                    >
                      {src}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold text-[var(--text-2)]">
                  Nothing owns execution.
                </p>
              </div>
            </div>
          </FadeUp>

          {/* Consequences — dark card signals gravity without alarm-state red */}
          <FadeUp delay={0.08}>
            <div
              className="h-full rounded-2xl border border-[var(--text-2)] bg-[var(--text-1)] p-5 sm:p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-sm text-[var(--text-disabled)]">The result:</p>
              <ul className="space-y-3" role="list">
                {CONSEQUENCES.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-2)] text-[var(--text-disabled)]"
                    >
                      <ChevronIcon />
                    </span>
                    <span className="text-sm font-medium text-[var(--text-2)]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-xl bg-[var(--text-2)] p-4">
                <p className="text-xs leading-relaxed text-[var(--text-disabled)]">
                  Globally, project inefficiencies cost{" "}
                  <strong className="text-white">trillions annually</strong> — and the majority of
                  projects miss deadlines or budgets.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.1} className="mt-5 sm:mt-8">
          <div
            className="rounded-2xl border border-[var(--border)] bg-white px-5 py-6 text-center sm:px-8 sm:py-8"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-lg font-medium text-[var(--text-muted)]">
              This is not a tracking problem.
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-1)] sm:text-3xl">
              It&apos;s an execution gap.
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
