"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Plus, Sparkles } from "lucide-react";
import { BoardTaskRow, BoardView, TaskGroup, TaskStatus, WorkspaceTask } from "./types";

interface TaskTableProps {
  boardView: BoardView;
  groups: TaskGroup[];
  collapsedGroups: Record<string, boolean>;
  moveBusyTaskId: string | null;
  triageBusyTaskId: string | null;
  onToggleGroup: (groupKey: string) => void;
  onMoveTask: (taskId: string, status: TaskStatus) => Promise<void> | void;
  onTaskTriage: (task: WorkspaceTask) => Promise<void> | void;
  onAddTaskClick: () => void;
  onTaskClick?: (task: BoardTaskRow) => void;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string }> = {
  not_started: { label: "Not started", bg: "bg-[#ebebeb] text-[#606060]" },
  on_track:    { label: "On track",    bg: "bg-[#a8c0e0] text-[#1a3f70]" },
  at_risk:     { label: "At risk",     bg: "bg-[#ece4a0] text-[#705800]" },
  overdue:     { label: "Overdue",     bg: "bg-[#ecaaaa] text-[#701818]" },
  completed:   { label: "Completed",   bg: "bg-[#b8d9b4] text-[#245820]" },
};

const GROUP_COLOR: Record<string, string> = {
  not_started: "#d6d6d6",
  on_track: "#8eb0d4",
  at_risk: "#d8cc70",
  overdue: "#d48888",
  completed: "#9dc898",
};

function getStatus(status: TaskStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
}

function priorityInfo(p: string): { dot: string; label: string } {
  if (p === "critical") return { dot: "bg-[var(--status-stuck-bg)]", label: "Critical" };
  if (p === "high") return { dot: "bg-[var(--status-wip-bg)]", label: "High" };
  if (p === "medium") return { dot: "bg-[var(--cta)]", label: "Medium" };
  return { dot: "bg-[#bdb7d0]", label: "Low" };
}

function initials(task: BoardTaskRow): string {
  return (task.assigneeUserId || task.projectId || task.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "PM";
}

function isOverdue(d: string | null): boolean {
  if (!d) return false;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date.getTime() < now.getTime();
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GroupSummary({ tasks }: { tasks: BoardTaskRow[] }) {
  const counts = useMemo(() => {
    const v = { done: 0, working: 0, stuck: 0, other: 0 };
    for (const t of tasks) {
      if (t.status === "completed") v.done++;
      else if (t.status === "overdue") v.stuck++;
      else if (t.status === "on_track") v.working++;
      else v.other++;
    }
    return v;
  }, [tasks]);

  const total = tasks.length || 1;
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;

  const dates = tasks
    .map(t => t.dueDate ? new Date(t.dueDate) : null)
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const range = dates.length > 0
    ? `${dates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${dates[dates.length - 1].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";

  return (
    <div className="flex items-center justify-between border-t border-[#e6e9ef] bg-[#f5f6f8] px-4 py-2">
      <div className="flex h-2 w-[200px] overflow-hidden rounded-full bg-[#e6e9ef]">
        <div style={{ width: pct(counts.done), background: "var(--status-done-bg)" }} />
        <div style={{ width: pct(counts.working), background: "var(--status-wip-bg)" }} />
        <div style={{ width: pct(counts.stuck), background: "var(--status-stuck-bg)" }} />
        <div style={{ width: pct(counts.other), background: "#bdb7d0" }} />
      </div>
      {range && (
        <span className="rounded-full border border-[#e6e9ef] bg-white px-2 py-0.5 text-[12px] text-[#9699a8]">{range}</span>
      )}
    </div>
  );
}

export function TaskTable({
  boardView,
  groups,
  collapsedGroups,
  moveBusyTaskId,
  triageBusyTaskId,
  onToggleGroup,
  onMoveTask,
  onTaskTriage,
  onAddTaskClick,
  onTaskClick,
}: TaskTableProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const allTasks = useMemo(() => groups.flatMap(g => g.tasks), [groups]);

  /* ─── Kanban ───────────────── */
  if (boardView === "kanban") {
    return (
      <div className="grid gap-3 p-4 lg:grid-cols-4">
        {groups.map(group => (
          <section
            key={group.key}
            className="overflow-hidden rounded-lg border border-[#e6e9ef] bg-white"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (dragTaskId) void onMoveTask(dragTaskId, group.targetStatus); }}
          >
            <header
              className="flex items-center justify-between border-b-[3px] px-3 py-2.5"
              style={{ borderBottomColor: GROUP_COLOR[group.key] ?? "#bdb7d0" }}
            >
              <span className="text-[14px] font-semibold text-[#323338]">{group.label}</span>
              <span className="rounded-full bg-[#f5f6f8] px-2 py-0.5 text-[12px] text-[#9699a8]">{group.tasks.length}</span>
            </header>
            <div className="max-h-[420px] space-y-2 overflow-y-auto p-2">
              {group.tasks.map(task => {
                const sc = getStatus(task.status);
                return (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragTaskId(null)}
                    className="cursor-grab rounded-lg border border-[#e6e9ef] bg-white p-3 transition-shadow hover:shadow-sm"
                  >
                    <p className="mb-2 text-[14px] font-medium text-[#323338]">{task.title}</p>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${sc.bg}`}>{sc.label}</span>
                      <span className="text-[12px] text-[#9699a8]">{fmtDate(task.dueDate)}</span>
                    </div>
                  </article>
                );
              })}
              <button type="button" onClick={onAddTaskClick} className="flex items-center gap-1 px-1 py-1 text-[13px] font-medium text-[var(--cta)] hover:underline">
                <Plus size={13} /> Add task
              </button>
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ─── Timeline ─────────────── */
  if (boardView === "gantt") {
    return (
      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-[#e6e9ef] bg-white">
          <div className="grid grid-cols-[2fr_110px_1fr] items-center border-b border-[#e6e9ef] bg-[#f5f6f8] px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-[#676879]">
            <span>Task</span>
            <span>Due date</span>
            <span>Progress</span>
          </div>
          {allTasks.map(task => {
            const w = Math.max(6, task.progressPercent);
            return (
              <div key={task.id} className="grid grid-cols-[2fr_110px_1fr] items-center border-b border-[#f0f1f3] px-4 py-2.5 text-[14px] transition-colors hover:bg-[#f8f9fb]">
                <span className="truncate pr-3 font-medium text-[#323338]">{task.title}</span>
                <span className="text-[13px] text-[#676879]">{fmtDate(task.dueDate)}</span>
                <div className="flex items-center gap-2">
                  <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#f5f6f8]">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: task.status === "completed" ? "var(--status-done-bg)" : "var(--cta)" }} />
                  </div>
                  <span className="w-8 text-right text-[12px] text-[#9699a8]">{task.progressPercent}%</span>
                </div>
              </div>
            );
          })}
          {allTasks.length === 0 && (
            <p className="px-4 py-6 text-center text-[14px] text-[#9699a8]">No timeline data yet.</p>
          )}
        </div>
      </div>
    );
  }

  /* ─── Table view ───────────── */
  return (
    <div>
      {groups.map(group => {
        const isCollapsed = collapsedGroups[group.key];
        const color = GROUP_COLOR[group.key] ?? "#bdb7d0";

        return (
          <section
            key={group.key}
            className="overflow-hidden border-b border-[#e6e9ef] bg-white"
            style={{ borderLeft: `4px solid ${color}` }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); if (dragTaskId) void onMoveTask(dragTaskId, group.targetStatus); }}
          >
            {/* Group header */}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2 text-[15px] font-semibold transition-colors hover:bg-[#f5f6f8]"
              onClick={() => onToggleGroup(group.key)}
            >
              {isCollapsed ? <ChevronRight size={16} style={{ color }} /> : <ChevronDown size={16} style={{ color }} />}
              <span style={{ color }}>{group.label}</span>
              <span className="text-[12px] font-normal text-[#9699a8]">{group.tasks.length} tasks</span>
            </button>

            {!isCollapsed && (
              <>
                {/* Column headers */}
                <div className="grid grid-cols-[2fr_90px_130px_90px_110px_40px] items-center border-b border-[#e6e9ef] bg-[#f5f6f8] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#676879]">
                  <span>Task</span>
                  <span>Owner</span>
                  <span className="text-center">Status</span>
                  <span>Priority</span>
                  <span>Due date</span>
                  <span className="text-center">AI</span>
                </div>

                {/* Task rows */}
                <div className="max-h-[360px] overflow-y-auto">
                  {group.tasks.map(task => {
                    const sc = getStatus(task.status);
                    const overdue = isOverdue(task.dueDate);
                    const pd = priorityInfo(task.priority);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragTaskId(task.id)}
                        onDragEnd={() => setDragTaskId(null)}
                        onClick={() => onTaskClick?.(task)}
                        className="grid cursor-pointer grid-cols-[2fr_90px_130px_90px_110px_40px] items-center border-b border-[#f0f1f3] px-4 py-2 text-[14px] transition-colors hover:bg-[#f8f9fb]"
                      >
                        {/* Task name */}
                        <span className="truncate pr-2 text-[#323338]">{task.title}</span>

                        {/* Owner avatar */}
                        <div className="flex items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E0E0FF] text-[11px] font-semibold text-[#5B5FC7]">
                            {initials(task)}
                          </span>
                        </div>

                        {/* Status pill */}
                        <div className="flex justify-center">
                          <span className={`inline-flex min-w-[100px] items-center justify-center rounded-full px-3 py-[3px] text-[12px] font-semibold ${sc.bg}`}>
                            {sc.label}
                          </span>
                        </div>

                        {/* Priority */}
                        <div className="flex items-center gap-1 text-[12px] text-[#676879]">
                          <span className={`h-2 w-2 rounded-full ${pd.dot}`} />
                          {pd.label}
                        </div>

                        {/* Due date */}
                        <div className="flex items-center gap-1.5 text-[13px] text-[#676879]">
                          {overdue ? (
                            <AlertTriangle size={14} className="text-[var(--status-stuck-bg)]" />
                          ) : task.dueDate ? (
                            <CheckCircle2 size={14} className="text-[var(--status-done-bg)]" />
                          ) : (
                            <CalendarClock size={14} className="text-[#9699a8]" />
                          )}
                          {fmtDate(task.dueDate) || "—"}
                        </div>

                        {/* AI triage */}
                        <button
                          type="button"
                          disabled={triageBusyTaskId === task.id || moveBusyTaskId === task.id}
                          onClick={() => void onTaskTriage({
                            id: task.id, projectId: task.projectId, title: task.title,
                            status: task.status, priority: task.priority, dueDate: task.dueDate,
                          })}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[#e6e9ef] text-purple-500 transition-colors hover:bg-purple-50 disabled:opacity-40"
                          title="AI Triage"
                        >
                          {triageBusyTaskId === task.id ? <span className="text-[11px]">...</span> : <Sparkles size={14} />}
                        </button>
                      </div>
                    );
                  })}

                  {/* Add task */}
                  <button
                    type="button"
                    onClick={onAddTaskClick}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-[var(--cta)] transition-colors hover:bg-[#f5f6f8]"
                  >
                    <Plus size={14} /> Add task
                  </button>
                </div>

                <GroupSummary tasks={group.tasks} />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
