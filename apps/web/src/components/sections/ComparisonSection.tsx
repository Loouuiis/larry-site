"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { FadeUp } from "@/components/ui/FadeUp";
import { ChevronRight } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const WITHOUT_ITEMS = [
  "Chasing updates across teams, email, Slack, and spreadsheets",
  "Sending reminders and following up on tasks and deadlines",
  "Running status meetings that create more confusion than progress",
  "Manually updating project plans and reports",
];

const WITH_ITEMS = [
  "Real-time, fully updated project state with clear priorities",
  "Automatically aligns stakeholders, timelines, and tools",
  "Automates task execution, updates, follow-ups, and progress tracking",
  "Full project context and immediate, informed responses via chat",
];

export function ComparisonSection() {
  return (
    <section className="py-12 sm:py-24 border-t border-[var(--border)] bg-[#F2F2EF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeUp>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase text-center">
            The Difference
          </p>
          <h2
            className="mt-4 text-center text-[var(--text-1)] font-bold"
            style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Where execution breaks down.
          </h2>
        </FadeUp>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WithoutCard />
          <WithCard />
        </div>

        <FadeUp delay={0.1}>
          <div className="mt-10 rounded-2xl border border-[var(--border)] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(17,23,44,0.04)] text-center">
            <p className="text-sm text-[var(--text-muted)]">This is not a tracking problem.</p>
            <p
              className="mt-2 font-bold text-[var(--text-1)]"
              style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)", letterSpacing: "-0.02em" }}
            >
              It&rsquo;s an execution gap.
            </p>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function WithoutCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(17,23,44,0.04)] min-h-[420px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase">Without Larry</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Today&rsquo;s reality</p>
      <p className="mt-6 text-[var(--text-2)]">Every day, project managers lose hours to:</p>
      <ul className="mt-4 space-y-3">
        {WITHOUT_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <span className="mt-2 h-[2px] w-3 bg-[var(--text-disabled)] shrink-0" aria-hidden="true" />
            <span className="text-[var(--text-2)]">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl bg-[var(--surface-2)] p-4">
        <p className="text-[var(--text-muted)]">Critical information is scattered across:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Slack", "Tickets", "Meetings", "Inboxes"].map((chip) => (
            <span key={chip} className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-[var(--text-2)]">
              {chip}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--text-1)]">Nothing owns execution.</p>
      </div>

      {/* Hover overlay — chaos */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "rgba(26,26,14,0.9)" }}
      >
        <div className="relative w-full max-w-sm h-44">
          {[
            { rotate: -4, top: 0, text: "@jake: where are we on the API spec?" },
            { rotate: 3, top: 40, text: "@morgan: still waiting on sign-off" },
            { rotate: -2, top: 80, text: "@priya: I thought this shipped last week?" },
            { rotate: 2, top: 120, text: "@leadership: why is this 2 days late?" },
          ].map((msg, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 bg-white/90 rounded px-3 py-2 text-xs text-[var(--text-1)] shadow"
              style={{ transform: `rotate(${msg.rotate}deg)`, top: msg.top }}
            >
              {msg.text}
            </div>
          ))}
        </div>
        <div className="absolute top-6 right-6 rounded-full bg-red-500 text-white text-[10px] font-bold px-2 py-1 tracking-wider">
          &#9888; 3 OVERDUE
        </div>
        <p className="absolute bottom-6 text-white/80 text-sm italic">This is what execution without Larry looks like.</p>
      </motion.div>
    </div>
  );
}

function WithCard() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--text-2)] bg-[var(--text-1)] p-6 sm:p-8 min-h-[420px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] uppercase">With Larry</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Autonomous execution</p>
      <p className="mt-6 text-[var(--text-muted)]">Every day, project managers experience:</p>
      <ul className="mt-4 space-y-3">
        {WITH_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <ChevronRight size={14} className="text-[var(--text-muted)] mt-1 shrink-0" aria-hidden="true" />
            <span className="text-[var(--text-muted)]">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-xl bg-white/5 p-4">
        <p className="text-sm text-[var(--text-muted)]">
          Automatically aligns stakeholders, timelines, and tools. Teams focus on outcomes, not updates.
        </p>
      </div>

      {/* Hover overlay — order */}
      <motion.div
        initial={false}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
        style={{ backgroundColor: "rgba(248,247,255,0.97)" }}
      >
        <div className="w-full max-w-sm space-y-2">
          {[
            { label: "Finalise Q3 deliverables", state: "Done", color: "#10b981" },
            { label: "Engineering sign-off on API", state: "Pending", color: "#f59e0b" },
            { label: "Update project tracker", state: "Overdue", color: "#ef4444" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-2 shadow-sm">
              <span className="text-sm text-[var(--text-1)]">{row.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: row.color }}>
                {row.state}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-center gap-2 pt-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6c44f6] live-pulse" />
            <span className="text-[11px] font-semibold tracking-wider text-[var(--text-1)]">LARRY IS ACTIVE</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
