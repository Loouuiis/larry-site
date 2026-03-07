"use client";

import { FadeUp } from "@/components/ui/FadeUp";
import { ROICalculator } from "@/components/ui/ROICalculator";

// Real numbers anchor trust. Each metric maps to a specific mechanism.
const STATS = [
  {
    value: "8",
    unit: "hrs",
    label: "saved per PM, per week",
    detail:
      "Eliminated by automating follow-ups, reminder loops, and status update cycles.",
  },
  {
    value: "3×",
    unit: "",
    label: "faster task closure rate",
    detail:
      "Structured ownership and automatic escalation compress the action cycle.",
  },
  {
    value: "Zero",
    unit: "",
    label: "manual status meetings required",
    detail:
      "Standups and exec summaries are compiled automatically — no meeting needed.",
  },
  {
    value: "Wk 1",
    unit: "",
    label: "time to measurable outcomes",
    detail:
      "Teams start with 1–2 pilot projects. We track ROI from day one.",
  },
] as const;

export function ROISection() {
  return (
    <section className="border-t border-neutral-100 py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-xl sm:mb-16">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 sm:mb-3 sm:text-xs">
            Measurable ROI
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
            Results from week one.
          </h2>
        </FadeUp>

        {/* Stats — divided columns, numbers as the visual anchor */}
        <FadeUp>
          <div className="grid grid-cols-1 divide-y divide-neutral-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {STATS.map(({ value, unit, label, detail }, i) => (
              <div
                key={label}
                className={[
                  "py-6 sm:py-8",
                  i > 0 && "lg:border-l lg:border-neutral-100 lg:pl-8",
                  i < STATS.length - 1 && "lg:pr-8",
                  i > 0 && i < 3 && "sm:border-l sm:border-neutral-100 sm:pl-8",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="mb-3 flex items-end gap-1 leading-none">
                  <span className="text-[3rem] font-bold tracking-tight text-neutral-900 leading-none">
                    {value}
                  </span>
                  {unit && (
                    <span className="mb-1.5 text-xl font-semibold text-neutral-400">
                      {unit}
                    </span>
                  )}
                </div>
                <p className="mb-2 text-sm font-semibold text-neutral-700">
                  {label}
                </p>
                <p className="text-xs leading-relaxed text-neutral-400">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </FadeUp>

        <FadeUp delay={0.15} className="mt-8 sm:mt-12">
          <ROICalculator />
        </FadeUp>
      </div>
    </section>
  );
}
