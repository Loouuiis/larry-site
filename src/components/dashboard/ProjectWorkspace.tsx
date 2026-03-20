"use client";

import { useState } from "react";
import {
  motion,
  AnimatePresence,
  LayoutGroup,
} from "framer-motion";
import {
  ArrowLeft,
  LayoutDashboard,
  GanttChartSquare,
  BarChart2,
  Video,
  ChevronRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GanttPage } from "./pages/GanttPage";
import { TaskDetailPanel, type TaskPanelData } from "./TaskDetailPanel";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Types ──────────────────────────────────────────────────────────────── */

type TabId = "overview" | "timeline" | "analytics" | "meetings";
type PhaseStatus = "done" | "active" | "upcoming";
type TaskStatus = "done" | "pending" | "overdue";
type Severity = "overdue" | "at-risk";

interface Phase {
  label: string;
  status: PhaseStatus;
}

interface AttentionItem {
  id: string;
  title: string;
  owner: string;
  due: string;
  severity: Severity;
}

interface Task {
  id: string;
  owner: string;
  title: string;
  due: string;
  status: TaskStatus;
}

interface WorkspaceData {
  progress: number;
  phases: Phase[];
  attentionItems: AttentionItem[];
  tasks: Task[];
}

/* ─── Mock workspace data ────────────────────────────────────────────────── */

const WORKSPACE_DATA: Record<string, WorkspaceData> = {
  alpha: {
    progress: 72,
    phases: [
      { label: "Discovery", status: "done" },
      { label: "Architecture", status: "done" },
      { label: "Build", status: "active" },
      { label: "UAT", status: "upcoming" },
      { label: "Launch", status: "upcoming" },
    ],
    attentionItems: [
      { id: "a1", title: "Core API spec sign-off", owner: "TK", due: "Overdue", severity: "overdue" },
      { id: "a2", title: "Finance budget approval", owner: "JP", due: "Mar 24", severity: "at-risk" },
    ],
    tasks: [
      { id: "t1", owner: "TK", title: "Complete API spec sign-off", due: "Today", status: "overdue" },
      { id: "t2", owner: "JP", title: "Submit budget for Finance", due: "Mar 24", status: "pending" },
      { id: "t3", owner: "ME", title: "Sprint planning after sign-off", due: "Mar 25", status: "pending" },
      { id: "t4", owner: "SR", title: "Client UAT environment", due: "Mar 28", status: "done" },
      { id: "t5", owner: "TK", title: "Integration endpoints", due: "Apr 2", status: "pending" },
    ],
  },
  q3: {
    progress: 45,
    phases: [
      { label: "Initiation", status: "done" },
      { label: "Workstream 1", status: "active" },
      { label: "Workstream 2", status: "active" },
      { label: "Workstream 3", status: "active" },
      { label: "Close-out", status: "upcoming" },
    ],
    attentionItems: [
      { id: "b1", title: "Client deliverables sign-off stalled", owner: "SR", due: "Overdue", severity: "overdue" },
      { id: "b2", title: "Cross-team dependency conflict", owner: "LP", due: "Today", severity: "at-risk" },
      { id: "b3", title: "Workstream 2 milestone report", owner: "ME", due: "Mar 25", severity: "at-risk" },
    ],
    tasks: [
      { id: "t1", owner: "SR", title: "Chase client for sign-off", due: "Today", status: "overdue" },
      { id: "t2", owner: "LP", title: "Resolve dependency conflicts", due: "Today", status: "pending" },
      { id: "t3", owner: "AK", title: "Update project tracker", due: "Mar 22", status: "done" },
      { id: "t4", owner: "ME", title: "Workstream 2 milestone report", due: "Mar 25", status: "pending" },
      { id: "t5", owner: "LP", title: "Steering committee update", due: "Mar 26", status: "pending" },
    ],
  },
  vendor: {
    progress: 88,
    phases: [
      { label: "Selection", status: "done" },
      { label: "Due Diligence", status: "done" },
      { label: "Contracting", status: "active" },
      { label: "Integration", status: "upcoming" },
    ],
    attentionItems: [
      { id: "c1", title: "Vendor contract finalisation", owner: "AK", due: "Apr 2", severity: "at-risk" },
    ],
    tasks: [
      { id: "t1", owner: "AK", title: "Finalise vendor contract", due: "Apr 2", status: "pending" },
      { id: "t2", owner: "JP", title: "Finance sign-off on terms", due: "Apr 5", status: "pending" },
      { id: "t3", owner: "AK", title: "Onboarding portal access", due: "Mar 20", status: "done" },
      { id: "t4", owner: "JP", title: "Risk assessment", due: "Mar 18", status: "done" },
    ],
  },
  platform: {
    progress: 31,
    phases: [
      { label: "Assessment", status: "done" },
      { label: "Security", status: "active" },
      { label: "Migration", status: "upcoming" },
      { label: "Validation", status: "upcoming" },
      { label: "Cutover", status: "upcoming" },
    ],
    attentionItems: [
      { id: "d1", title: "Auth layer security gaps", owner: "ME", due: "Overdue", severity: "overdue" },
      { id: "d2", title: "Deadline passed — Mar 20", owner: "ME", due: "5 days overdue", severity: "overdue" },
      { id: "d3", title: "Remediation plan review", owner: "TK", due: "Mar 23", severity: "at-risk" },
    ],
    tasks: [
      { id: "t1", owner: "ME", title: "Remediate auth layer security gaps", due: "Mar 22", status: "overdue" },
      { id: "t2", owner: "LP", title: "Update steering committee", due: "Mar 21", status: "done" },
      { id: "t3", owner: "TK", title: "Review remediation plan", due: "Mar 23", status: "pending" },
      { id: "t4", owner: "ME", title: "Data migration dry-run", due: "Mar 27", status: "pending" },
      { id: "t5", owner: "TK", title: "Load testing on new infra", due: "Mar 29", status: "pending" },
    ],
  },
  analytics: {
    progress: 0,
    phases: [
      { label: "Scoping", status: "upcoming" },
      { label: "Data Mapping", status: "upcoming" },
      { label: "Build", status: "upcoming" },
      { label: "Testing", status: "upcoming" },
    ],
    attentionItems: [],
    tasks: [],
  },
};

/* ─── Mock meetings data ──────────────────────────────────────────────────── */

interface MeetingAction {
  text: string;
  status: "done" | "pending" | "overdue";
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  attendees: string[];
  summary: string;
  actions: MeetingAction[];
}

const MEETINGS: Meeting[] = [
  {
    id: "m1",
    title: "Sprint Planning",
    date: "Mar 18",
    attendees: ["SR", "TK", "ME"],
    summary:
      "Agreed on scope for build phase. API sign-off flagged as critical blocker. TK to resolve by Mar 22.",
    actions: [
      { text: "TK to complete API spec", status: "overdue" },
      { text: "ME to kick off sprint", status: "pending" },
    ],
  },
  {
    id: "m2",
    title: "Weekly Standup",
    date: "Mar 15",
    attendees: ["SR", "LP"],
    summary:
      "Q3 Programme update. Client deliverables stalled. SR escalating to LP. No blockers on Workstream 1.",
    actions: [{ text: "SR to follow up with client", status: "done" }],
  },
  {
    id: "m3",
    title: "Stakeholder Review",
    date: "Mar 10",
    attendees: ["LP", "SR", "TK", "ME"],
    summary:
      "Architecture approved. Build phase green-lit. Budget confirmed at £120k. Timeline reviewed.",
    actions: [
      { text: "LP to send budget confirmation", status: "done" },
      { text: "TK to begin API development", status: "done" },
    ],
  },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function taskToPanel(task: Task, projectName: string): TaskPanelData {
  const statusMap: Record<TaskStatus, TaskPanelData["status"]> = {
    done: "done",
    pending: "on-track",
    overdue: "overdue",
  };
  return {
    id: task.id,
    name: task.title,
    description: "",
    status: statusMap[task.status],
    priority: "medium",
    assignee: task.owner,
    assigneeFull: task.owner,
    project: projectName,
    deadline: task.due,
    progress: task.status === "done" ? 100 : 0,
  };
}

function attentionToPanel(item: AttentionItem, projectName: string): TaskPanelData {
  return {
    id: item.id,
    name: item.title,
    description: "",
    status: item.severity === "overdue" ? "overdue" : "at-risk",
    priority: item.severity === "overdue" ? "critical" : "high",
    assignee: item.owner,
    assigneeFull: item.owner,
    project: projectName,
    deadline: item.due,
    progress: 0,
  };
}

/* ─── Small shared components ─────────────────────────────────────────────── */

function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
        {children}
      </span>
      {count !== undefined && (
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-neutral-100 px-1 text-[9px] font-semibold text-neutral-500 tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

function OwnerBubble({ initials }: { initials: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[9px] font-bold text-[var(--color-brand)]">
      {initials}
    </span>
  );
}

/* ─── Status badge ────────────────────────────────────────────────────────── */

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cfg: Record<TaskStatus, string> = {
    done: "bg-emerald-50 text-emerald-600 border-emerald-100",
    pending: "bg-neutral-100 text-neutral-500 border-neutral-200",
    overdue: "bg-red-50 text-red-500 border-red-100",
  };
  const label: Record<TaskStatus, string> = {
    done: "Done",
    pending: "Pending",
    overdue: "Overdue",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg[status]}`}
    >
      {label[status]}
    </span>
  );
}

/* ─── Overview tab ────────────────────────────────────────────────────────── */

function OverviewTab({
  data,
  projectName,
  onOpenTask,
}: {
  data: WorkspaceData;
  projectName: string;
  onOpenTask: (panel: TaskPanelData) => void;
}) {
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showPhases, setShowPhases] = useState(false);

  const completedPhases = data.phases.filter((p) => p.status === "done").length;
  const totalPhases = data.phases.length;
  const visibleTasks = showAllTasks ? data.tasks : data.tasks.slice(0, 4);

  return (
    <div className="space-y-10">
      {/* ── Section A: Needs Attention ── */}
      <section>
        <SectionLabel count={data.attentionItems.length}>
          Needs Attention
        </SectionLabel>

        {data.attentionItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">All clear</span>
          </div>
        ) : (
          <div className="space-y-2">
            {data.attentionItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenTask(attentionToPanel(item, projectName))}
                className="group w-full rounded-xl border border-[var(--color-border)] bg-white p-4 text-left transition-colors hover:border-[var(--color-brand)]/20 hover:bg-neutral-50/50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      item.severity === "overdue" ? "bg-red-400" : "bg-amber-400"
                    }`}
                  />
                  <span className="flex-1 text-sm font-medium text-neutral-900">
                    {item.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <OwnerBubble initials={item.owner} />
                    <span className="hidden text-xs text-neutral-400 sm:inline">
                      {item.due}
                    </span>
                    <span
                      className={`hidden rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline ${
                        item.severity === "overdue"
                          ? "border-red-100 bg-red-50 text-red-500"
                          : "border-amber-100 bg-amber-50 text-amber-600"
                      }`}
                    >
                      {item.severity === "overdue" ? "Overdue" : "At risk"}
                    </span>
                    <ChevronRight
                      size={13}
                      className="text-neutral-300 transition-colors group-hover:text-neutral-500"
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Section B: Progress ── */}
      <section>
        <SectionLabel>Progress</SectionLabel>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6">
          {/* Large % */}
          <div className="mb-1 text-center text-5xl font-bold tracking-tight text-neutral-900">
            {data.progress}%
          </div>
          <p className="mb-5 text-center text-xs text-neutral-400">
            {completedPhases} of {totalPhases} phases complete
          </p>

          {/* Progress bar */}
          <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-neutral-100">
            <motion.div
              className="h-full rounded-full bg-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${data.progress}%` }}
              transition={{ duration: 0.8, ease: EASE }}
            />
          </div>

          {/* Phase pills */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.phases.map((phase) => {
              const dotCls =
                phase.status === "done"
                  ? "bg-emerald-400"
                  : phase.status === "active"
                  ? "bg-[var(--color-brand)]"
                  : "bg-neutral-300";
              const textCls =
                phase.status === "done"
                  ? "text-emerald-700"
                  : phase.status === "active"
                  ? "text-[var(--color-brand)]"
                  : "text-neutral-400";
              const borderCls =
                phase.status === "done"
                  ? "border-emerald-100 bg-emerald-50"
                  : phase.status === "active"
                  ? "border-[var(--color-brand)]/20 bg-[var(--color-brand)]/5"
                  : "border-neutral-200 bg-neutral-50";
              return (
                <span
                  key={phase.label}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${borderCls} ${textCls}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                  {phase.label}
                </span>
              );
            })}
          </div>

          {/* View phases toggle */}
          <button
            onClick={() => setShowPhases((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--color-brand)] hover:underline"
          >
            {showPhases ? "Hide phases" : "View phases →"}
          </button>

          <AnimatePresence>
            {showPhases && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
                  {data.phases.map((phase) => {
                    const pct =
                      phase.status === "done"
                        ? 100
                        : phase.status === "active"
                        ? 50
                        : 0;
                    const barCls =
                      phase.status === "done"
                        ? "bg-emerald-400"
                        : phase.status === "active"
                        ? "bg-[var(--color-brand)]"
                        : "bg-neutral-200";
                    return (
                      <div key={phase.label} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 truncate text-xs text-neutral-600">
                          {phase.label}
                        </span>
                        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className={`h-full rounded-full ${barCls}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[10px] font-medium text-neutral-400 tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Section C: Tasks ── */}
      <section>
        <SectionLabel count={data.tasks.length}>Active Tasks</SectionLabel>

        {data.tasks.length === 0 ? (
          <p className="text-xs text-neutral-400">No tasks yet.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {visibleTasks.map((task) => (
                  <motion.button
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    onClick={() => onOpenTask(taskToPanel(task, projectName))}
                    className="group flex w-full items-center gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--color-brand)]/20 hover:bg-neutral-50/50"
                  >
                    <OwnerBubble initials={task.owner} />
                    <span className="flex-1 truncate text-sm text-neutral-800">
                      {task.title}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-400">
                      {task.due}
                    </span>
                    <TaskStatusBadge status={task.status} />
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            {data.tasks.length > 4 && (
              <button
                onClick={() => setShowAllTasks((v) => !v)}
                className="mt-3 flex items-center gap-1 text-xs text-[var(--color-brand)] hover:underline"
              >
                {showAllTasks
                  ? "Show fewer"
                  : `View all ${data.tasks.length} tasks →`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ─── Analytics tab ───────────────────────────────────────────────────────── */

const CHART_COLORS = {
  completed: "#34d399",
  inProgress: "#8b5cf6",
  atRisk: "#fbbf24",
  overdue: "#f87171",
};

function AnalyticsTab({ data, projectName }: { data: WorkspaceData; projectName: string }) {
  const total = data.tasks.length;
  const completed = data.tasks.filter((t) => t.status === "done").length;
  const inProgress = data.tasks.filter((t) => t.status === "pending").length;
  const overdue = data.tasks.filter((t) => t.status === "overdue").length;

  const donutData = [
    { name: "Completed", value: completed, color: CHART_COLORS.completed },
    { name: "In Progress", value: inProgress, color: CHART_COLORS.inProgress },
    { name: "Overdue", value: overdue, color: CHART_COLORS.overdue },
  ].filter((d) => d.value > 0);

  const kpis = [
    {
      label: "Total Tasks",
      value: total,
      cls: "text-neutral-900",
      bg: "bg-neutral-50 border-neutral-200",
    },
    {
      label: "Completed",
      value: completed,
      cls: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
    },
    {
      label: "In Progress",
      value: inProgress,
      cls: "text-[var(--color-brand)]",
      bg: "bg-[var(--color-brand)]/5 border-[var(--color-brand)]/20",
    },
    {
      label: "Overdue",
      value: overdue,
      cls: "text-red-500",
      bg: "bg-red-50 border-red-100",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, value, cls, bg }) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 ${bg}`}
          >
            <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
            <p className="mt-1 text-xs text-neutral-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Donut */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
          <p className="mb-4 text-sm font-semibold text-neutral-800">
            Task Status
          </p>
          {donutData.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">
              No task data yet.
            </p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative shrink-0">
                <PieChart width={150} height={150}>
                  <Pie
                    data={donutData}
                    cx={75}
                    cy={75}
                    innerRadius={50}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      return (
                        <div className="rounded-xl border border-neutral-100 bg-white px-3 py-2 text-xs shadow-sm">
                          <span className="font-medium text-neutral-800">
                            {p.name}: {p.value}
                          </span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-neutral-900">
                    {total}
                  </span>
                  <span className="text-[9px] font-medium text-neutral-400">
                    tasks
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                {donutData.map(({ name, value, color }) => (
                  <div key={name}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {name}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-neutral-700">
                        {value}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: color }}
                        initial={{ width: 0 }}
                        animate={{
                          width: total > 0 ? `${(value / total) * 100}%` : "0%",
                        }}
                        transition={{ duration: 0.8, ease: EASE }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Phase progress */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
          <p className="mb-4 text-sm font-semibold text-neutral-800">
            Phase Progress
          </p>
          <div className="space-y-3.5">
            {data.phases.map((phase) => {
              const pct =
                phase.status === "done"
                  ? 100
                  : phase.status === "active"
                  ? 50
                  : 0;
              const barCls =
                phase.status === "done"
                  ? "bg-emerald-400"
                  : phase.status === "active"
                  ? "bg-[var(--color-brand)]"
                  : "bg-neutral-200";
              const labelCls =
                phase.status === "done"
                  ? "text-emerald-600"
                  : phase.status === "active"
                  ? "text-[var(--color-brand)]"
                  : "text-neutral-400";
              return (
                <div key={phase.label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className={`text-xs font-medium ${labelCls}`}>
                      {phase.label}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-neutral-500">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <motion.div
                      className={`h-full rounded-full ${barCls}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: EASE }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Meetings tab ────────────────────────────────────────────────────────── */

function MeetingsTab() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const actionStatusCls: Record<MeetingAction["status"], string> = {
    done: "bg-emerald-50 text-emerald-600 border-emerald-100",
    pending: "bg-neutral-100 text-neutral-500 border-neutral-200",
    overdue: "bg-red-50 text-red-500 border-red-100",
  };

  return (
    <div className="space-y-3">
      {MEETINGS.map((meeting) => {
        const isOpen = expanded === meeting.id;
        return (
          <div
            key={meeting.id}
            className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden"
          >
            {/* Card header — always visible */}
            <button
              onClick={() => setExpanded(isOpen ? null : meeting.id)}
              className="flex w-full items-start gap-4 p-5 text-left"
            >
              {/* Date chip */}
              <span className="mt-0.5 shrink-0 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-semibold text-neutral-500">
                {meeting.date}
              </span>

              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900">
                  {meeting.title}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400 line-clamp-1">
                  {meeting.summary}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {/* Attendees */}
                  <div className="flex -space-x-1.5">
                    {meeting.attendees.map((a) => (
                      <span
                        key={a}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand)]/10 text-[7px] font-bold text-[var(--color-brand)] ring-1 ring-white"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                  {/* Action count */}
                  <span className="text-[10px] text-neutral-400">
                    {meeting.actions.length}{" "}
                    {meeting.actions.length === 1 ? "action" : "actions"}
                  </span>
                </div>
              </div>

              {/* Chevron */}
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="mt-1 shrink-0 text-neutral-300"
              >
                <ChevronDown size={15} />
              </motion.span>
            </button>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.26, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-4">
                    {/* Summary */}
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        Summary
                      </p>
                      <p className="text-xs leading-relaxed text-neutral-600">
                        {meeting.summary}
                      </p>
                    </div>

                    {/* Actions */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                        Actions
                      </p>
                      <div className="space-y-1.5">
                        {meeting.actions.map((action, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-neutral-50/60 px-3 py-2"
                          >
                            <span className="flex-1 text-xs text-neutral-700">
                              {action.text}
                            </span>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${actionStatusCls[action.status]}`}
                            >
                              {action.status.charAt(0).toUpperCase() +
                                action.status.slice(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tab definitions ─────────────────────────────────────────────────────── */

const TABS: { id: TabId; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "timeline", label: "Timeline", Icon: GanttChartSquare },
  { id: "analytics", label: "Analytics", Icon: BarChart2 },
  { id: "meetings", label: "Meetings", Icon: Video },
];

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function ProjectWorkspace({
  projectId,
  projectName,
  onBack,
}: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedTask, setSelectedTask] = useState<TaskPanelData | null>(null);

  const data: WorkspaceData =
    WORKSPACE_DATA[projectId] ?? WORKSPACE_DATA["alpha"];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Workspace header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-white px-6">
        {/* Back */}
        <motion.button
          onClick={onBack}
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          <ArrowLeft size={14} />
          <span className="text-xs text-neutral-500">Projects</span>
        </motion.button>

        {/* Project name */}
        <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-tight text-neutral-900">
          {projectName}
        </span>

        {/* Avatar */}
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-accent-blue)] text-[10px] font-bold text-white shadow-sm">
          A
        </span>
      </header>

      {/* ── Tab bar ── */}
      <LayoutGroup>
        <div className="shrink-0 border-b border-[var(--color-border)] bg-white px-6 py-2">
          <div className="flex items-center gap-1">
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors"
                >
                  {isActive && (
                    <motion.span
                      layoutId="workspace-tab-pill"
                      className="absolute inset-0 rounded-full bg-[var(--color-brand)]"
                      transition={{ duration: 0.22, ease: EASE }}
                    />
                  )}
                  <Icon size={12} className={`relative ${isActive ? "text-white" : "text-neutral-400"}`} />
                  <span
                    className={`relative ${isActive ? "text-white" : "text-neutral-500 hover:text-neutral-700"}`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </LayoutGroup>

      {/* ── Tab content ── */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-[var(--background)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE }}
              className={activeTab === "timeline" ? "" : "px-6 py-8"}
            >
              {activeTab === "timeline" ? (
                <div className="h-[calc(100vh-10rem)]">
                  <GanttPage
                    projectName={projectName}
                    onBack={() => setActiveTab("overview")}
                  />
                </div>
              ) : activeTab === "overview" ? (
                <div className="mx-auto max-w-4xl">
                  <OverviewTab
                    data={data}
                    projectName={projectName}
                    onOpenTask={setSelectedTask}
                  />
                </div>
              ) : activeTab === "analytics" ? (
                <div className="mx-auto max-w-4xl">
                  <AnalyticsTab data={data} projectName={projectName} />
                </div>
              ) : (
                <div className="mx-auto max-w-4xl">
                  <MeetingsTab />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Task detail panel ── */}
        <AnimatePresence>
          {selectedTask && (
            <motion.div
              key={selectedTask.id}
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="fixed inset-y-0 right-0 z-40 flex w-[360px] shadow-2xl"
            >
              <TaskDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Backdrop when panel is open */}
        <AnimatePresence>
          {selectedTask && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedTask(null)}
              className="fixed inset-0 z-30 bg-black/10"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
