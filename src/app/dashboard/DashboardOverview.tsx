"use client";

import { motion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// ── Mock data ─────────────────────────────────────────────────────────────────
// Replace with real API calls once the backend is ready.

const STATS = [
  { label: "Open Actions",      value: "21", sub: "across 4 projects", variant: "default" as const },
  { label: "Overdue",           value: "7",  sub: "need attention",    variant: "danger"  as const },
  { label: "Resolved by Larry", value: "12", sub: "today",             variant: "brand"   as const },
  { label: "Active Projects",   value: "4",  sub: "in this workspace", variant: "default" as const },
] as const;

const ACTIONS = [
  { id: 1, title: "Engineering sign-off on API spec",      project: "Alpha Launch",       assignee: "TK", due: "Today",     status: "pending" as const },
  { id: 2, title: "Finalise Q3 deliverables with client",  project: "Q3 Programme",       assignee: "SR", due: "Yesterday", status: "overdue" as const },
  { id: 3, title: "Security review approval",              project: "Platform Migration",  assignee: "ME", due: "Mar 20",    status: "overdue" as const },
  { id: 4, title: "Update tracker post-standup",           project: "Q3 Programme",       assignee: "LP", due: "Today",     status: "pending" as const },
  { id: 5, title: "Vendor contract finalisation",          project: "Vendor Onboarding",  assignee: "AK", due: "Apr 2",     status: "pending" as const },
  { id: 6, title: "Budget sign-off from Finance",          project: "Alpha Launch",       assignee: "JP", due: "Mar 24",    status: "pending" as const },
] as const;

const LARRY_FEED = [
  { id: 1, time: "2m ago",  action: "Sent reminder to TK — API spec sign-off is due today",          type: "reminder"   as const },
  { id: 2, time: "18m ago", action: "Escalated Platform Migration security review to ME",              type: "escalation" as const },
  { id: 3, time: "1h ago",  action: "Compiled morning standup for Q3 Programme (6 items)",            type: "report"     as const },
  { id: 4, time: "2h ago",  action: "Assigned vendor contract task to AK — deadline Apr 2",           type: "assign"     as const },
  { id: 5, time: "3h ago",  action: "Updated Alpha Launch: 4 actions closed, progress now 72%",       type: "update"     as const },
] as const;

const PROJECTS = [
  { id: "alpha",    name: "Alpha Launch",       health: "on-track" as const, progress: 72, openActions: 4,  deadline: "Apr 5"  },
  { id: "q3",       name: "Q3 Programme",       health: "at-risk"  as const, progress: 45, openActions: 9,  deadline: "Mar 28" },
  { id: "vendor",   name: "Vendor Onboarding",  health: "on-track" as const, progress: 88, openActions: 2,  deadline: "Apr 12" },
  { id: "platform", name: "Platform Migration", health: "overdue"  as const, progress: 31, openActions: 6,  deadline: "Mar 20" },
];

// ── Style maps ────────────────────────────────────────────────────────────────

const STAT_CARD: Record<string, { card: string; value: string }> = {
  default: {
    card:  "border-[var(--color-border)] bg-white/90",
    value: "text-[var(--foreground)]",
  },
  danger: {
    card:  "border-red-100 bg-red-50/80",
    value: "text-red-500",
  },
  brand: {
    card:  "border-[var(--color-brand)]/15 bg-[var(--color-brand)]/5",
    value: "text-[var(--color-brand)]",
  },
};

const STATUS_PILL: Record<string, string> = {
  overdue: "bg-red-50 text-red-500 border border-red-100",
  pending: "bg-amber-50 text-amber-600 border border-amber-100",
  done:    "bg-emerald-50 text-emerald-600 border border-emerald-100",
};

const HEALTH_CONFIG: Record<string, { dot: string; label: string; badge: string; bar: string }> = {
  "on-track": { dot: "bg-emerald-400", label: "On track", badge: "bg-emerald-50 text-emerald-600 border border-emerald-100", bar: "bg-emerald-400" },
  "at-risk":  { dot: "bg-amber-400",   label: "At risk",  badge: "bg-amber-50 text-amber-600 border border-amber-100",       bar: "bg-amber-400"   },
  "overdue":  { dot: "bg-red-400",     label: "Overdue",  badge: "bg-red-50 text-red-500 border border-red-100",             bar: "bg-red-400"     },
};

const FEED_ICON: Record<string, string> = {
  reminder:   "bg-[var(--color-brand)]/10 text-[var(--color-brand)]",
  escalation: "bg-red-50 text-red-500",
  report:     "bg-neutral-100 text-neutral-500",
  assign:     "bg-emerald-50 text-emerald-600",
  update:     "bg-blue-50 text-blue-500",
};

// ── Feed icon SVGs ────────────────────────────────────────────────────────────

function FeedIconShape({ type }: { type: string }) {
  const p = { width: 8, height: 8, viewBox: "0 0 10 10", fill: "none", "aria-hidden": true as const };
  switch (type) {
    case "reminder":
      return (
        <svg {...p}>
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 3.5V5.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "escalation":
      return (
        <svg {...p}>
          <path d="M5 8V3M2.5 5.5L5 3l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "report":
      return (
        <svg {...p}>
          <path d="M2 8.5V7h1.5v1.5H2ZM4.5 8.5V3H6v5.5H4.5ZM7 8.5V5h1.5v3.5H7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "assign":
      return (
        <svg {...p}>
          <circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2 9c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "update":
    default:
      return (
        <svg {...p}>
          <path d="M2 5.5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

// ── Animation variants ────────────────────────────────────────────────────────

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

// ── Component ─────────────────────────────────────────────────────────────────

const TODAY = new Date().toLocaleDateString("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric",
});

export function DashboardOverview() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      className="space-y-5 pb-8"
    >
      {/* Greeting */}
      <motion.div variants={fadeUp}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          {TODAY}
        </p>
        <h1
          className="mt-1 text-xl font-bold text-[var(--foreground)]"
          style={{ letterSpacing: "-0.02em" }}
        >
          Here&apos;s what Larry is tracking today.
        </h1>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map(({ label, value, sub, variant }) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 sm:p-5 ${STAT_CARD[variant].card}`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <p className={`text-3xl font-bold leading-none tracking-tight ${STAT_CARD[variant].value}`}>
              {value}
            </p>
            <p className="mt-2.5 text-xs font-semibold text-[var(--foreground)]/80">{label}</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{sub}</p>
          </div>
        ))}
      </motion.div>

      {/* Main grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_356px]">

        {/* Action items table */}
        <div
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white/90"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Action Items</h2>
            <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-muted)]">
              {ACTIONS.length} open
            </span>
          </div>

          {/* Column labels (desktop) */}
          <div className="hidden sm:grid grid-cols-[1fr_136px_60px_76px] border-b border-[var(--color-border)]/50 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]/50">
            <span>Task</span>
            <span>Project</span>
            <span className="text-center">Owner</span>
            <span className="text-right">Due</span>
          </div>

          {/* Rows */}
          <ul role="list">
            {ACTIONS.map(({ id, title, project, assignee, due, status }, i) => (
              <li
                key={id}
                className={[
                  "flex flex-col gap-2 px-5 py-3 transition-colors duration-100 hover:bg-[var(--color-surface)]/50",
                  "sm:grid sm:grid-cols-[1fr_136px_60px_76px] sm:items-center",
                  i < ACTIONS.length - 1 && "border-b border-[var(--color-border)]/40",
                ].filter(Boolean).join(" ")}
              >
                {/* Status + title */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium capitalize ${STATUS_PILL[status]}`}>
                    {status}
                  </span>
                  <span className="truncate text-xs text-[var(--foreground)]">{title}</span>
                </div>

                {/* Project (desktop) */}
                <span className="hidden sm:block truncate text-xs text-[var(--color-muted)]">
                  {project}
                </span>

                {/* Owner (desktop) */}
                <div className="hidden sm:flex justify-center">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[9px] font-bold text-[var(--color-muted)]">
                    {assignee}
                  </span>
                </div>

                {/* Due (desktop) */}
                <span className="hidden sm:block text-right text-xs text-[var(--color-muted)]">
                  {due}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Larry activity feed */}
          <div
            className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white/90"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-3.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-[7px] font-bold text-white select-none">
                L
              </span>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Larry Activity</h2>
              <span
                className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] live-pulse"
                aria-hidden="true"
              />
            </div>

            <ul role="list" className="divide-y divide-[var(--color-border)]/40">
              {LARRY_FEED.map(({ id, time, action, type }) => (
                <li key={id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${FEED_ICON[type]}`}>
                    <FeedIconShape type={type} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-[var(--foreground)]/80">{action}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">{time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Project health */}
          <div
            className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white/90"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="border-b border-[var(--color-border)] px-5 py-3.5">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Project Health</h2>
            </div>

            <ul role="list" className="divide-y divide-[var(--color-border)]/40">
              {PROJECTS.map(({ id, name, health, progress, openActions }) => {
                const hc = HEALTH_CONFIG[health];
                return (
                  <li key={id} className="px-5 py-4">
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hc.dot}`} />
                        <span className="truncate text-xs font-medium text-[var(--foreground)]">
                          {name}
                        </span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${hc.badge}`}>
                        {hc.label}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--color-surface)]">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${hc.bar}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {progress}% complete
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {openActions} open action{openActions !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
}
