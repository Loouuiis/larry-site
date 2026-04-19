"use client";

import { FadeUp } from "@/components/ui/FadeUp";

const ROLES = [
  "Project Managers",
  "PMO Leads",
  "Consultants and Professional Services Teams",
  "Operations and Delivery Leaders",
  "Engineering and Technical Leaders",
  "CTOs & COOs",
];

const INDUSTRIES = [
  "Consulting",
  "IT Services",
  "Engineering",
  "Construction and Infrastructure",
  "Energy and Renewables",
  "SaaS",
];

export function WhoItsForSection() {
  return (
    <section id="audience" className="py-12 sm:py-24 border-t border-[var(--border)] bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase text-center">
            Who This Is For
          </p>
          <h2
            className="mt-4 text-center text-[var(--text-1)] font-bold mx-auto max-w-3xl"
            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Built for the people who own project management and execution.
          </h2>
        </FadeUp>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {ROLES.map((role) => (
            <div
              key={role}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-5 text-center transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(17,23,44,0.05)]"
            >
              <span className="text-[15px] font-medium text-[var(--text-1)]">{role}</span>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t border-[var(--border)]" />

        <FadeUp delay={0.05}>
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase shrink-0">
              Built for teams in
            </span>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((industry) => (
                <span
                  key={industry}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-1.5 text-[13px] font-medium text-[var(--text-2)]"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
