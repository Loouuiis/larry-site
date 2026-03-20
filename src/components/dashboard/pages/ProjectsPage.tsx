"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, Clock, CheckCircle2, TrendingUp, Plus,
  Bell, ArrowUp, BarChart2, ArrowRight, ChevronRight, ChevronDown,
  ArrowLeft, Calendar, Users, LayoutList, Rows3,
  CheckSquare, AlertTriangle, Zap,
} from "lucide-react";
import { ProjectHub } from "./ProjectHub";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Data ─────────────────────────────────────────────────────────────── */

export type Health = "on-track" | "at-risk" | "overdue" | "not-started";

interface Task {
  owner: string;
  task: string;
  due: string;
  status: "pending" | "done" | "overdue";
}

interface Phase {
  label: string;
  pct: number; // 0-100, how far into its own duration
  status: "done" | "active" | "upcoming";
}

interface Project {
  id: string;
  name: string;
  description: string;
  health: Health;
  progress: number;
  openActions: number;
  deadline: string;
  team: string[];
  larryNote: string;
  owner: string;
  tasks: Task[];
  phases: Phase[];
  risks: string[];
}

const PROJECTS: Project[] = [
  {
    id: "alpha",
    name: "Alpha Launch",
    description: "Client-facing platform MVP — targeting Q2 go-live.",
    health: "on-track",
    progress: 72,
    openActions: 4,
    deadline: "Apr 5",
    team: ["SR", "TK", "ME"],
    larryNote: "API spec sign-off pending",
    owner: "SR",
    tasks: [
      { owner: "TK", task: "Complete API spec sign-off",             due: "Today",   status: "overdue" },
      { owner: "JP", task: "Submit budget for Finance approval",      due: "Mar 24",  status: "pending" },
      { owner: "ME", task: "Kick off sprint planning after sign-off", due: "Mar 25",  status: "pending" },
      { owner: "SR", task: "Client UAT environment provisioned",      due: "Mar 28",  status: "done"    },
    ],
    phases: [
      { label: "Discovery",    pct: 100, status: "done"     },
      { label: "Architecture", pct: 100, status: "done"     },
      { label: "Build",        pct: 68,  status: "active"   },
      { label: "UAT",          pct: 0,   status: "upcoming" },
      { label: "Launch",       pct: 0,   status: "upcoming" },
    ],
    risks: [
      "API sign-off delay blocks sprint start and risks Apr 5 deadline",
      "Finance budget approval outstanding — may delay hiring",
    ],
  },
  {
    id: "q3",
    name: "Q3 Programme",
    description: "Cross-functional delivery programme across 3 workstreams.",
    health: "at-risk",
    progress: 45,
    openActions: 9,
    deadline: "Mar 28",
    team: ["LP", "SR", "AK"],
    larryNote: "Client deliverables stalled — 3 overdue",
    owner: "LP",
    tasks: [
      { owner: "SR", task: "Chase client for deliverables sign-off",    due: "Today",  status: "overdue" },
      { owner: "LP", task: "Resolve cross-team dependency conflicts",     due: "Today",  status: "pending" },
      { owner: "AK", task: "Update project tracker with latest status",  due: "Mar 22", status: "done"    },
      { owner: "ME", task: "Workstream 2 milestone report",              due: "Mar 25", status: "pending" },
      { owner: "LP", task: "Steering committee update",                  due: "Mar 26", status: "pending" },
    ],
    phases: [
      { label: "Initiation",   pct: 100, status: "done"     },
      { label: "Workstream 1", pct: 60,  status: "active"   },
      { label: "Workstream 2", pct: 40,  status: "active"   },
      { label: "Workstream 3", pct: 20,  status: "active"   },
      { label: "Close-out",    pct: 0,   status: "upcoming" },
    ],
    risks: [
      "March 28 deadline at risk if client sign-off not received by Mar 22",
      "Workstream 2 has no buffer — any delay will compound",
      "3 actions overdue with no owner response",
    ],
  },
  {
    id: "vendor",
    name: "Vendor Onboarding",
    description: "New supply-chain vendor onboarding and integration.",
    health: "on-track",
    progress: 88,
    openActions: 2,
    deadline: "Apr 12",
    team: ["AK", "JP"],
    larryNote: "Contract finalisation in progress",
    owner: "AK",
    tasks: [
      { owner: "AK", task: "Finalise vendor contract",         due: "Apr 2",  status: "pending" },
      { owner: "JP", task: "Finance sign-off on vendor terms", due: "Apr 5",  status: "pending" },
      { owner: "AK", task: "Onboarding portal access set up",  due: "Mar 20", status: "done"    },
      { owner: "JP", task: "Risk assessment completed",        due: "Mar 18", status: "done"    },
    ],
    phases: [
      { label: "Vendor Selection", pct: 100, status: "done"     },
      { label: "Due Diligence",    pct: 100, status: "done"     },
      { label: "Contracting",      pct: 80,  status: "active"   },
      { label: "Integration",      pct: 0,   status: "upcoming" },
    ],
    risks: [
      "Contract review may extend if legal requests revisions",
    ],
  },
  {
    id: "platform",
    name: "Platform Migration",
    description: "Legacy infrastructure migration to cloud-native stack.",
    health: "overdue",
    progress: 31,
    openActions: 6,
    deadline: "Mar 20",
    team: ["ME", "TK", "LP"],
    larryNote: "Security review blocked — escalated",
    owner: "ME",
    tasks: [
      { owner: "ME", task: "Remediate auth layer security gaps",        due: "Mar 22", status: "overdue" },
      { owner: "LP", task: "Update steering committee on timeline",     due: "Mar 21", status: "done"    },
      { owner: "TK", task: "Review remediation plan before sign-off",  due: "Mar 23", status: "pending" },
      { owner: "ME", task: "Data migration dry-run",                   due: "Mar 27", status: "pending" },
      { owner: "TK", task: "Load testing on new infra",                due: "Mar 29", status: "pending" },
    ],
    phases: [
      { label: "Assessment",  pct: 100, status: "done"     },
      { label: "Security",    pct: 40,  status: "active"   },
      { label: "Migration",   pct: 0,   status: "upcoming" },
      { label: "Validation",  pct: 0,   status: "upcoming" },
      { label: "Cutover",     pct: 0,   status: "upcoming" },
    ],
    risks: [
      "5-day delay if auth gaps not resolved by Mar 22",
      "Migration window may need rescheduling — ops coordination required",
      "No buffer in the plan for additional security findings",
    ],
  },
  {
    id: "analytics",
    name: "Data Analytics Setup",
    description: "Internal BI tooling and data warehouse implementation.",
    health: "not-started",
    progress: 0,
    openActions: 0,
    deadline: "May 30",
    team: ["JP", "AK"],
    larryNote: "Project not yet kicked off",
    owner: "JP",
    tasks: [],
    phases: [
      { label: "Scoping",       pct: 0, status: "upcoming" },
      { label: "Data Mapping",  pct: 0, status: "upcoming" },
      { label: "Build",         pct: 0, status: "upcoming" },
      { label: "Testing",       pct: 0, status: "upcoming" },
    ],
    risks: [],
  },
];

const RECENT_ACTIVITY = [
  { time: "2m ago",  text: "Sent reminder to TK about API spec sign-off",         type: "reminder"   },
  { time: "18m ago", text: "Escalated Platform Migration security review to ME",   type: "escalation" },
  { time: "1h ago",  text: "Compiled morning standup for Q3 Programme",            type: "report"     },
  { time: "2h ago",  text: "Assigned vendor contract task to AK (deadline Apr 2)", type: "assign"     },
];

/* ─── Config maps ───────────────────────────────────────────────────────── */

const HEALTH: Record<Health, { label: string; bar: string; badge: string; dot: string }> = {
  "on-track":    { label: "On track",    bar: "bg-emerald-400", dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-600 border-emerald-100"   },
  "at-risk":     { label: "At risk",     bar: "bg-amber-400",   dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-600 border-amber-100"         },
  "overdue":     { label: "Overdue",     bar: "bg-red-400",     dot: "bg-red-400",     badge: "bg-red-50 text-red-500 border-red-100"               },
  "not-started": { label: "Not started", bar: "bg-neutral-300", dot: "bg-neutral-300", badge: "bg-neutral-100 text-neutral-500 border-neutral-200"  },
};

const TASK_STATUS: Record<Task["status"], string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-100",
  done:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  overdue: "bg-red-50 text-red-500 border-red-100",
};

const PHASE_STYLE: Record<Phase["status"], { track: string; fill: string; label: string }> = {
  done:     { track: "bg-emerald-100", fill: "bg-emerald-400", label: "text-emerald-600" },
  active:   { track: "bg-[var(--color-brand)]/10", fill: "bg-[var(--color-brand)]", label: "text-[var(--color-brand)]" },
  upcoming: { track: "bg-neutral-100", fill: "bg-neutral-300", label: "text-neutral-400" },
};

const ACTIVITY_ICON: Record<string, string> = {
  reminder:   "bg-[var(--color-brand)]/10 text-[var(--color-brand)]",
  escalation: "bg-red-50 text-red-500",
  report:     "bg-neutral-100 text-neutral-500",
  assign:     "bg-emerald-50 text-emerald-600",
};
const ACTIVITY_LUCIDE: Record<string, React.ElementType> = {
  reminder: Bell, escalation: ArrowUp, report: BarChart2, assign: ArrowRight,
};

const STATS = [
  { label: "Active Projects",   value: "4",  icon: TrendingUp,   color: "text-[var(--color-brand)]", bg: "bg-[var(--color-brand)]/8" },
  { label: "Open Actions",      value: "21", icon: Clock,        color: "text-amber-500",             bg: "bg-amber-50"               },
  { label: "Overdue",           value: "7",  icon: AlertCircle,  color: "text-red-500",               bg: "bg-red-50"                 },
  { label: "Resolved by Larry", value: "12", icon: CheckCircle2, color: "text-emerald-500",           bg: "bg-emerald-50"             },
];

/* ─── Animation variants ────────────────────────────────────────────────── */

const container = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.48, ease: EASE } },
};

/* ─── Project Detail ────────────────────────────────────────────────────── */

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const hc = HEALTH[project.health];

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="space-y-5 pb-10"
    >
      {/* Breadcrumb + back */}
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-medium text-[var(--color-brand)] hover:underline"
        >
          <ArrowLeft size={13} />
          Projects
        </button>
        <ChevronRight size={11} className="text-neutral-300" />
        <span className="font-medium text-neutral-600">{project.name}</span>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h2
                className="text-xl font-bold text-neutral-900 tracking-[-0.025em]"
                style={{ letterSpacing: "-0.025em" }}
              >
                {project.name}
              </h2>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${hc.badge}`}>
                {hc.label}
              </span>
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed">{project.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                Due {project.deadline}
              </span>
              <span className="flex items-center gap-1.5">
                <Users size={12} />
                {project.team.length} members
              </span>
              <span className="flex items-center gap-1.5">
                <CheckSquare size={12} />
                {project.openActions} open actions
              </span>
            </div>
          </div>

          {/* Progress ring area */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                <motion.circle
                  cx="40" cy="40" r="32"
                  fill="none"
                  stroke={project.health === "on-track" ? "#34d399" : project.health === "at-risk" ? "#fbbf24" : project.health === "overdue" ? "#f87171" : "#d1d5db"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 32}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - project.progress / 100) }}
                  transition={{ duration: 1.1, ease: EASE }}
                />
              </svg>
              <span className="text-lg font-bold text-neutral-900">{project.progress}%</span>
            </div>
            <span className="text-[10px] text-neutral-400">Complete</span>
          </div>
        </div>

        {/* Team avatars */}
        <div className="mt-4 flex items-center gap-2 border-t border-neutral-50 pt-4">
          <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mr-1">Team</span>
          <div className="flex -space-x-1.5">
            {project.team.map((initials) => (
              <span
                key={initials}
                title={initials}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)]/10 text-[9px] font-bold text-[var(--color-brand)]"
              >
                {initials}
              </span>
            ))}
          </div>
          <span className="ml-3 flex items-center gap-1 rounded-lg bg-neutral-50 px-2 py-1 text-[10px] text-neutral-500">
            <span className="flex h-3 w-3 items-center justify-center rounded bg-[var(--color-brand)] text-[5px] font-bold text-white">L</span>
            {project.larryNote}
          </span>
        </div>
      </div>

      {/* Phases timeline */}
      <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
        <h3 className="mb-4 text-xs font-semibold text-neutral-800 flex items-center gap-2">
          <Zap size={12} className="text-[var(--color-brand)]" />
          Project Phases
        </h3>
        <div className="space-y-3">
          {project.phases.map((phase, i) => {
            const ps = PHASE_STYLE[phase.status];
            return (
              <div key={i} className="flex items-center gap-3">
                <span className={`w-24 shrink-0 text-[10px] font-medium ${ps.label}`}>{phase.label}</span>
                <div className={`h-2 flex-1 overflow-hidden rounded-full ${ps.track}`}>
                  <motion.div
                    className={`h-full rounded-full ${ps.fill}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${phase.pct}%` }}
                    transition={{ duration: 0.85, ease: EASE, delay: i * 0.06 }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[10px] text-neutral-400">
                  {phase.pct > 0 ? `${phase.pct}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks + Risks */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_320px]">
        {/* Task list */}
        <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <CheckSquare size={13} className="text-[var(--color-brand)]" />
            <h3 className="text-xs font-semibold text-neutral-800">Action Items</h3>
            <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
              {project.tasks.length}
            </span>
          </div>
          {project.tasks.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No tasks yet — this project hasn&apos;t kicked off.</p>
          ) : (
            <ul className="space-y-3">
              {project.tasks.map(({ owner, task, due, status }, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-neutral-50 bg-neutral-50/60 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[9px] font-bold text-[var(--color-brand)]">
                    {owner}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-neutral-700 leading-snug">{task}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">Due {due}</span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${TASK_STATUS[status]}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Risks */}
        <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-card self-start">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500" />
            <h3 className="text-xs font-semibold text-neutral-800">Flagged Risks</h3>
          </div>
          {project.risks.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No risks flagged yet.</p>
          ) : (
            <ul className="space-y-3">
              {project.risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <p className="text-xs leading-relaxed text-neutral-600">{risk}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Section order ─────────────────────────────────────────────────────── */

const SECTION_ORDER: Health[] = ["overdue", "at-risk", "on-track", "not-started"];

/* ─── Shared project row ─────────────────────────────────────────────────── */

function ProjectRow({ proj, onSelect }: { proj: Project; onSelect: (id: string) => void }) {
  const hc = HEALTH[proj.health];
  return (
    <motion.li
      whileHover={{ backgroundColor: "rgba(139,92,246,0.025)" }}
      transition={{ duration: 0.15 }}
      className="group cursor-pointer"
      onClick={() => onSelect(proj.id)}
    >
      {/* Desktop row */}
      <div className="hidden sm:grid grid-cols-[2fr_1fr_140px_100px_80px_32px] items-center px-5 py-4 gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${hc.dot}`} />
            <p className="truncate text-xs font-semibold text-neutral-800 group-hover:text-[var(--color-brand)] transition-colors">
              {proj.name}
            </p>
          </div>
          <p className="mt-0.5 truncate pl-4 text-[10px] text-neutral-400">{proj.description}</p>
        </div>
        <div>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${hc.badge}`}>
            {hc.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <motion.div
              className={`h-full rounded-full ${hc.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${proj.progress}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[10px] font-medium text-neutral-500">{proj.progress}%</span>
        </div>
        <div className="flex justify-center -space-x-1.5">
          {proj.team.map((initials) => (
            <span key={initials} title={initials} className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)]/10 text-[7px] font-bold text-[var(--color-brand)]">
              {initials}
            </span>
          ))}
        </div>
        <div className="text-right">
          <span className="text-[10px] text-neutral-500">{proj.deadline}</span>
        </div>
        <ChevronRight size={13} className="text-neutral-200 group-hover:text-[var(--color-brand)] transition-colors" />
      </div>

      {/* Mobile row */}
      <div className="flex flex-col gap-3 px-4 py-4 sm:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 shrink-0 rounded-full ${hc.dot}`} />
            <p className="truncate text-xs font-semibold text-neutral-800">{proj.name}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${hc.badge}`}>
            {hc.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div className={`h-full rounded-full ${hc.bar}`} style={{ width: `${proj.progress}%` }} />
          </div>
          <span className="text-[10px] font-medium text-neutral-500">{proj.progress}%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {proj.team.map((i) => (
              <span key={i} className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)]/10 text-[7px] font-bold text-[var(--color-brand)]">{i}</span>
            ))}
          </div>
          <span className="text-[10px] text-neutral-400">Due {proj.deadline}</span>
          <ChevronRight size={13} className="text-neutral-300" />
        </div>
      </div>
    </motion.li>
  );
}

/* ─── Collapsible section ────────────────────────────────────────────────── */

function ProjectSection({
  health, projects, onSelect, defaultOpen = true,
}: {
  health: Health;
  projects: Project[];
  onSelect: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hc = HEALTH[health];

  if (projects.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
      {/* Section header */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.995 }}
        className="flex w-full items-center gap-3 border-b border-neutral-50 px-5 py-3.5 text-left hover:bg-neutral-50/60 transition-colors"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${hc.dot}`} />
        <span className="text-xs font-semibold text-neutral-800">{hc.label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${hc.badge}`}>
          {projects.length}
        </span>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="ml-auto text-neutral-300"
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      {/* Column headers — only shown when open */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="hidden sm:grid grid-cols-[2fr_1fr_140px_100px_80px_32px] border-b border-neutral-50 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              <span>Project</span>
              <span>Status</span>
              <span>Timeline</span>
              <span className="text-center">Team</span>
              <span className="text-right">Deadline</span>
              <span />
            </div>
            <ul role="list" className="divide-y divide-neutral-50">
              {projects.map((proj) => (
                <ProjectRow key={proj.id} proj={proj} onSelect={onSelect} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Projects Overview (table/card hybrid) ─────────────────────────────── */

function ProjectsOverview({ onSelect, onNewProject }: { onSelect: (id: string) => void; onNewProject?: () => void }) {
  const [view, setView] = useState<"grouped" | "all">("grouped");

  const grouped = SECTION_ORDER.map((health) => ({
    health,
    projects: PROJECTS.filter((p) => p.health === health),
  }));

  return (
    <motion.div variants={container} initial="hidden" animate="visible" className="space-y-6 pb-10">

      {/* Stat cards */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-neutral-100 bg-white p-4 sm:p-5 shadow-card">
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
              <Icon size={15} className={color} />
            </div>
            <p className="text-2xl font-bold text-neutral-900 leading-none tracking-tight">{value}</p>
            <p className="mt-1.5 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Main content */}
      <motion.div variants={item} className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">

        {/* Project list */}
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-neutral-800">
              {view === "grouped" ? "Projects by Status" : "All Projects"}
            </h2>

            {/* View toggle */}
            <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-0.5">
              <motion.button
                onClick={() => setView("grouped")}
                whileTap={{ scale: 0.95 }}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150",
                  view === "grouped"
                    ? "bg-[var(--color-brand)] text-white shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                <Rows3 size={12} />
                <span className="hidden sm:inline">Grouped</span>
              </motion.button>
              <motion.button
                onClick={() => setView("all")}
                whileTap={{ scale: 0.95 }}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-150",
                  view === "all"
                    ? "bg-[var(--color-brand)] text-white shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                <LayoutList size={12} />
                <span className="hidden sm:inline">All</span>
              </motion.button>
            </div>

            <button
              onClick={onNewProject}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-colors"
            >
              <Plus size={12} />
              New Project
            </button>
          </div>

          {/* Grouped view */}
          <AnimatePresence mode="wait">
            {view === "grouped" ? (
              <motion.div
                key="grouped"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="space-y-3"
              >
                {grouped.map(({ health, projects }) => (
                  <ProjectSection
                    key={health}
                    health={health}
                    projects={projects}
                    onSelect={onSelect}
                    defaultOpen={health !== "not-started"}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="all"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card"
              >
                <div className="hidden sm:grid grid-cols-[2fr_1fr_140px_100px_80px_32px] border-b border-neutral-100 px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  <span>Project</span>
                  <span>Status</span>
                  <span>Timeline</span>
                  <span className="text-center">Team</span>
                  <span className="text-right">Deadline</span>
                  <span />
                </div>
                <ul role="list" className="divide-y divide-neutral-50">
                  {PROJECTS.map((proj) => (
                    <ProjectRow key={proj.id} proj={proj} onSelect={onSelect} />
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Larry activity feed */}
        <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden self-start shadow-card">
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

/* ─── Root export ───────────────────────────────────────────────────────── */

export function ProjectsPage({ onNewProject }: { onNewProject?: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? PROJECTS.find((p) => p.id === selectedId) ?? null : null;

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <motion.div
          key={`hub-${selected.id}`}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.28, ease: EASE }}
        >
          <ProjectHub
            projectId={selected.id}
            projectName={selected.name}
            onBack={() => setSelectedId(null)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="overview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ProjectsOverview onSelect={setSelectedId} onNewProject={onNewProject} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
