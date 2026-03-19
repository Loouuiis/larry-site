"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, GripVertical, Plus } from "lucide-react";
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
}

function statusPill(status: TaskStatus): { label: string; className: string } {
  if (status === "completed") return { label: "Done", className: "bg-[#00C875] text-white" };
  if (status === "in_progress" || status === "waiting")
    return { label: "Working on it", className: "bg-[#FDAB3D] text-white" };
  if (status === "blocked") return { label: "Stuck", className: "bg-[#E2445C] text-white" };
  return { label: "Not Started", className: "bg-[#C4C4C4] text-slate-900" };
}

function priorityLabel(priority: BoardTaskRow["priority"]): string {
  if (priority === "critical") return "Critical";
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function avatarForTask(task: BoardTaskRow): string {
  const raw = task.assigneeUserId || task.projectId || task.id;
  const letters = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  return letters || "PM";
}

function isOverdue(dateValue: string | null): boolean {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date.getTime() < now.getTime();
}

function formatDate(dateValue: string | null): string {
  if (!dateValue) return "No due date";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GroupSummary({ tasks }: { tasks: BoardTaskRow[] }) {
  const counts = useMemo(() => {
    const values = { done: 0, working: 0, stuck: 0, notStarted: 0 };
    for (const task of tasks) {
      if (task.status === "completed") values.done += 1;
      else if (task.status === "blocked") values.stuck += 1;
      else if (task.status === "in_progress" || task.status === "waiting") values.working += 1;
      else values.notStarted += 1;
    }
    return values;
  }, [tasks]);

  const total = tasks.length || 1;
  const pct = (value: number) => Math.round((value / total) * 100);

  const dueDates = tasks
    .map((task) => (task.dueDate ? new Date(task.dueDate) : null))
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const range =
    dueDates.length > 0
      ? `${dueDates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${dueDates[
          dueDates.length - 1
        ].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "No due dates";

  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
      <div className="h-2 w-[180px] overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-[#00C875]"
          style={{ width: `${pct(counts.done)}%`, float: "left" }}
        />
        <div
          className="h-full bg-[#FDAB3D]"
          style={{ width: `${pct(counts.working)}%`, float: "left" }}
        />
        <div
          className="h-full bg-[#E2445C]"
          style={{ width: `${pct(counts.stuck)}%`, float: "left" }}
        />
        <div
          className="h-full bg-[#C4C4C4]"
          style={{ width: `${pct(counts.notStarted)}%`, float: "left" }}
        />
      </div>
      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">{range}</span>
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
}: TaskTableProps) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const allTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);

  if (boardView === "kanban") {
    return (
      <div className="grid gap-3 lg:grid-cols-4">
        {groups.map((group) => (
          <section
            key={group.key}
            className="rounded-lg border border-slate-200 bg-white"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragTaskId) void onMoveTask(dragTaskId, group.targetStatus);
            }}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-sm font-semibold text-slate-800">{group.label}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{group.tasks.length}</span>
            </header>
            <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
              {group.tasks.map((task) => {
                const pill = statusPill(task.status);
                return (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragTaskId(null)}
                    className="cursor-grab rounded-md border border-slate-200 bg-slate-50 p-2.5"
                  >
                    <p className="text-sm font-medium text-slate-800">{task.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${pill.className}`}>{pill.label}</span>
                      <span className="text-[11px] text-slate-500">{formatDate(task.dueDate)}</span>
                    </div>
                  </article>
                );
              })}
              <button
                type="button"
                onClick={onAddTaskClick}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0073EA] hover:underline"
              >
                <Plus size={12} />
                Add task
              </button>
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (boardView === "gantt") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Timeline view</h3>
          <span className="text-xs text-slate-500">{allTasks.length} tasks</span>
        </div>
        <div className="space-y-3">
          {allTasks.map((task) => {
            const width = Math.max(8, task.progressPercent);
            return (
              <div key={task.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(task.dueDate)}</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${task.status === "completed" ? "bg-[#00C875]" : "bg-[#0073EA]"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
          {allTasks.length === 0 && <p className="text-sm text-slate-500">No timeline data yet.</p>}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups[group.key];
        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragTaskId) void onMoveTask(dragTaskId, group.targetStatus);
            }}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => onToggleGroup(group.key)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800"
              >
                <span className={`inline-block h-4 w-1.5 rounded ${group.accentClass}`} />
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {group.label}
              </button>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{group.tasks.length}</span>
            </header>

            {!isCollapsed && (
              <>
                <div className="grid grid-cols-[36px_2fr_120px_140px_120px_130px_48px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span />
                  <span>Task</span>
                  <span>Owner</span>
                  <span>Status</span>
                  <span>Priority</span>
                  <span>Due date</span>
                  <span>AI</span>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {group.tasks.map((task) => {
                    const pill = statusPill(task.status);
                    const overdue = isOverdue(task.dueDate);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragTaskId(task.id)}
                        onDragEnd={() => setDragTaskId(null)}
                        className="grid cursor-grab grid-cols-[36px_2fr_120px_140px_120px_130px_48px] items-center border-b border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50"
                      >
                        <label className="inline-flex items-center justify-center">
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                        </label>

                        <div>
                          <p className="font-medium text-slate-800">{task.title}</p>
                          <p className="text-xs text-slate-500">Progress {task.progressPercent}%</p>
                        </div>

                        <div className="inline-flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                            {avatarForTask(task)}
                          </span>
                          <span className="text-xs text-slate-500">Owner</span>
                        </div>

                        <span className={`inline-flex w-fit rounded px-2 py-1 text-xs font-semibold ${pill.className}`}>
                          {pill.label}
                        </span>

                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                          <GripVertical size={12} />
                          {priorityLabel(task.priority)}
                        </span>

                        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                          {overdue ? (
                            <AlertTriangle size={13} className="text-[#E2445C]" />
                          ) : task.dueDate ? (
                            <CheckCircle2 size={13} className="text-[#00C875]" />
                          ) : (
                            <CalendarClock size={13} className="text-slate-400" />
                          )}
                          {formatDate(task.dueDate)}
                        </span>

                        <button
                          type="button"
                          disabled={triageBusyTaskId === task.id || moveBusyTaskId === task.id}
                          onClick={() =>
                            void onTaskTriage({
                              id: task.id,
                              projectId: task.projectId,
                              title: task.title,
                              status: task.status,
                              priority: task.priority,
                              dueDate: task.dueDate,
                            })
                          }
                          className="h-8 rounded border border-slate-300 px-2 text-[11px] font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50"
                        >
                          {triageBusyTaskId === task.id ? "..." : "AI"}
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={onAddTaskClick}
                    className="inline-flex w-full items-center gap-1 px-4 py-2 text-xs font-medium text-[#0073EA] hover:bg-slate-50"
                  >
                    <Plus size={12} />
                    Add task
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
