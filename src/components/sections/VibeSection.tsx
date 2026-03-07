"use client";

import { FadeUp } from "@/components/ui/FadeUp";

// A table is the honest format for comparison data.
// Three equal cards with a floating "Larry" badge is the most recognizable
// AI-generated marketing pattern. This table shows the actual capability delta.
const CAPABILITIES = [
  {
    label: "Surfaces project state",
    pmTools: "Yes" as const,
    aiCopilots: "Partial" as const,
    larry: "Yes" as const,
  },
  {
    label: "Extracts actions automatically",
    pmTools: "No" as const,
    aiCopilots: "No" as const,
    larry: "Yes" as const,
  },
  {
    label: "Assigns and tracks ownership",
    pmTools: "Manual" as const,
    aiCopilots: "No" as const,
    larry: "Yes" as const,
  },
  {
    label: "Sends reminders autonomously",
    pmTools: "No" as const,
    aiCopilots: "No" as const,
    larry: "Yes" as const,
  },
  {
    label: "Escalates blockers proactively",
    pmTools: "No" as const,
    aiCopilots: "No" as const,
    larry: "Yes" as const,
  },
  {
    label: "Compiles standups and summaries",
    pmTools: "No" as const,
    aiCopilots: "Yes" as const,
    larry: "Yes" as const,
  },
  {
    label: "Closes the execution loop",
    pmTools: "No" as const,
    aiCopilots: "No" as const,
    larry: "Yes" as const,
  },
] as const;

type CellValue = "Yes" | "No" | "Manual" | "Partial";

function Cell({ value }: { value: CellValue }) {
  if (value === "Yes") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Yes" role="img">
        <path
          d="M2.5 7.5L5.5 10.5L11.5 3.5"
          stroke="#2e7d4f"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (value === "No") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="No" role="img">
        <path d="M3.5 7h7" stroke="#d1d5db" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  // "Manual" or "Partial" — text so the nuance is legible
  return <span className="text-[11px] font-medium text-neutral-400">{value}</span>;
}

export function VibeSection() {
  return (
    <section id="differentiator" className="border-t border-neutral-100 bg-[#F2F2EF]/60 py-12 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-2xl sm:mb-14">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 sm:mb-3 sm:text-xs">
            Why this is different
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
            The first tool that owns follow-through.
          </h2>
        </FadeUp>

        <FadeUp>
          {/* Mobile: simple Larry checklist — avoids the 4-col table overflowing */}
          <div
            className="md:hidden rounded-2xl border border-neutral-200 bg-white px-5 py-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#7C6BFF]">
              What Larry does
            </p>
            <ul className="space-y-3" role="list">
              {CAPABILITIES.map(({ label }) => (
                <li key={label} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2e7d4f]/10 text-[#2e7d4f]"
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-sm text-neutral-700">{label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-neutral-400">
              PM Tools and AI Copilots cover only a fraction of the above — Larry does all of it.
            </p>
          </div>

          {/* Desktop: full comparison table */}
          <div
            className="hidden md:block overflow-hidden rounded-2xl border border-neutral-200 bg-white"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_96px_96px_96px] border-b border-neutral-100 sm:grid-cols-[1fr_120px_120px_120px]">
              <div className="px-6 py-4" />
              {[
                { label: "PM Tools", accent: false },
                { label: "AI Copilots", accent: false },
                { label: "Larry", accent: true },
              ].map(({ label, accent }) => (
                <div
                  key={label}
                  className={[
                    "py-4 text-center text-xs font-semibold px-2",
                    accent
                      ? "border-l border-[#7C6BFF]/15 bg-[#7C6BFF]/[0.03] text-[#7C6BFF]"
                      : "text-neutral-400",
                  ]
                    .join(" ")}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Rows */}
            {CAPABILITIES.map(({ label, pmTools, aiCopilots, larry }, i) => (
              <div
                key={label}
                className={[
                  "grid grid-cols-[1fr_96px_96px_96px] sm:grid-cols-[1fr_120px_120px_120px]",
                  i < CAPABILITIES.length - 1 && "border-b border-neutral-100/60",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="px-6 py-3.5 text-sm text-neutral-700">
                  {label}
                </div>
                <div className="flex items-center justify-center py-3.5 px-2">
                  <Cell value={pmTools} />
                </div>
                <div className="flex items-center justify-center py-3.5 px-2">
                  <Cell value={aiCopilots} />
                </div>
                <div className="flex items-center justify-center border-l border-[#7C6BFF]/15 bg-[#7C6BFF]/[0.03] py-3.5 px-2">
                  <Cell value={larry} />
                </div>
              </div>
            ))}
          </div>
        </FadeUp>

        <FadeUp delay={0.12} className="mt-8 sm:mt-10">
          <p className="max-w-xl text-base text-neutral-500">
            PM tools give you visibility. AI copilots help you draft.{" "}
            <span className="font-semibold text-neutral-900">
              Larry is the first to own the action lifecycle — end to end.
            </span>
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
