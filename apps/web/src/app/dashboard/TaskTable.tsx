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
  completed: { label: "Done", bg: "bg-[#00C875] text-white" },
  in_progress: { label: "Working on it", bg: "bg-[#FDAB3D] text-white" },
  waiting: { label: "Working on it", bg: "bg-[#FDAB3D] text-white" },
  blocked: { label: "Stuck", bg: "bg-[#E2445C] text-white" },
  backlog: { label: "Not Started", bg: "bg-[#C4C4C4] text-[#323338]" },
  not_started: { label: "Not Started", bg: "bg-[#C4C4C4] text-[#323338]" },
};

const GROUP_COLOR: Record<string, string> = {
  todo: "#0073EA",
  in_progress: "#FDAB3D",
  blocked: "#E2445C",
  completed: "#00C875",
};

function getStatus(status: TaskStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
}

function priorityInfo(p: string): { dot: string; label: string } {
  if (p === "critical") return { dot: "bg-[#E2445C]", label: "Critical" };
  if (p === "high") return { dot: "bg-[#FDAB3D]", label: "High" };
  if (p === "medium") return { dot: "bg-[#0073EA]", label: "Medium" };
  return { dot: "bg-[#C4C4C4]", label: "Low" };
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
      else if (t.status === "blocked") v.stuck++;
      else if (t.status === "in_progress" || t.status === "waiting") v.working++;
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
        <div style={{ width: pct(counts.done), background: "#00C875" }} />
        <div style={{ width: pct(counts.working), background: "#FDAB3D" }} />
        <div style={{ width: pct(counts.stuck), background: "#E2445C" }} />
        <div style={{ width: pct(counts.other), background: "#C4C4C4" }} />
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
              style={{ borderBottomColor: GROUP_COLOR[group.key] ?? "#C4C4C4" }}
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
              <button type="button" onClick={onAddTaskClick} className="flex items-center gap-1 px-1 py-1 text-[13px] font-medium text-[#0073EA] hover:underline">
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
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: task.status === "completed" ? "#00C875" : "#0073EA" }} />
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
        const color = GROUP_COLOR[group.key] ?? "#C4C4C4";

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
                            <AlertTriangle size={14} className="text-[#E2445C]" />
                          ) : task.dueDate ? (
                            <CheckCircle2 size={14} className="text-[#00C875]" />
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
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-[#0073EA] transition-colors hover:bg-[#f5f6f8]"
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
