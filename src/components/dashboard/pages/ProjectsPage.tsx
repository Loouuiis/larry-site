"use client";

import React from "react";
import { motion } from "framer-motion";
import { AlertCircle, Clock, CheckCircle2, TrendingUp, Plus, MoreHorizontal, Bell, ArrowUp, BarChart2, ArrowRight } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const STATS = [
  { label: "Active Projects",   value: "4",  icon: TrendingUp,  color: "text-[var(--color-brand)]",  bg: "bg-[var(--color-brand)]/8"  },
  { label: "Open Actions",      value: "21", icon: Clock,       color: "text-amber-500",              bg: "bg-amber-50"                },
  { label: "Overdue",           value: "7",  icon: AlertCircle, color: "text-red-500",                bg: "bg-red-50"                  },
  { label: "Resolved by Larry", value: "12", icon: CheckCircle2,color: "text-emerald-500",            bg: "bg-emerald-50"              },
];

const PROJECTS = [
  {
    id: "alpha",
    name: "Alpha Launch",
    description: "Client-facing platform MVP — targeting Q2 go-live.",
    health: "on-track" as const,
    progress: 72,
    openActions: 4,
    deadline: "Apr 5",
    team: ["SR", "TK", "ME"],
    activity: "API spec sign-off pending",
  },
  {
    id: "q3",
    name: "Q3 Programme",
    description: "Cross-functional delivery programme across 3 workstreams.",
    health: "at-risk" as const,
    progress: 45,
    openActions: 9,
    deadline: "Mar 28",
    team: ["LP", "SR", "AK"],
    activity: "Client deliverables stalled — 3 overdue",
  },
  {
    id: "vendor",
    name: "Vendor Onboarding",
    description: "New supply-chain vendor onboarding and integration.",
    health: "on-track" as const,
    progress: 88,
    openActions: 2,
    deadline: "Apr 12",
    team: ["AK", "JP"],
    activity: "Contract finalisation in progress",
  },
  {
    id: "platform",
    name: "Platform Migration",
    description: "Legacy infrastructure migration to cloud-native stack.",
    health: "overdue" as const,
    progress: 31,
    openActions: 6,
    deadline: "Mar 20",
    team: ["ME", "TK", "LP"],
    activity: "Security review blocked — escalated",
  },
];

const RECENT_ACTIVITY = [
  { time: "2m ago",  text: "Sent reminder to TK about API spec sign-off",          type: "reminder"   },
  { time: "18m ago", text: "Escalated Platform Migration security review to ME",    type: "escalation" },
  { time: "1h ago",  text: "Compiled morning standup for Q3 Programme",             type: "report"     },
  { time: "2h ago",  text: "Assigned vendor contract task to AK (deadline Apr 2)",  type: "assign"     },
];

const HEALTH: Record<string, { label: string; dot: string; bar: string; badge: string }> = {
  "on-track": { label: "On track", dot: "bg-emerald-400", bar: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  "at-risk":  { label: "At risk",  dot: "bg-amber-400",   bar: "bg-amber-400",   badge: "bg-amber-50 text-amber-600 border-amber-100"       },
  "overdue":  { label: "Overdue",  dot: "bg-red-400",     bar: "bg-red-400",     badge: "bg-red-50 text-red-500 border-red-100"             },
};

const ACTIVITY_ICON: Record<string, string> = {
  reminder:   "bg-[var(--color-brand)]/10 text-[var(--color-brand)]",
  escalation: "bg-red-50 text-red-500",
  report:     "bg-neutral-100 text-neutral-500",
  assign:     "bg-emerald-50 text-emerald-600",
};

const ACTIVITY_LUCIDE: Record<string, React.ElementType> = {
  reminder:   Bell,
  escalation: ArrowUp,
  report:     BarChart2,
  assign:     ArrowRight,
};

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function ProjectsPage() {
  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-6 pb-10">

      {/* Stat cards */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-2xl border border-neutral-100 bg-white p-4 sm:p-5 shadow-card"
          >
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-2xl font-bold text-neutral-900 leading-none tracking-tight">{value}</p>
            <p className="mt-1.5 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Project grid + activity */}
      <motion.div variants={item} className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">

        {/* Projects */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-800">All Projects</h2>
            <button className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-colors">
              <Plus size={12} />
              New Project
            </button>
          </div>

          {PROJECTS.map(({ id, name, description, health, progress, openActions, deadline, team, activity }) => {
            const hc = HEALTH[health];
            return (
              <motion.div
                key={id}
                whileHover={{ y: -1 }}
                transition={{ duration: 0.15 }}
                className="group rounded-2xl border border-neutral-100 bg-white p-5 cursor-pointer shadow-card hover:shadow-card-hover transition-shadow duration-200"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-neutral-900">{name}</h3>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${hc.badge}`}>
                        {hc.label}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 leading-relaxed">{description}</p>
                  </div>
                  <button className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 opacity-0 group-hover:opacity-100 transition-all">
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                {/* Progress */}
                <div className="mb-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">{progress}% complete</span>
                    <span className="text-[10px] text-neutral-400">Due {deadline}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <motion.div
                      className={`h-full rounded-full ${hc.bar}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.9, ease: EASE }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {/* Team */}
                  <div className="flex -space-x-1.5">
                    {team.map((initials) => (
                      <span
                        key={initials}
                        className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)]/10 text-[8px] font-bold text-[var(--color-brand)]"
                      >
                        {initials}
                      </span>
                    ))}
                  </div>
                  {/* Larry note */}
                  <div className="flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2.5 py-1">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-[var(--color-brand)] text-[6px] font-bold text-white">L</span>
                    <span className="text-[10px] text-neutral-500">{activity}</span>
                  </div>
                  {/* Open actions */}
                  <span className="text-[10px] font-medium text-neutral-400">
                    {openActions} action{openActions !== 1 ? "s" : ""}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Larry activity feed */}
        <div
          className="rounded-2xl border border-neutral-100 bg-white overflow-hidden self-start shadow-card"
        >
          <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[7px] font-bold text-white select-none">L</span>
            <h2 className="text-sm font-semibold text-neutral-800">Larry Activity</h2>
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse shrink-0" aria-hidden="true" />
          </div>
          <ul role="list" className="divide-y divide-neutral-50">
            {RECENT_ACTIVITY.map(({ time, text, type }, i) => {
              const IconComponent = ACTIVITY_LUCIDE[type];
              return (
              <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ACTIVITY_ICON[type]}`}>
                  <IconComponent size={10} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs leading-relaxed text-neutral-600">{text}</p>
                  <p className="mt-0.5 text-[10px] text-neutral-400">{time}</p>
                </div>
              </li>
              );
            })}
          </ul>
          <div className="border-t border-neutral-50 px-5 py-3">
            <button className="w-full text-center text-xs text-[var(--color-brand)] hover:underline">
              View all activity →
            </button>
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
}
