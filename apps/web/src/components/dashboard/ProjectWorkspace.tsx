"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  Network,
  FolderOpen,
  ChevronRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Upload,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Trash2,
  Download,
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

type TabId = "overview" | "timeline" | "analytics" | "meetings" | "orgchart" | "documents";
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

/* ─── Org chart data ──────────────────────────────────────────────────────── */

interface OrgNode {
  id: string;
  initials: string;
  name: string;
  role: string;
  tasks: number;
  children?: OrgNode[];
}

const ORG_DATA: Record<string, OrgNode> = {
  alpha: {
    id: "lp", initials: "LP", name: "Laura Park", role: "Programme Director", tasks: 2,
    children: [
      {
        id: "tk", initials: "TK", name: "Tom Kim", role: "Tech Lead", tasks: 3,
        children: [
          { id: "me", initials: "ME", name: "Maya Evans", role: "Backend Engineer", tasks: 4 },
          { id: "jr", initials: "JR", name: "Jack Reed", role: "Frontend Engineer", tasks: 2 },
        ],
      },
      {
        id: "jp", initials: "JP", name: "Jake Price", role: "Finance Lead", tasks: 2,
        children: [
          { id: "sr", initials: "SR", name: "Sam Russo", role: "Business Analyst", tasks: 3 },
        ],
      },
    ],
  },
  q3: {
    id: "lp", initials: "LP", name: "Laura Park", role: "Programme Director", tasks: 1,
    children: [
      {
        id: "sr", initials: "SR", name: "Sam Russo", role: "Workstream 1 Lead", tasks: 3,
        children: [
          { id: "ak", initials: "AK", name: "Alex Khan", role: "Project Co-ordinator", tasks: 2 },
        ],
      },
      {
        id: "me", initials: "ME", name: "Maya Evans", role: "Workstream 2 Lead", tasks: 2,
      },
      {
        id: "jp", initials: "JP", name: "Jake Price", role: "Workstream 3 Lead", tasks: 2,
      },
    ],
  },
  vendor: {
    id: "jp", initials: "JP", name: "Jake Price", role: "Procurement Lead", tasks: 2,
    children: [
      {
        id: "ak", initials: "AK", name: "Alex Khan", role: "Vendor Manager", tasks: 3,
        children: [
          { id: "sr", initials: "SR", name: "Sam Russo", role: "Contract Specialist", tasks: 1 },
        ],
      },
    ],
  },
  platform: {
    id: "me", initials: "ME", name: "Maya Evans", role: "Platform Lead", tasks: 3,
    children: [
      {
        id: "tk", initials: "TK", name: "Tom Kim", role: "Security Architect", tasks: 2,
        children: [
          { id: "lp", initials: "LP", name: "Laura Park", role: "Infrastructure Eng.", tasks: 2 },
        ],
      },
    ],
  },
  analytics: {
    id: "ak", initials: "AK", name: "Alex Khan", role: "Analytics Lead", tasks: 0,
    children: [
      { id: "jr", initials: "JR", name: "Jack Reed", role: "Data Engineer", tasks: 0 },
      { id: "me", initials: "ME", name: "Maya Evans", role: "BI Developer", tasks: 0 },
    ],
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
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[9px] font-bold text-[var(--color-muted)]">
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
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3.5">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
            <span className="text-xs font-medium text-neutral-700">All clear</span>
          </div>
        ) : (
          <div className="space-y-2">
            {data.attentionItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenTask(attentionToPanel(item, projectName))}
                className={`group w-full rounded-xl border border-[var(--color-border)] bg-white p-4 text-left transition-colors hover:bg-neutral-50/50 border-l-2 ${
                  item.severity === "overdue" ? "border-l-red-400" : "border-l-amber-400"
                }`}
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
      bg: "bg-white border-[var(--color-border)]",
    },
    {
      label: "Completed",
      value: completed,
      cls: "text-emerald-600",
      bg: "bg-white border-[var(--color-border)]",
    },
    {
      label: "In Progress",
      value: inProgress,
      cls: "text-neutral-900",
      bg: "bg-white border-[var(--color-border)]",
    },
    {
      label: "Overdue",
      value: overdue,
      cls: "text-red-500",
      bg: "bg-white border-[var(--color-border)]",
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={({ active, payload }: any) => {
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
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[7px] font-bold text-[var(--color-muted)] ring-1 ring-white"
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

/* ─── Org chart tab ───────────────────────────────────────────────────────── */

function OrgCard({ node, depth }: { node: OrgNode; depth: number }) {
  const isRoot = depth === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: depth * 0.07 }}
      className="flex flex-col items-center"
    >
      <div className="w-36 rounded-2xl border border-[var(--color-border)] bg-white p-4 text-center shadow-sm">
        {/* Avatar */}
        <div
          className={`mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${
            isRoot
              ? "bg-neutral-900 text-white"
              : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]"
          }`}
        >
          {node.initials}
        </div>
        {/* Name */}
        <p className="text-xs font-semibold leading-tight text-neutral-900">
          {node.name}
        </p>
        {/* Role */}
        <p className="mt-0.5 text-[10px] leading-tight text-neutral-500">
          {node.role}
        </p>
        {/* Task chip */}
        {node.tasks > 0 && (
          <span className="mt-2 inline-flex items-center rounded-full bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-[9px] font-semibold text-neutral-500">
            {node.tasks} task{node.tasks !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function OrgBranch({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const children = node.children ?? [];
  const n = children.length;

  return (
    <div className="flex flex-col items-center gap-0">
      <OrgCard node={node} depth={depth} />

      {n > 0 && (
        <>
          {/* Vertical line down from parent */}
          <div className="w-px bg-[var(--color-border)]" style={{ height: 28 }} />

          {/* Horizontal connector spanning all children */}
          <div className="relative flex w-full justify-center">
            {n > 1 && (
              <div
                className="absolute top-0 h-px bg-[var(--color-border)]"
                style={{
                  left: `${100 / (2 * n)}%`,
                  right: `${100 / (2 * n)}%`,
                }}
              />
            )}
            {/* Children */}
            <div
              className="flex gap-6"
              style={{ paddingTop: n > 1 ? 1 : 0 }}
            >
              {children.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Vertical line down from connector to child */}
                  <div className="w-px bg-[var(--color-border)]" style={{ height: 28 }} />
                  <OrgBranch node={child} depth={depth + 1} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OrgChartTab({ projectId }: { projectId: string }) {
  const root = ORG_DATA[projectId] ?? ORG_DATA["alpha"];
  const totalMembers = countNodes(root);

  function countNodes(n: OrgNode): number {
    return 1 + (n.children ?? []).reduce((s, c) => s + countNodes(c), 0);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">
            Team Structure
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {totalMembers} member{totalMembers !== 1 ? "s" : ""} · project hierarchy
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="overflow-x-auto pb-8">
        <div className="inline-flex min-w-full justify-center">
          <OrgBranch node={root} depth={0} />
        </div>
      </div>
    </div>
  );
}

/* ─── Documents tab ───────────────────────────────────────────────────────── */

type DocType = "pdf" | "doc" | "sheet" | "image" | "other";

interface ProjectDocument {
  id: string;
  name: string;
  type: DocType;
  size: string;
  uploader: string;
  date: string;
}

const INITIAL_DOCUMENTS: ProjectDocument[] = [
  { id: "d1", name: "Project Charter.pdf",         type: "pdf",   size: "1.2 MB", uploader: "LP", date: "Mar 15" },
  { id: "d2", name: "Technical Spec v2.docx",       type: "doc",   size: "845 KB", uploader: "TK", date: "Mar 17" },
  { id: "d3", name: "Budget Breakdown Q1.xlsx",     type: "sheet", size: "320 KB", uploader: "JP", date: "Mar 18" },
  { id: "d4", name: "Architecture Diagram.png",     type: "image", size: "2.4 MB", uploader: "TK", date: "Mar 10" },
  { id: "d5", name: "Risk Register.pdf",            type: "pdf",   size: "560 KB", uploader: "SR", date: "Mar 12" },
];

function docTypeIcon(type: DocType) {
  const cls = "shrink-0";
  switch (type) {
    case "pdf":   return <FileText   size={16} className={cls} />;
    case "doc":   return <FileText   size={16} className={cls} />;
    case "sheet": return <FileSpreadsheet size={16} className={cls} />;
    case "image": return <FileImage  size={16} className={cls} />;
    default:      return <File       size={16} className={cls} />;
  }
}

function inferType(name: string): DocType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab() {
  const [docs, setDocs] = useState<ProjectDocument[]>(INITIAL_DOCUMENTS);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const newDocs: ProjectDocument[] = Array.from(files).map((f) => ({
      id: `d${Date.now()}-${Math.random()}`,
      name: f.name,
      type: inferType(f.name),
      size: formatBytes(f.size),
      uploader: "ME",
      date: dateStr,
    }));
    setDocs((prev) => [...newDocs, ...prev]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeDoc = (id: string) =>
    setDocs((prev) => prev.filter((d) => d.id !== id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900">Documents</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {docs.length} file{docs.length !== 1 ? "s" : ""} · project workspace
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.18, ease: EASE }}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
        >
          <Upload size={13} />
          Upload
        </motion.button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        animate={{ borderColor: dragging ? "var(--color-brand)" : "var(--color-border)" }}
        transition={{ duration: 0.15 }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white py-10 transition-colors hover:bg-neutral-50/60"
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors ${dragging ? "border-[var(--color-brand)]/30 bg-[var(--color-brand)]/5" : ""}`}>
          <Upload size={18} className={dragging ? "text-[var(--color-brand)]" : "text-neutral-400"} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-700">
            {dragging ? "Drop to upload" : "Drop files here"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            or click to browse — PDF, Word, Excel, images
          </p>
        </div>
      </motion.div>

      {/* File list */}
      {docs.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_52px_80px_44px] gap-3 border-b border-[var(--color-border)] px-5 py-2.5">
            {["Name", "Size", "By", "Added", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                {h}
              </span>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {docs.map((doc, idx) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="overflow-hidden"
              >
                <div
                  className={`group grid grid-cols-[1fr_80px_52px_80px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-neutral-50/60 ${
                    idx !== docs.length - 1 ? "border-b border-[var(--color-border)]" : ""
                  }`}
                >
                  {/* Name + icon */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-neutral-400">{docTypeIcon(doc.type)}</span>
                    <span className="truncate text-sm font-medium text-neutral-800">
                      {doc.name}
                    </span>
                  </div>

                  {/* Size */}
                  <span className="text-xs text-[var(--color-muted)] tabular-nums">
                    {doc.size}
                  </span>

                  {/* Uploader */}
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[8px] font-bold text-[var(--color-muted)]">
                    {doc.uploader}
                  </span>

                  {/* Date */}
                  <span className="text-xs text-[var(--color-muted)]">{doc.date}</span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      title="Download"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors"
                    >
                      <Download size={12} />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      title="Delete"
                      onClick={() => removeDoc(doc.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-neutral-400 hover:text-red-500 hover:border-red-200 transition-colors"
                    >
                      <Trash2 size={12} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {docs.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-4 text-center text-xs text-[var(--color-muted)]"
        >
          No documents yet. Upload the first one above.
        </motion.div>
      )}
    </div>
  );
}

/* ─── Tab definitions ─────────────────────────────────────────────────────── */

const TABS: { id: TabId; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
  { id: "overview",   label: "Overview",  Icon: LayoutDashboard },
  { id: "timeline",   label: "Timeline",  Icon: GanttChartSquare },
  { id: "analytics",  label: "Analytics", Icon: BarChart2 },
  { id: "meetings",   label: "Meetings",  Icon: Video },
  { id: "orgchart",   label: "Org Chart", Icon: Network },
  { id: "documents",  label: "Documents", Icon: FolderOpen },
];

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

interface ApiTask {
  id: string;
  title: string;
  status: "backlog" | "not_started" | "in_progress" | "waiting" | "completed" | "blocked";
  dueDate: string | null;
}

function mapApiTasks(apiTasks: ApiTask[]): WorkspaceData {
  const now = new Date();
  const tasks: Task[] = apiTasks.map((t) => {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const isOverdue = due && due < now && t.status !== "completed";
    let status: TaskStatus;
    if (t.status === "completed") status = "done";
    else if (isOverdue || t.status === "blocked") status = "overdue";
    else status = "pending";
    return {
      id: t.id,
      title: t.title,
      owner: "—",
      due: t.dueDate
        ? new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "—",
      status,
    };
  });

  const done = tasks.filter((t) => t.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const attentionItems: AttentionItem[] = tasks
    .filter((t) => t.status === "overdue")
    .slice(0, 5)
    .map((t) => ({ id: t.id, title: t.title, owner: t.owner, due: t.due, severity: "overdue" as Severity }));

  return { progress, phases: [], attentionItems, tasks };
}

const EMPTY_DATA: WorkspaceData = { progress: 0, phases: [], attentionItems: [], tasks: [] };

export function ProjectWorkspace({
  projectId,
  projectName,
  onBack,
}: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedTask, setSelectedTask] = useState<TaskPanelData | null>(null);
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);

  const fetchTasks = useCallback(() => {
    fetch(`/api/workspace/tasks?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { items?: ApiTask[] }) => {
        if (Array.isArray(body.items)) {
          setData(mapApiTasks(body.items));
        }
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
    window.addEventListener("larry:refresh-snapshot", fetchTasks);
    return () => window.removeEventListener("larry:refresh-snapshot", fetchTasks);
  }, [fetchTasks]);

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
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white">
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
              ) : activeTab === "meetings" ? (
                <div className="mx-auto max-w-4xl">
                  <MeetingsTab />
                </div>
              ) : activeTab === "orgchart" ? (
                <div className="mx-auto max-w-5xl">
                  <OrgChartTab projectId={projectId} />
                </div>
              ) : (
                <div className="mx-auto max-w-4xl">
                  <DocumentsTab />
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
