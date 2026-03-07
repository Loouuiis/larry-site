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

const XIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M2 2L8 8M8 2L2 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const WarningIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M5 2v3.5M5 7v.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function UseCasesSection() {
  return (
    <section className="border-t border-neutral-100 bg-[#F2F2EF] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-14 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            The problem
          </p>
          <h2 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Where execution breaks down.
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Pain points */}
          <FadeUp>
            <div
              className="h-full rounded-2xl border border-neutral-200 bg-white p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-sm text-neutral-500">
                Every day, project managers lose hours to:
              </p>
              <ul className="space-y-3" role="list">
                {PAIN_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-400"
                    >
                      <XIcon />
                    </span>
                    <span className="text-sm text-neutral-700">{point}</span>
                  </li>
                ))}
              </ul>

              {/* Scattered sources */}
              <div className="mt-8 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                <p className="mb-3 text-xs text-neutral-500">
                  Critical information is scattered across:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SCATTERED_SOURCES.map((src) => (
                    <span
                      key={src}
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600"
                      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                    >
                      {src}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold text-neutral-700">
                  Nothing owns execution.
                </p>
              </div>
            </div>
          </FadeUp>

          {/* Consequences */}
          <FadeUp delay={0.08}>
            <div
              className="h-full rounded-2xl border border-red-100 bg-red-50/40 p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <p className="mb-5 text-sm text-neutral-500">The result:</p>
              <ul className="space-y-3" role="list">
                {CONSEQUENCES.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500"
                    >
                      <WarningIcon />
                    </span>
                    <span className="text-sm font-medium text-neutral-800">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-xl bg-red-100/60 p-4">
                <p className="text-xs leading-relaxed text-red-800">
                  Globally, project inefficiencies cost{" "}
                  <strong>trillions annually</strong> — and the majority of
                  projects miss deadlines or budgets.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.1} className="mt-8">
          <div
            className="rounded-2xl border border-neutral-200 bg-white px-8 py-8 text-center"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-lg font-medium text-neutral-500">
              This is not a tracking problem.
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              It&apos;s an execution gap.
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
