"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronRight, ChevronDown, MessageSquare, Circle,
} from "lucide-react";
import { TaskDetailPanel, type TaskPanelData } from "../TaskDetailPanel";
import { SourceDot, type TaskSource } from "@/components/ui/SourceBadge";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Status   = "done" | "on-track" | "at-risk" | "overdue" | "upcoming";
type Priority = "critical" | "high" | "medium" | "low";

interface GanttTask {
  id: string;
  name: string;
  startDay: number;   // days from Mar 1
  endDay: number;
  progress: number;
  status: Status;
  priority: Priority;
  assignee: string;
  comments: number;
  description: string;
  source: TaskSource;
  subtasks?: GanttTask[];
}

/* ─── Config maps ───────────────────────────────────────────────────────── */

const STATUS_CFG: Record<Status, { track: string; fill: string; dot: string; badge: string; label: string }> = {
  "done":      { track: "bg-emerald-100", fill: "bg-emerald-400",                   dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-600 border-emerald-100",   label: "Done"      },
  "on-track":  { track: "bg-[var(--color-brand)]/15", fill: "bg-[var(--color-brand)]", dot: "bg-[var(--color-brand)]", badge: "bg-[var(--color-brand)]/8 text-[var(--color-brand)] border-[var(--color-brand)]/20", label: "On track"  },
  "at-risk":   { track: "bg-amber-100",   fill: "bg-amber-400",                     dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-600 border-amber-100",         label: "At risk"   },
  "overdue":   { track: "bg-red-100",     fill: "bg-red-400",                       dot: "bg-red-400",     badge: "bg-red-50 text-red-500 border-red-100",               label: "Overdue"   },
  "upcoming":  { track: "bg-neutral-100", fill: "bg-neutral-300",                   dot: "bg-neutral-300", badge: "bg-neutral-100 text-neutral-500 border-neutral-200",  label: "Upcoming"  },
};

const PRIORITY_CFG: Record<Priority, { badge: string }> = {
  critical: { badge: "bg-red-50 text-red-500 border-red-100" },
  high:     { badge: "bg-orange-50 text-orange-500 border-orange-100" },
  medium:   { badge: "bg-amber-50 text-amber-600 border-amber-100" },
  low:      { badge: "bg-neutral-100 text-neutral-400 border-neutral-200" },
};

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const TOTAL_DAYS = 61; // Mar 1 – Apr 30

const WEEK_MARKERS = [
  { label: "Mar 1",  day: 0  },
  { label: "Mar 8",  day: 7  },
  { label: "Mar 15", day: 14 },
  { label: "Mar 22", day: 21 },
  { label: "Mar 29", day: 28 },
  { label: "Apr 5",  day: 35 },
  { label: "Apr 12", day: 42 },
  { label: "Apr 19", day: 49 },
  { label: "Apr 26", day: 56 },
];

// Today = Mar 20 = day 19
const TODAY_DAY = 19;

const TASKS: GanttTask[] = [
  {
    id: "t1", name: "Discovery & Planning", startDay: 0, endDay: 14,
    progress: 100, status: "done", priority: "high", assignee: "SR", comments: 3, source: "meeting",
    description: "Stakeholder interviews, requirements gathering, and project scoping.",
    subtasks: [
      { id: "t1a", name: "Stakeholder interviews",  startDay: 0,  endDay: 7,  progress: 100, status: "done", priority: "high",   assignee: "SR", comments: 1, source: "meeting", description: "Interview key stakeholders to capture goals and constraints." },
      { id: "t1b", name: "Requirements document",   startDay: 5,  endDay: 14, progress: 100, status: "done", priority: "medium", assignee: "LP", comments: 2, source: "email",   description: "Produce and obtain sign-off on the requirements document." },
    ],
  },
  {
    id: "t2", name: "Architecture Design", startDay: 12, endDay: 21,
    progress: 100, status: "done", priority: "high", assignee: "TK", comments: 5, source: "email",
    description: "System architecture design, infra planning, and tech stack decisions.",
    subtasks: [
      { id: "t2a", name: "System design doc",   startDay: 12, endDay: 18, progress: 100, status: "done", priority: "high",   assignee: "TK", comments: 2, source: "email",  description: "Produce the system design document for review." },
      { id: "t2b", name: "Tech stack decision", startDay: 17, endDay: 21, progress: 100, status: "done", priority: "medium", assignee: "TK", comments: 3, source: "slack",  description: "Finalise and document all technology selections." },
    ],
  },
  {
    id: "t3", name: "Build Phase", startDay: 20, endDay: 49,
    progress: 68, status: "on-track", priority: "critical", assignee: "ME", comments: 12, source: "manual",
    description: "Core development across API, frontend, and database layers.",
    subtasks: [
      {
        id: "t3a", name: "API Development", startDay: 20, endDay: 42,
        progress: 55, status: "at-risk", priority: "critical", assignee: "TK", comments: 6, source: "slack",
        description: "Build and document all REST API endpoints.",
        subtasks: [
          { id: "t3a1", name: "Auth endpoints",         startDay: 20, endDay: 28, progress: 100, status: "done",     priority: "critical", assignee: "TK", comments: 2, source: "slack",   description: "OAuth2 and JWT authentication flow." },
          { id: "t3a2", name: "Core API spec sign-off", startDay: 28, endDay: 35, progress: 30,  status: "overdue",  priority: "critical", assignee: "TK", comments: 4, source: "meeting", description: "Obtain stakeholder sign-off on the full API spec." },
          { id: "t3a3", name: "Integration endpoints",  startDay: 33, endDay: 42, progress: 0,   status: "upcoming", priority: "high",     assignee: "TK", comments: 0, source: "manual",  description: "Third-party integration API endpoints." },
        ],
      },
      { id: "t3b", name: "Frontend scaffolding", startDay: 24, endDay: 42, progress: 75, status: "on-track", priority: "high",   assignee: "ME", comments: 3, source: "manual",  description: "React app, routing, component library, and state management." },
      { id: "t3c", name: "Database schema",      startDay: 20, endDay: 30, progress: 100, status: "done",    priority: "high",   assignee: "SR", comments: 2, source: "email",   description: "Design and migrate the production database schema." },
    ],
  },
  {
    id: "t4", name: "UAT & Testing", startDay: 42, endDay: 54,
    progress: 0, status: "upcoming", priority: "high", assignee: "ME", comments: 0, source: "manual",
    description: "User acceptance testing with the client team.",
    subtasks: [
      { id: "t4a", name: "Test cases",      startDay: 42, endDay: 47, progress: 0, status: "upcoming", priority: "medium",   assignee: "ME", comments: 0, source: "manual",  description: "Document all UAT test cases and acceptance criteria." },
      { id: "t4b", name: "UAT environment", startDay: 44, endDay: 48, progress: 0, status: "upcoming", priority: "high",     assignee: "SR", comments: 0, source: "email",   description: "Provision and configure the UAT environment." },
      { id: "t4c", name: "Client sign-off", startDay: 48, endDay: 54, progress: 0, status: "upcoming", priority: "critical", assignee: "SR", comments: 0, source: "meeting", description: "Obtain written UAT sign-off from client leads." },
    ],
  },
  {
    id: "t5", name: "Launch", startDay: 54, endDay: 61,
    progress: 0, status: "upcoming", priority: "critical", assignee: "SR", comments: 1, source: "manual",
    description: "Go-live preparation and launch execution.",
    subtasks: [
      { id: "t5a", name: "Go-live checklist", startDay: 54, endDay: 58, progress: 0, status: "upcoming", priority: "high",   assignee: "ME", comments: 0, source: "manual", description: "Complete all pre-launch checklist items." },
      { id: "t5b", name: "Stakeholder comms", startDay: 57, endDay: 61, progress: 0, status: "upcoming", priority: "medium", assignee: "SR", comments: 1, source: "email",  description: "Send launch communications to all stakeholders." },
    ],
  },
];

/* ─── Flatten helper ────────────────────────────────────────────────────── */

interface FlatRow { task: GanttTask; depth: number; hasChildren: boolean }

function flatten(tasks: GanttTask[], expanded: Set<string>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const t of tasks) {
    const hasChildren = !!(t.subtasks?.length);
    rows.push({ task: t, depth, hasChildren });
    if (hasChildren && expanded.has(t.id)) {
      rows.push(...flatten(t.subtasks!, expanded, depth + 1));
    }
  }
  return rows;
}

function pct(day: number) { return `${(day / TOTAL_DAYS) * 100}%`; }

const ASSIGNEE_NAMES: Record<string, string> = {
  SR: "Sarah R.", TK: "Tom K.", ME: "M. Evans", LP: "L. Park",
  AK: "A. Khan",  JP: "J. Park",
};

// Mar 1 = day 0 → "Mar 1"; day 35 = "Apr 5", etc.
const PROJECT_START = new Date(2026, 2, 1); // Mar 1 2026
function dayToDate(day: number): string {
  const d = new Date(PROJECT_START);
  d.setDate(d.getDate() + day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function toTaskPanelData(task: GanttTask, projectName: string): TaskPanelData {
  return {
    id:           task.id,
    name:         task.name,
    description:  task.description,
    status:       task.status,
    priority:     task.priority,
    assignee:     task.assignee,
    assigneeFull: ASSIGNEE_NAMES[task.assignee] ?? task.assignee,
    project:      projectName,
    deadline:     dayToDate(task.endDay),
    progress:     task.progress,
    source:       task.source,
    subtasks:     task.subtasks?.map((s) => ({ name: s.name, status: s.status, progress: s.progress })),
  };
}

/* ─── GanttPage ─────────────────────────────────────────────────────────── */

interface GanttPageProps { projectName?: string; onBack: () => void }

export function GanttPage({ projectName = "Alpha Launch", onBack }: GanttPageProps) {
  const [expanded, setExpanded]       = useState<Set<string>>(() => new Set(["t1","t2","t3","t4","t5"]));
  const [selectedId, setSelectedId]   = useState<string | null>(null);

  const rows     = flatten(TASKS, expanded);
  const selected = rows.find((r) => r.task.id === selectedId)?.task ?? null;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const ROW_H = 48; // px — keep in sync with row className h-12

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col pb-4">

      {/* Top bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <button onClick={onBack} className="flex items-center gap-1.5 font-medium text-[var(--color-brand)] hover:underline">
            <ArrowLeft size={13} /> Projects
          </button>
          <ChevronRight size={11} className="text-neutral-300" />
          <span className="font-medium text-neutral-600">{projectName}</span>
          <ChevronRight size={11} className="text-neutral-300" />
          <span className="font-medium text-neutral-600">Timeline</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Today badge */}
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5 px-2.5 py-1 text-[10px] font-medium text-[var(--color-brand)]">
            <Circle size={6} className="fill-current" /> Today: Mar 20
          </span>
        </div>
      </div>

      {/* Gantt grid */}
      <div className="relative flex flex-1 overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-card">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="min-w-[860px]">

            {/* Column header */}
            <div className="sticky top-0 z-20 flex border-b border-neutral-100 bg-white">
              {/* Left header cell */}
              <div className="sticky left-0 z-30 flex w-72 shrink-0 items-center border-r border-neutral-100 bg-white px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Task</span>
              </div>

              {/* Timeline header */}
              <div className="relative flex-1 py-2.5">
                {WEEK_MARKERS.map((wm) => (
                  <span
                    key={wm.day}
                    className="absolute top-2.5 text-[10px] font-medium text-neutral-400 -translate-x-1/2"
                    style={{ left: pct(wm.day) }}
                  >
                    {wm.label}
                  </span>
                ))}
                {/* Subtle week gridlines */}
                {WEEK_MARKERS.map((wm) => (
                  <div
                    key={`grid-${wm.day}`}
                    className="absolute bottom-0 top-0 w-px bg-neutral-100"
                    style={{ left: pct(wm.day) }}
                  />
                ))}
              </div>
            </div>

            {/* Rows */}
            <AnimatePresence initial={false}>
              {rows.map(({ task, depth, hasChildren }) => {
                const sc = STATUS_CFG[task.status];
                const pc = PRIORITY_CFG[task.priority];
                const isExpanded = expanded.has(task.id);
                const isSelected = selectedId === task.id;

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: ROW_H }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="flex overflow-hidden"
                  >
                    {/* Left task info — sticky */}
                    <div
                      className={[
                        "sticky left-0 z-10 flex w-72 shrink-0 items-center gap-2 border-r border-b border-neutral-50 px-3 transition-colors",
                        isSelected
                          ? "bg-[var(--color-brand)]/5"
                          : depth === 0
                          ? "bg-white hover:bg-neutral-50/80"
                          : "bg-neutral-50/40 hover:bg-neutral-50",
                      ].join(" ")}
                      style={{ paddingLeft: `${12 + depth * 18}px` }}
                    >
                      {/* Expand/collapse */}
                      <button
                        onClick={() => hasChildren && toggle(task.id)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${hasChildren ? "text-neutral-400 hover:text-neutral-600" : "text-transparent"}`}
                      >
                        {hasChildren ? (
                          isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                        ) : (
                          <span className="h-1 w-1 rounded-full bg-neutral-200" />
                        )}
                      </button>

                      {/* Status dot */}
                      <span className={`h-2 w-2 shrink-0 rounded-full ${sc.dot}`} />

                      {/* Name */}
                      <span
                        className={`flex-1 truncate text-xs ${depth === 0 ? "font-semibold text-neutral-800" : "font-medium text-neutral-600"}`}
                        title={task.name}
                      >
                        {task.name}
                      </span>

                      {/* Source dot */}
                      <SourceDot source={task.source} />

                      {/* Priority pill (desktop) */}
                      <span className={`hidden xl:inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold capitalize ${pc.badge}`}>
                        {task.priority}
                      </span>

                      {/* Assignee */}
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[7px] font-bold text-[var(--color-brand)]">
                        {task.assignee}
                      </span>

                      {/* Comment count */}
                      {task.comments > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neutral-300">
                          <MessageSquare size={10} />
                          {task.comments}
                        </span>
                      )}
                    </div>

                    {/* Timeline bar area */}
                    <div className="relative flex-1 border-b border-neutral-50">
                      {/* Week gridlines */}
                      {WEEK_MARKERS.map((wm) => (
                        <div key={wm.day} className="absolute inset-y-0 w-px bg-neutral-50" style={{ left: pct(wm.day) }} />
                      ))}

                      {/* Today line */}
                      <div
                        className="absolute inset-y-0 z-10 w-px bg-[var(--color-brand)]/40"
                        style={{ left: pct(TODAY_DAY) }}
                      />

                      {/* Bar */}
                      <motion.button
                        onClick={() => setSelectedId(isSelected ? null : task.id)}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
                        style={{
                          left:  pct(task.startDay),
                          width: pct(task.endDay - task.startDay),
                          top:    depth === 0 ? 12 : depth === 1 ? 14 : 16,
                          height: depth === 0 ? 24 : depth === 1 ? 20 : 16,
                        }}
                        className={[
                          "absolute overflow-hidden rounded-md cursor-pointer",
                          isSelected ? "ring-2 ring-[var(--color-brand)]/40 ring-offset-1" : "",
                        ].join(" ")}
                        title={`${task.name} — click to view details`}
                      >
                        {/* Track */}
                        <div className={`absolute inset-0 ${sc.track}`} />
                        {/* Progress fill */}
                        <motion.div
                          className={`absolute inset-y-0 left-0 ${sc.fill} opacity-90`}
                          initial={{ width: 0 }}
                          animate={{ width: `${task.progress}%` }}
                          transition={{ duration: 0.8, ease: EASE }}
                        />
                        {/* Label — only for wider bars */}
                        <div className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                          <span className="text-[8px] font-semibold text-white drop-shadow-sm truncate">
                            {task.progress > 0 ? `${task.progress}%` : ""}
                          </span>
                        </div>
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

          </div>
        </div>

        {/* Task detail side panel */}
        <AnimatePresence>
          {selected && (
            <TaskDetailPanel
              key={selected.id}
              task={toTaskPanelData(selected, projectName)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {(Object.entries(STATUS_CFG) as [Status, typeof STATUS_CFG[Status]][]).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-neutral-400">
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 ml-auto">
          <span className="h-3 w-px bg-[var(--color-brand)]/40" />
          Today
        </span>
      </div>
    </div>
  );
}
