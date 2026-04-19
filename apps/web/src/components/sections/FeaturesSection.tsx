"use client";

import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/FadeUp";

// A numbered process flow communicates sequence and causality.
// Before/after cards with a downward arrow between them is boilerplate —
// it describes contrast, not how anything actually works.
const STEPS = [
  {
    n: "01",
    title: "Connect",
    detail:
      "Integrates with Teams, email, Slack and your existing stack of tools — no migration, no new process.",
  },
  {
    n: "02",
    title: "Capture",
    detail:
      "Extracts actions, owners, and deadlines from emails, ticket comments, and meeting notes automatically.",
  },
  {
    n: "03",
    title: "Execute",
    detail:
      "Creates tasks, sends reminders, escalates blockers, and updates status based on real activity — without you asking.",
  },
  {
    n: "04",
    title: "Report",
    detail:
      "Compiles standups, proactively flags risks, and surfaces key insights for leadership to ensure timely execution and delivery.",
  },
] as const;

const CAPABILITIES = [
  "Extracts actions from Slack threads, ticket comments, and meetings",
  "Assigns and clarifies ownership automatically",
  "Sends intelligent reminders without manual setup",
  "Detects blockers and escalates before deadlines slip",
  "Compiles standups and executive summaries on schedule",
] as const;

export function FeaturesSection() {
  return (
    <section id="solution" className="border-t border-[var(--border)] py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp className="mb-10 max-w-2xl sm:mb-16">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)] sm:mb-3 sm:text-xs">
            How it works
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-1)] sm:text-4xl lg:text-5xl">
            Project management that runs itself.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-4 sm:text-base">
            Larry connects to your existing tools and runs the operational layer
            — no process change, no onboarding overhead.
          </p>
        </FadeUp>

        {/* 4-step flow — staggered entrance reinforces the sequential nature */}
        <StaggerContainer
          className="mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 sm:mb-14"
          stagger={0.1}
        >
          {STEPS.map(({ n, title, detail }, i) => (
            <StaggerItem
              key={n}
              className={[
                "py-6 pr-0 sm:py-8 sm:pr-8",
                i > 0 && "lg:border-l lg:border-[var(--border)] lg:pl-8 lg:pr-8",
                i > 0 && i < 2 && "sm:border-l sm:border-[var(--border)] sm:pl-8",
                i < STEPS.length - 1 &&
                  "border-b border-[var(--border)] sm:border-b-0",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="mb-4 block font-mono text-[10px] font-medium tracking-[0.15em] text-[var(--text-disabled)]">
                {n}
              </span>
              <h3 className="mb-2 text-base font-semibold text-[var(--text-1)]">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {detail}
              </p>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Capability list — in a contained panel */}
        <FadeUp>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6 sm:px-8 sm:py-8">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
              In practice, Larry:
            </p>
            <ul
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
              role="list"
            >
              {CAPABILITIES.map((cap) => (
                <li key={cap} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5.5L4 7.5L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-sm text-[var(--text-2)]">{cap}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-[var(--text-disabled)]">
              Connects to Slack · Jira · Linear · Notion · and more
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
