"use client";

import { FadeUp } from "@/components/ui/FadeUp";

// Primary roles get full cards with breathing room.
// Supporting roles are compact — same info, less visual weight.
// Six identical full cards with placeholder green-dot icons is uniform noise.
const PRIMARY_ROLES = [
  {
    id: "pm",
    title: "Project Managers",
    description:
      "Stop being the system. Let Larry own the reminders, the follow-ups, and the status updates — so you can focus on unblocking delivery.",
  },
  {
    id: "pmo",
    title: "PMO Leads",
    description:
      "Get consistent execution across every project in your portfolio without adding headcount or manual oversight.",
  },
] as const;

const SECONDARY_ROLES = [
  {
    id: "ops",
    title: "Directors of Operations",
    description:
      "Operational clarity at scale. Larry surfaces blockers, tracks accountability, and keeps leadership informed automatically.",
  },
  {
    id: "delivery",
    title: "Heads of Delivery",
    description:
      "Faster execution cycles, fewer deadline slips. Larry acts as the always-on coordination layer your clients never see but always benefit from.",
  },
  {
    id: "consultants",
    title: "Consultants",
    description:
      "Every billable hour spent chasing updates is margin lost. Larry recovers it — and makes your engagements run cleaner.",
  },
  {
    id: "cxo",
    title: "CTOs & COOs",
    description:
      "Real-time visibility into what's moving, what's stalled, and what needs your attention — without building a reporting process.",
  },
] as const;

export function WhoItsForSection() {
  return (
    <section id="audience" className="border-t border-neutral-100 py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-2xl sm:mb-14">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 sm:mb-3 sm:text-xs">
            Who this is for
          </p>
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-neutral-900 sm:mb-4 sm:text-4xl lg:text-5xl">
            Built for the people who own execution.
          </h2>
          <p className="text-sm leading-relaxed text-neutral-500 sm:text-base">
            Especially in organisations with 50–500+ employees where
            coordination intensity is high — multiple stakeholders,
            dependencies, and delivery pressure.
          </p>
        </FadeUp>

        {/* Primary roles — full cards, generous padding */}
        <FadeUp className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRIMARY_ROLES.map(({ id, title, description }) => (
            <div
              key={id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <h3 className="mb-3 text-base font-semibold text-neutral-900">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-500">
                {description}
              </p>
            </div>
          ))}
        </FadeUp>

        {/* Supporting roles — compact, no visual competition with primaries */}
        <FadeUp className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SECONDARY_ROLES.map(({ id, title, description }) => (
            <div
              key={id}
              className="rounded-xl border border-neutral-200 bg-white p-5"
              style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)" }}
            >
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-800">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-neutral-500">
                {description}
              </p>
            </div>
          ))}
        </FadeUp>
      </div>
    </section>
  );
}
