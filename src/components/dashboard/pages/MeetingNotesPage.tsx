"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, ChevronRight, Users, CheckSquare, AlertTriangle } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

interface MeetingNote {
  id: string;
  title: string;
  project: string;
  date: string;
  duration: string;
  attendees: string[];
  summary: string;
  actions: { owner: string; task: string; due: string; status: "pending" | "done" | "overdue" }[];
  risks: string[];
  rawNotes: string;
}

const MEETINGS: MeetingNote[] = [
  {
    id: "m1",
    title: "Q3 Programme Weekly Sync",
    project: "Q3 Programme",
    date: "Today, 9:00am",
    duration: "45 min",
    attendees: ["SR", "LP", "AK", "ME"],
    summary:
      "Reviewed progress across all 3 workstreams. Client deliverables remain the critical path blocker — SR is chasing the client for sign-off. LP to coordinate cross-team dependency resolution by EOD.",
    actions: [
      { owner: "SR", task: "Chase client for deliverables sign-off", due: "Today", status: "pending" },
      { owner: "LP", task: "Resolve cross-team dependency conflicts",  due: "Today", status: "pending" },
      { owner: "AK", task: "Update project tracker with latest status", due: "Mar 22", status: "done" },
    ],
    risks: [
      "March 28 deadline at risk if client sign-off not received by Mar 22",
      "Workstream 2 has no buffer — any delay will compound",
    ],
    rawNotes:
      "SR: Client hasn't come back on deliverables. Sent 2 follow-ups. Will try calling today.\nLP: Dependency between workstream 1 and 3 needs resolving. Will set up a quick sync.\nAK: Tracker is updated. Confirmed all tasks assigned.\nME: No blockers on my side this week.",
  },
  {
    id: "m2",
    title: "Alpha Launch — Engineering Review",
    project: "Alpha Launch",
    date: "Yesterday, 2:00pm",
    duration: "30 min",
    attendees: ["TK", "ME", "JP"],
    summary:
      "API spec is nearly finalised — TK needs to complete the sign-off by COB today. Budget approval from Finance (JP) is the next gate. Architecture is approved and ready for implementation.",
    actions: [
      { owner: "TK", task: "Complete API spec sign-off",              due: "Today",  status: "overdue" },
      { owner: "JP", task: "Submit budget for Finance approval",       due: "Mar 24", status: "pending" },
      { owner: "ME", task: "Kick off sprint planning after sign-off",  due: "Mar 25", status: "pending" },
    ],
    risks: [
      "API sign-off delay blocks sprint start and risks Apr 5 deadline",
    ],
    rawNotes:
      "TK: API spec 95% done. Just need to sign off on the auth flow section.\nJP: Budget deck is ready. Finance review meeting booked for Mar 24.\nME: Waiting on sign-off before I can plan the sprint. Ready to go once unblocked.",
  },
  {
    id: "m3",
    title: "Platform Migration — Security Review",
    project: "Platform Migration",
    date: "Mar 18, 11:00am",
    duration: "60 min",
    attendees: ["ME", "LP", "TK"],
    summary:
      "Security review identified 2 critical gaps in the auth layer. ME to remediate before the migration can proceed. Timeline impact: estimated 5-day delay if not resolved by Mar 22.",
    actions: [
      { owner: "ME", task: "Remediate auth layer security gaps",       due: "Mar 22", status: "overdue" },
      { owner: "LP", task: "Update steering committee on timeline impact", due: "Mar 21", status: "done" },
      { owner: "TK", task: "Review remediation plan before sign-off",  due: "Mar 23", status: "pending" },
    ],
    risks: [
      "5-day delay if auth gaps not resolved by Mar 22",
      "Migration window may need to be rescheduled — coordinating with ops",
    ],
    rawNotes:
      "ME: Found 2 critical gaps in the auth layer during the review. Working on a fix.\nLP: Steering committee notified. They want a status update by Mon.\nTK: Can review the fix once ME submits — should be a fast review.",
  },
];

const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-600 border-amber-100",
  done:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  overdue: "bg-red-50 text-red-500 border-red-100",
};

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function MeetingNotesPage() {
  const [selected, setSelected] = useState(MEETINGS[0].id);
  const [showRaw, setShowRaw]   = useState(false);

  const meeting = MEETINGS.find((m) => m.id === selected)!;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-5 pb-10 lg:grid-cols-[280px_1fr]"
    >
      {/* Meeting list */}
      <motion.div variants={item} className="space-y-2">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Recent Meetings
        </p>
        {MEETINGS.map((m) => {
          const isActive = m.id === selected;
          return (
            <button
              key={m.id}
              onClick={() => { setSelected(m.id); setShowRaw(false); }}
              className={[
                "w-full text-left rounded-xl border p-4 transition-all duration-150",
                isActive
                  ? "border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 shadow-[0_0_0_1px_rgba(139,92,246,0.12)]"
                  : "border-neutral-100 bg-white shadow-card hover:border-neutral-200 hover:shadow-card-hover",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold leading-snug ${isActive ? "text-[var(--color-brand)]" : "text-neutral-800"}`}>
                    {m.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-neutral-400">{m.project}</p>
                </div>
                <ChevronRight size={13} className={`mt-0.5 shrink-0 transition-colors ${isActive ? "text-[var(--color-brand)]" : "text-neutral-300"}`} />
              </div>
              <div className="mt-2.5 flex items-center gap-3 text-[10px] text-neutral-400">
                <span className="flex items-center gap-1"><Calendar size={10} />{m.date}</span>
                <span className="flex items-center gap-1"><Clock size={10} />{m.duration}</span>
              </div>
            </button>
          );
        })}
      </motion.div>

      {/* Meeting detail */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="space-y-4"
        >
          {/* Header */}
          <div className="rounded-2xl border border-neutral-100 bg-white p-5 sm:p-6 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand)] mb-1">
                  {meeting.project}
                </p>
                <h2 className="text-base font-bold text-neutral-900" style={{ letterSpacing: "-0.02em" }}>
                  {meeting.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                  <span className="flex items-center gap-1"><Calendar size={11} />{meeting.date}</span>
                  <span className="flex items-center gap-1"><Clock size={11} />{meeting.duration}</span>
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {meeting.attendees.join(", ")}
                  </span>
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)]/5 border border-[var(--color-brand)]/12 px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-brand)]">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[var(--color-brand)] text-[6px] font-bold text-white">L</span>
                AI Summary
              </span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">{meeting.summary}</p>
          </div>

          {/* Actions + Risks row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Action items */}
            <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <CheckSquare size={13} className="text-[var(--color-brand)]" />
                <h3 className="text-xs font-semibold text-neutral-800">Action Items</h3>
                <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                  {meeting.actions.length}
                </span>
              </div>
              <ul className="space-y-2.5">
                {meeting.actions.map(({ owner, task, due, status }, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 mt-0.5 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[8px] font-bold text-[var(--color-brand)]">
                      {owner}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-700 leading-snug">{task}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-neutral-400">Due {due}</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_STYLE[status]}`}>
                          {status}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risks */}
            <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={13} className="text-amber-500" />
                <h3 className="text-xs font-semibold text-neutral-800">Flagged Risks</h3>
              </div>
              <ul className="space-y-2.5">
                {meeting.risks.map((risk, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <p className="text-xs leading-relaxed text-neutral-600">{risk}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Raw notes toggle */}
          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden shadow-card">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-neutral-50/50 transition-colors"
            >
              <span className="text-xs font-semibold text-neutral-700">Raw Meeting Notes</span>
              <motion.span
                animate={{ rotate: showRaw ? 90 : 0 }}
                transition={{ duration: 0.18 }}
              >
                <ChevronRight size={14} className="text-neutral-400" />
              </motion.span>
            </button>
            <AnimatePresence>
              {showRaw && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <pre className="border-t border-neutral-100 px-5 py-4 text-[11px] leading-relaxed text-neutral-500 whitespace-pre-wrap font-mono bg-neutral-50/50">
                    {meeting.rawNotes}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
