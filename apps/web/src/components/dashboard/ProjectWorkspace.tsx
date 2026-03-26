"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import {
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import type { BoardTaskRow, TaskGroup, TaskStatus, WorkspaceTask } from "@/app/dashboard/types";
import { TaskDetailDrawer } from "@/app/workspace/projects/[projectId]/TaskDetailDrawer";
import { useProjectData } from "@/hooks/useProjectData";
import { StatusChip } from "./StatusChip";
import { TaskTable } from "./TaskTable";

type TabId = "overview" | "timeline" | "analytics" | "meetings" | "orgchart" | "documents";

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

interface TimelineRow extends BoardTaskRow {
  start: Date;
  end: Date;
  left: number;
  width: number;
  spanDays: number;
}

const TAB_OPTIONS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Tasks" },
  { id: "timeline", label: "Timeline" },
  { id: "analytics", label: "Analytics" },
  { id: "meetings", label: "Meetings" },
  { id: "orgchart", label: "Team" },
  { id: "documents", label: "Documents" },
];

const GROUP_ORDER: TaskGroup["key"][] = ["in_progress", "todo", "blocked", "completed"];

const STATUS_TO_GROUP: Record<TaskStatus, TaskGroup["key"]> = {
  backlog: "todo",
  not_started: "todo",
  in_progress: "in_progress",
  waiting: "todo",
  blocked: "blocked",
  completed: "completed",
};

const GROUP_META: Record<
  TaskGroup["key"],
  Pick<TaskGroup, "label" | "accentClass" | "targetStatus">
> = {
  in_progress: {
    label: "In Progress",
    accentClass: "border-l-[4px] border-l-[#FDAB3D]",
    targetStatus: "in_progress",
  },
  todo: {
    label: "Not Started",
    accentClass: "border-l-[4px] border-l-[#0073EA]",
    targetStatus: "not_started",
  },
  blocked: {
    label: "Blocked",
    accentClass: "border-l-[4px] border-l-[#E2445C]",
    targetStatus: "blocked",
  },
  completed: {
    label: "Done",
    accentClass: "border-l-[4px] border-l-[#00C875]",
    targetStatus: "completed",
  },
};

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(value: string | null | undefined): string {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function clampProgress(value: number | null | undefined, status: TaskStatus): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  return status === "completed" ? 100 : 0;
}

function toBoardTask(task: WorkspaceTask): BoardTaskRow {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    startDate: task.startDate ?? null,
    riskLevel: task.riskLevel ?? "low",
    progressPercent: clampProgress(task.progressPercent, task.status),
    assigneeUserId: task.assigneeUserId ?? null,
    assigneeName: task.assigneeName ?? null,
  };
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function buildTimeline(rows: BoardTaskRow[]): {
  dated: TimelineRow[];
  undated: BoardTaskRow[];
  markers: Array<{ label: string; left: number }>;
} {
  const datedSeed = rows
    .filter((task) => task.startDate && task.dueDate)
    .map((task) => ({
      ...task,
      start: new Date(task.startDate as string),
      end: new Date(task.dueDate as string),
    }))
    .filter((task) => !Number.isNaN(task.start.getTime()) && !Number.isNaN(task.end.getTime()))
    .map((task) => ({
      ...task,
      end: task.end < task.start ? task.start : task.end,
    }));

  const undated = rows.filter((task) => !task.startDate || !task.dueDate);

  if (datedSeed.length === 0) {
    return { dated: [], undated, markers: [] };
  }

  const minStart = datedSeed.reduce(
    (current, task) => (task.start < current ? task.start : current),
    datedSeed[0].start
  );
  const maxEnd = datedSeed.reduce(
    (current, task) => (task.end > current ? task.end : current),
    datedSeed[0].end
  );

  const totalDays = Math.max(
    1,
    Math.ceil((maxEnd.getTime() - minStart.getTime()) / 86_400_000) + 1
  );
  const markerCount = totalDays < 5 ? totalDays + 1 : 6;
  const markers = Array.from({ length: markerCount }, (_, index) => {
    const ratio = markerCount === 1 ? 0 : index / (markerCount - 1);
    const dayOffset = Math.round(ratio * Math.max(totalDays - 1, 0));
    return {
      label: formatShortDate(addDays(minStart, dayOffset).toISOString()),
      left: ratio * 100,
    };
  });

  const dated = datedSeed
    .map((task) => {
      const offsetDays = Math.max(
        0,
        Math.floor((task.start.getTime() - minStart.getTime()) / 86_400_000)
      );
      const spanDays = Math.max(
        1,
        Math.ceil((task.end.getTime() - task.start.getTime()) / 86_400_000) + 1
      );
      return {
        ...task,
        spanDays,
        left: (offsetDays / totalDays) * 100,
        width: Math.max((spanDays / totalDays) * 100, 4),
      };
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  return { dated, undated, markers };
}

function statusBarClass(status: TaskStatus): string {
  switch (status) {
    case "completed":
      return "bg-[#00C875] text-[#04150d]";
    case "blocked":
      return "bg-[#E2445C] text-white";
    case "in_progress":
      return "bg-[#FDAB3D] text-[#221500]";
    case "waiting":
      return "bg-[#0073EA] text-white";
    default:
      return "bg-[#5c6b82] text-white";
  }
}

function projectStatusPillClass(status: string | undefined): string {
  switch (status) {
    case "completed": return "pm-pill-done";
    case "blocked": return "pm-pill-stuck";
    case "in_progress": return "pm-pill-working";
    default: return "pm-pill-not-started";
  }
}

interface Member {
  id: string;
  name: string;
  email: string;
}

interface AddTaskPayload {
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  assigneeUserId: string;
}

function AddTaskModal({
  group,
  onClose,
  onSave,
}: {
  group: TaskGroup;
  onClose: () => void;
  onSave: (group: TaskGroup, payload: AddTaskPayload) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workspace/members")
      .then((r) => r.json())
      .then((data: { members?: Member[] }) => {
        if (Array.isArray(data.members)) setMembers(data.members);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSave(group, {
        title: title.trim(),
        description: description.trim(),
        dueDate,
        priority,
        assigneeUserId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-[24px] border border-[var(--pm-border)] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--pm-border)] px-6 py-4">
            <h2 className="text-[16px] font-semibold text-[var(--pm-text)]">
              Add task — {group.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
            {error && (
              <p className="rounded-lg bg-[#fff3f5] px-3 py-2 text-[13px] text-[#b42336]">{error}</p>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                Task title <span className="text-[#E2445C]">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full rounded-xl border border-[var(--pm-border)] bg-white px-3 py-2 text-[14px] text-[var(--pm-text)] outline-none focus:border-[#0073EA]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details…"
                rows={2}
                className="w-full resize-none rounded-xl border border-[var(--pm-border)] bg-white px-3 py-2 text-[13px] text-[var(--pm-text)] outline-none focus:border-[#0073EA]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--pm-border)] bg-white px-3 py-2 text-[13px] text-[var(--pm-text)] outline-none focus:border-[#0073EA]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-xl border border-[var(--pm-border)] bg-white px-3 py-2 text-[13px] text-[var(--pm-text)] outline-none focus:border-[#0073EA]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                Assign to
              </label>
              <select
                value={assigneeUserId}
                onChange={(e) => setAssigneeUserId(e.target.value)}
                className="w-full rounded-xl border border-[var(--pm-border)] bg-white px-3 py-2 text-[13px] text-[var(--pm-text)] outline-none focus:border-[#0073EA]"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-[#0073EA] py-2 text-[13px] font-semibold text-white disabled:opacity-50 hover:bg-[#0060c2]"
              >
                {submitting ? "Creating…" : "Create task"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--pm-border)] px-4 py-2 text-[13px] font-medium text-[var(--pm-text-secondary)] hover:bg-[var(--pm-gray-light)]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-8 text-center">
      <p className="text-[14px] font-semibold text-[var(--pm-text)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] text-[var(--pm-text-muted)]">{description}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 pm-shimmer"
          />
        ))}
      </div>
      <div className="h-[480px] pm-shimmer" />
    </div>
  );
}

export function ProjectWorkspace({
  projectId,
  projectName,
  onBack,
}: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedTask, setSelectedTask] = useState<BoardTaskRow | null>(null);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [addingGroup, setAddingGroup] = useState<TaskGroup | null>(null);
  const {
    project,
    tasks,
    health,
    actions,
    meetings,
    outcomes,
    loading,
    error,
    refresh,
  } = useProjectData(projectId);

  const boardTasks = useMemo(() => tasks.map(toBoardTask), [tasks]);
  const groupedTasks = useMemo<TaskGroup[]>(
    () =>
      GROUP_ORDER.map((groupKey) => ({
        key: groupKey,
        ...GROUP_META[groupKey],
        tasks: boardTasks.filter((task) => STATUS_TO_GROUP[task.status] === groupKey),
      })),
    [boardTasks]
  );
  const timeline = useMemo(() => buildTimeline(boardTasks), [boardTasks]);

  const openCount = boardTasks.filter((task) => task.status !== "completed").length;
  const blockedCount = boardTasks.filter((task) => task.status === "blocked").length;
  const completionRate =
    typeof health?.completionRate === "number"
      ? Math.round(Number(health.completionRate) * 100)
      : boardTasks.length > 0
        ? Math.round((boardTasks.filter((task) => task.status === "completed").length / boardTasks.length) * 100)
        : 0;
  const surfaceName = project?.name ?? projectName;
  const riskLabel = (health?.riskLevel ?? project?.riskLevel ?? "low").replace("_", " ");

  const ownerRows = useMemo(() => {
    const counts = new Map<string, { count: number; blocked: number }>();
    for (const task of boardTasks) {
      const owner = task.assigneeName ?? "Unassigned";
      const current = counts.get(owner) ?? { count: 0, blocked: 0 };
      current.count += 1;
      if (task.status === "blocked") current.blocked += 1;
      counts.set(owner, current);
    }
    return [...counts.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [boardTasks]);

  async function handleAddTask(group: TaskGroup, payload: {
    title: string;
    description: string;
    dueDate: string;
    priority: string;
    assigneeUserId: string;
  }) {
    setTaskBusy(true);
    setInlineMessage(null);

    try {
      const body: Record<string, unknown> = {
        projectId,
        title: payload.title,
        priority: payload.priority,
      };
      if (payload.description) body.description = payload.description;
      if (payload.dueDate) body.dueDate = payload.dueDate;
      if (payload.assigneeUserId) body.assigneeUserId = payload.assigneeUserId;

      const createResponse = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const createPayload = (await createResponse.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!createResponse.ok || !createPayload.id) {
        throw new Error(createPayload.error ?? "Could not create task.");
      }

      if (group.targetStatus !== "not_started") {
        const progressPercent =
          group.targetStatus === "completed" ? 100
          : group.targetStatus === "in_progress" ? 35
          : 0;
        await fetch(`/api/workspace/tasks/${createPayload.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: group.targetStatus, progressPercent }),
        });
      }

      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      await refresh();
    } catch (taskError) {
      setInlineMessage(
        taskError instanceof Error ? taskError.message : "Could not create task right now."
      );
    } finally {
      setTaskBusy(false);
    }
  }

  function handleAddGroup() {
    setInlineMessage("Custom groups are next up. For launch, tasks stay in the four live status lanes.");
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await fetch(`/api/workspace/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await refresh();
  };

  const renderedBody = () => {
    if (loading && boardTasks.length === 0 && meetings.length === 0) {
      return <LoadingSkeleton />;
    }

    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-5">
            {/* Compact metric pills */}
            <div className="flex items-center gap-6 mb-4">
              {[
                { label: "Open tasks", value: String(openCount) },
                { label: "Pending approvals", value: String(actions.length) },
                { label: "Blocked", value: String(blockedCount) },
                { label: "Completion", value: `${completionRate}%` },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-start">
                  <span className="text-body-sm">{label}</span>
                  <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", lineHeight: "1.2" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Stacked progress bar */}
            <div className="pm-summary-bar mb-4 w-full">
              <span
                style={{
                  background: "var(--pm-green)",
                  width: `${(boardTasks.filter((t) => t.status === "completed").length / Math.max(boardTasks.length, 1)) * 100}%`,
                }}
              />
              <span
                style={{
                  background: "var(--pm-orange)",
                  width: `${(boardTasks.filter((t) => t.status === "in_progress").length / Math.max(boardTasks.length, 1)) * 100}%`,
                }}
              />
              <span
                style={{
                  background: "var(--pm-red)",
                  width: `${(boardTasks.filter((t) => t.status === "blocked").length / Math.max(boardTasks.length, 1)) * 100}%`,
                }}
              />
              <span style={{ flex: 1, background: "var(--surface-2)" }} />
            </div>

            <TaskTable
              groups={groupedTasks}
              onTaskClick={setSelectedTask}
              onOpenAddTask={(group) => setAddingGroup(group)}
              onAddGroup={handleAddGroup}
              onStatusChange={handleStatusChange}
            />
          </div>
        );

      case "timeline":
        if (timeline.dated.length === 0 && timeline.undated.length === 0) {
          return (
            <EmptyPanel
              title="No timeline yet"
              description="Add tasks with start and due dates to lay out the project plan. Undated tasks will collect underneath so nothing goes missing."
            />
          );
        }

        return (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[24px] border border-[var(--pm-border)] bg-white">
              <div className="grid grid-cols-[240px_minmax(0,1fr)] border-b border-[var(--pm-border)] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                <span>Task lane</span>
                <div className="relative flex h-6 items-center">
                  {timeline.markers.map((marker) => (
                    <span
                      key={`${marker.label}-${marker.left}`}
                      className="absolute -translate-x-1/2 text-[11px] text-[var(--pm-text-muted)]"
                      style={{ left: `${marker.left}%` }}
                    >
                      {marker.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-3 p-5">
                {timeline.dated.map((task) => (
                  <div
                    key={task.id}
                    className="grid grid-cols-[240px_minmax(0,1fr)] items-center gap-4"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="rounded-[18px] border border-[var(--pm-border)] bg-white p-4 text-left transition-colors hover:border-[var(--pm-border)] hover:bg-[var(--pm-gray-light)]"
                    >
                      <p className="text-[14px] font-semibold text-[var(--pm-text)]">{task.title}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <StatusChip status={task.status} />
                      </div>
                      <p className="mt-3 text-[12px] text-[var(--pm-text-muted)]">
                        {formatLongDate(task.startDate)} to {formatLongDate(task.dueDate)}
                      </p>
                    </button>

                    <div className="relative h-14 rounded-[18px] border border-[var(--pm-border)] bg-[var(--pm-gray-light)]">
                      <div className="absolute inset-y-0 left-0 right-0 flex">
                        {timeline.markers.map((marker) => (
                          <span
                            key={`${task.id}-${marker.left}`}
                            className="absolute inset-y-2 w-px bg-[var(--pm-border)]"
                            style={{ left: `${marker.left}%` }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTask(task)}
                        className={`absolute top-2 bottom-2 flex min-w-[88px] items-center rounded-[14px] px-3 text-left text-[12px] font-semibold shadow-[0_10px_24px_rgba(0,0,0,0.2)] transition-transform hover:scale-[1.01] ${statusBarClass(task.status)}`}
                        style={{
                          left: `${Math.min(task.left, 96)}%`,
                          width: `${Math.min(task.width, 100 - task.left)}%`,
                        }}
                      >
                        <span className="truncate">{task.spanDays} day{task.spanDays === 1 ? "" : "s"}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {timeline.undated.length > 0 && (
              <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                      No dates set
                    </p>
                    <p className="mt-2 text-[14px] text-[var(--pm-text-muted)]">
                      These tasks are live, but they are not scheduled yet.
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--pm-border)] bg-white px-3 py-1 text-[12px] text-[var(--pm-text-secondary)]">
                    {timeline.undated.length} items
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {timeline.undated.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="rounded-[18px] border border-[var(--pm-border)] bg-white p-4 text-left transition-colors hover:border-[var(--pm-border)] hover:bg-[var(--pm-gray-light)]"
                    >
                      <p className="text-[14px] font-semibold text-[var(--pm-text)]">{task.title}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <StatusChip status={task.status} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "analytics":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                Health snapshot
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[20px] border border-[var(--pm-border)] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">Risk level</p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">{riskLabel}</p>
                </div>
                <div className="rounded-[20px] border border-[var(--pm-border)] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">Blocked count</p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">{String(health?.blockedCount ?? blockedCount)}</p>
                </div>
                <div className="rounded-[20px] border border-[var(--pm-border)] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">Task count</p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">{String(health?.taskCount ?? boardTasks.length)}</p>
                </div>
                <div className="rounded-[20px] border border-[var(--pm-border)] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">High-risk rate</p>
                  <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">{`${Math.round(Number(outcomes?.metrics?.highRiskTaskRate ?? 0) * 100)}%`}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                Larry readout
              </p>
              <p className="mt-4 text-[14px] leading-7 text-[var(--pm-text-secondary)]">
                {outcomes?.narrative ??
                  "Larry will surface a narrative once the project has enough task, risk, and approval history to summarise movement cleanly."}
              </p>
            </div>
          </div>
        );

      case "meetings":
        if (meetings.length === 0) {
          return (
            <EmptyPanel
              title="No meeting notes yet"
              description="Meeting summaries will appear here as soon as transcripts or calendar ingests are processed for this project."
            />
          );
        }

        return (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <article
                key={meeting.id}
                style={{
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "16px 20px",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--pm-text)]">
                      {meeting.title ?? "Meeting note"}
                    </p>
                    <p className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[var(--pm-text-muted)]">
                      {meeting.meetingDate ? formatLongDate(meeting.meetingDate) : formatRelativeTime(meeting.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--pm-border)] bg-white px-3 py-1 text-[12px] text-[var(--pm-text-secondary)]">
                    {meeting.actionCount} action{meeting.actionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-4 text-[14px] leading-7 text-[var(--pm-text-secondary)]">
                  {meeting.summary ?? "Transcript captured. Summary is still processing."}
                </p>
              </article>
            ))}
          </div>
        );

      case "orgchart":
        if (ownerRows.length === 0) {
          return (
            <EmptyPanel
              title="No ownership data yet"
              description="Assign tasks to teammates and Larry will start building a real ownership map here."
            />
          );
        }

        return (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <div
              className="pm-table-header"
              style={{ gridTemplateColumns: "minmax(0,1fr) 100px 100px 140px" }}
            >
              <span>Member</span>
              <span>Assigned</span>
              <span>Blocked</span>
              <span>Progress</span>
            </div>
            {ownerRows.map((owner) => (
              <div
                key={owner.name}
                className="pm-table-row"
                style={{ gridTemplateColumns: "minmax(0,1fr) 100px 100px 140px" }}
              >
                <span className="text-h3">{owner.name}</span>
                <span className="text-body-sm">{owner.count}</span>
                <span
                  className="text-body-sm"
                  style={{ color: owner.blocked > 0 ? "var(--pm-red)" : undefined }}
                >
                  {owner.blocked}
                </span>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: "var(--cta)",
                      width: `${Math.max((owner.count / Math.max(boardTasks.length, 1)) * 100, 4)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        );

      case "documents":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                Current launch scope
              </p>
              <p className="mt-4 text-[14px] leading-7 text-[var(--pm-text-secondary)]">
                The launch workspace is anchored on tasks, approvals, and meeting extraction. We are deliberately not showing synthetic file libraries here until document sync is connected for real.
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--pm-border)] bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pm-text-muted)]">
                Signals already available
              </p>
              <div className="mt-5 space-y-3 text-[14px] text-[var(--pm-text-secondary)]">
                <div className="flex items-center justify-between rounded-[18px] border border-[var(--pm-border)] bg-white px-4 py-3">
                  <span>Tasks indexed</span>
                  <strong className="text-[var(--pm-text)]">{boardTasks.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-[18px] border border-[var(--pm-border)] bg-white px-4 py-3">
                  <span>Meeting summaries</span>
                  <strong className="text-[var(--pm-text)]">{meetings.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-[18px] border border-[var(--pm-border)] bg-white px-4 py-3">
                  <span>Pending approvals</span>
                  <strong className="text-[var(--pm-text)]">{actions.length}</strong>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--pm-bg)]">
      {/* Project header */}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "16px 24px" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-h1"
              contentEditable={false}
              suppressContentEditableWarning
            >
              {surfaceName}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`pm-pill ${projectStatusPillClass(project?.status)}`}>
                {project?.status ?? "active"}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  background: "var(--surface-2)",
                  borderRadius: "20px",
                  padding: "2px 8px",
                }}
              >
                Risk: {riskLabel}
              </span>
              <span className="text-body-sm">Updated {formatRelativeTime(project?.updatedAt)}</span>
            </div>
          </div>
          {project?.targetDate && (
            <div className="text-body-sm shrink-0">
              Target: {formatShortDate(project.targetDate)}
            </div>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "0 24px",
          display: "flex",
        }}
      >
        {TAB_OPTIONS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: active ? "var(--text-1)" : "var(--text-muted)",
                borderBottom: active ? "2px solid var(--cta)" : "2px solid transparent",
                padding: "8px 4px",
                marginRight: "20px",
                background: "none",
                border: "none",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: active ? "var(--cta)" : "transparent",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-[18px] border border-[#f5c2cb] bg-[#fff3f5] px-4 py-3 text-[#9f1d35]">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span className="text-[13px]">{error}</span>
          </div>
        )}

        {inlineMessage && (
          <div className="mb-4 flex items-start gap-3 rounded-[18px] border border-[var(--pm-border)] bg-[#eef5ff] px-4 py-3 text-[var(--pm-text-secondary)]">
            <Plus size={16} className="mt-0.5 shrink-0" />
            <span className="text-[13px]">{inlineMessage}</span>
          </div>
        )}

        {taskBusy && (
          <div className="mb-4 rounded-[18px] border border-[var(--pm-border)] bg-[#eef5ff] px-4 py-3 text-[13px] text-[var(--pm-text-secondary)]">
            Updating workspace...
          </div>
        )}

        {renderedBody()}
      </main>

      {addingGroup && (
        <AddTaskModal
          group={addingGroup}
          onClose={() => setAddingGroup(null)}
          onSave={handleAddTask}
        />
      )}

      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
