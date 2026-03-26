"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileText,
  FolderKanban,
  Network,
  Plus,
  TriangleAlert,
  Video,
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

const TAB_OPTIONS: Array<{
  id: TabId;
  label: string;
  icon: typeof FolderKanban;
}> = [
  { id: "overview", label: "Overview", icon: FolderKanban },
  { id: "timeline", label: "Timeline", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "meetings", label: "Meetings", icon: Video },
  { id: "orgchart", label: "Org Chart", icon: Network },
  { id: "documents", label: "Documents", icon: FileText },
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

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#182235] bg-[#0e1726] p-8 text-center">
      <p className="text-[14px] font-semibold text-[#eef3ff]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] text-[#8a97ae]">{description}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn" | "accent";
}) {
  const toneClass =
    tone === "warn"
      ? "border-[#3a2230] bg-[#161019]"
      : tone === "accent"
        ? "border-[#1d3145] bg-[#0f1b2b]"
        : "border-[#182235] bg-[#0d1523]";

  return (
    <div className={`rounded-[20px] border p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
        {label}
      </p>
      <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em] text-[#eef3ff]">
        {value}
      </p>
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
            className="h-28 animate-pulse rounded-[20px] border border-[#182235] bg-[#0d1523]"
          />
        ))}
      </div>
      <div className="h-[480px] animate-pulse rounded-[24px] border border-[#182235] bg-[#0d1523]" />
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

  async function handleAddTask(group: TaskGroup, title: string) {
    setTaskBusy(true);
    setInlineMessage(null);

    try {
      const createResponse = await fetch("/api/workspace/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title,
        }),
      });

      const createPayload = (await createResponse.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!createResponse.ok || !createPayload.id) {
        throw new Error(createPayload.error ?? "Could not create task.");
      }

      if (group.targetStatus !== "not_started") {
        const progressPercent = group.targetStatus === "completed" ? 100 : group.targetStatus === "in_progress" ? 35 : 0;
        const statusResponse = await fetch(`/api/workspace/tasks/${createPayload.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: group.targetStatus,
            progressPercent,
          }),
        });

        if (!statusResponse.ok) {
          throw new Error("Task was created but the status update did not stick.");
        }
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

  const renderedBody = () => {
    if (loading && boardTasks.length === 0 && meetings.length === 0) {
      return <LoadingSkeleton />;
    }

    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Open tasks" value={String(openCount)} tone="accent" />
              <MetricCard label="Pending approvals" value={String(actions.length)} />
              <MetricCard label="Blocked tasks" value={String(blockedCount)} tone={blockedCount > 0 ? "warn" : "neutral"} />
              <MetricCard label="Completion" value={`${completionRate}%`} />
            </div>
            <TaskTable
              groups={groupedTasks}
              onTaskClick={setSelectedTask}
              onAddTask={handleAddTask}
              onAddGroup={handleAddGroup}
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
            <div className="overflow-hidden rounded-[24px] border border-[#182235] bg-[#0d1523]">
              <div className="grid grid-cols-[240px_minmax(0,1fr)] border-b border-[#182235] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                <span>Task lane</span>
                <div className="relative flex h-6 items-center">
                  {timeline.markers.map((marker) => (
                    <span
                      key={`${marker.label}-${marker.left}`}
                      className="absolute -translate-x-1/2 text-[11px] text-[#8a97ae]"
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
                      className="rounded-[18px] border border-[#182235] bg-[#101a2b] p-4 text-left transition-colors hover:border-[#2b3951] hover:bg-[#131f33]"
                    >
                      <p className="text-[14px] font-semibold text-[#eef3ff]">{task.title}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <StatusChip status={task.status} />
                      </div>
                      <p className="mt-3 text-[12px] text-[#8a97ae]">
                        {formatLongDate(task.startDate)} to {formatLongDate(task.dueDate)}
                      </p>
                    </button>

                    <div className="relative h-14 rounded-[18px] border border-[#182235] bg-[#0f1827]">
                      <div className="absolute inset-y-0 left-0 right-0 flex">
                        {timeline.markers.map((marker) => (
                          <span
                            key={`${task.id}-${marker.left}`}
                            className="absolute inset-y-2 w-px bg-[#182235]"
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
              <div className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                      No dates set
                    </p>
                    <p className="mt-2 text-[14px] text-[#8a97ae]">
                      These tasks are live, but they are not scheduled yet.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#223047] bg-[#101a2b] px-3 py-1 text-[12px] text-[#c5d0e0]">
                    {timeline.undated.length} items
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {timeline.undated.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className="rounded-[18px] border border-[#182235] bg-[#101a2b] p-4 text-left transition-colors hover:border-[#2b3951] hover:bg-[#131f33]"
                    >
                      <p className="text-[14px] font-semibold text-[#eef3ff]">{task.title}</p>
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
            <div className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                Health snapshot
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <MetricCard label="Risk level" value={riskLabel} tone={riskLabel.includes("high") ? "warn" : "neutral"} />
                <MetricCard label="Blocked count" value={String(health?.blockedCount ?? blockedCount)} />
                <MetricCard label="Task count" value={String(health?.taskCount ?? boardTasks.length)} />
                <MetricCard label="High-risk rate" value={`${Math.round(Number(outcomes?.metrics?.highRiskTaskRate ?? 0) * 100)}%`} />
              </div>
            </div>

            <div className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                Larry readout
              </p>
              <p className="mt-4 text-[14px] leading-7 text-[#c5d0e0]">
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
                className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold tracking-[-0.03em] text-[#eef3ff]">
                      {meeting.title ?? "Meeting note"}
                    </p>
                    <p className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#74839d]">
                      {meeting.meetingDate ? formatLongDate(meeting.meetingDate) : formatRelativeTime(meeting.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#223047] bg-[#101a2b] px-3 py-1 text-[12px] text-[#c5d0e0]">
                    {meeting.actionCount} action{meeting.actionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-4 text-[14px] leading-7 text-[#c5d0e0]">
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
          <div className="grid gap-4 md:grid-cols-2">
            {ownerRows.map((owner) => (
              <div
                key={owner.name}
                className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[18px] font-semibold tracking-[-0.03em] text-[#eef3ff]">
                      {owner.name}
                    </p>
                    <p className="mt-2 text-[12px] uppercase tracking-[0.16em] text-[#74839d]">
                      Task ownership
                    </p>
                  </div>
                  <span className="rounded-full border border-[#223047] bg-[#101a2b] px-3 py-1 text-[12px] text-[#c5d0e0]">
                    {owner.count} tasks
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#172132]">
                    <div
                      className="h-full rounded-full bg-[#0073EA]"
                      style={{ width: `${Math.max((owner.count / Math.max(boardTasks.length, 1)) * 100, 6)}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-[#8a97ae]">
                    {owner.blocked} blocked
                  </span>
                </div>
              </div>
            ))}
          </div>
        );

      case "documents":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                Current launch scope
              </p>
              <p className="mt-4 text-[14px] leading-7 text-[#c5d0e0]">
                The launch workspace is anchored on tasks, approvals, and meeting extraction. We are deliberately not showing synthetic file libraries here until document sync is connected for real.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#182235] bg-[#0d1523] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74839d]">
                Signals already available
              </p>
              <div className="mt-5 space-y-3 text-[14px] text-[#c5d0e0]">
                <div className="flex items-center justify-between rounded-[18px] border border-[#182235] bg-[#101a2b] px-4 py-3">
                  <span>Tasks indexed</span>
                  <strong className="text-[#eef3ff]">{boardTasks.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-[18px] border border-[#182235] bg-[#101a2b] px-4 py-3">
                  <span>Meeting summaries</span>
                  <strong className="text-[#eef3ff]">{meetings.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-[18px] border border-[#182235] bg-[#101a2b] px-4 py-3">
                  <span>Pending approvals</span>
                  <strong className="text-[#eef3ff]">{actions.length}</strong>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#07111f]">
      <header className="border-b border-[#122033] bg-[#091423] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#182235] bg-[#0d1523] text-[#c5d0e0] transition-colors hover:border-[#2b3951] hover:text-white"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#74839d]">
                Project workspace
              </p>
              <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-[#f4f7ff]">
                {surfaceName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-[#8a97ae]">
                <span>Updated {formatRelativeTime(project?.updatedAt)}</span>
                <span className="h-1 w-1 rounded-full bg-[#334259]" />
                <span className="capitalize">{project?.status ?? "active"}</span>
                <span className="h-1 w-1 rounded-full bg-[#334259]" />
                <span className="capitalize">Risk {riskLabel}</span>
              </div>
            </div>
          </div>

          <div className="grid min-w-[220px] gap-3 rounded-[24px] border border-[#182235] bg-[#0d1523] px-5 py-4">
            <div className="flex items-center justify-between text-[12px] uppercase tracking-[0.16em] text-[#74839d]">
              <span>Target</span>
              <span>{project?.targetDate ? formatShortDate(project.targetDate) : "Unset"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#182235]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0073EA_0%,#4AA3FF_50%,#8AC5FF_100%)]"
                style={{ width: `${Math.max(completionRate, 6)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[13px] text-[#c5d0e0]">
              <span>{completionRate}% complete</span>
              <span>{openCount} open tasks</span>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-[#122033] bg-[#091423] px-6 pb-4">
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "border-[#2b8cff] bg-[#0073EA] text-white"
                    : "border-[#182235] bg-[#0d1523] text-[#9cabbe] hover:border-[#2b3951] hover:text-white"
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-[18px] border border-[#3b2433] bg-[#1a1018] px-4 py-3 text-[#f5cad7]">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span className="text-[13px]">{error}</span>
          </div>
        )}

        {inlineMessage && (
          <div className="mb-4 flex items-start gap-3 rounded-[18px] border border-[#1f3248] bg-[#0e1b2c] px-4 py-3 text-[#d8e6f8]">
            <Plus size={16} className="mt-0.5 shrink-0" />
            <span className="text-[13px]">{inlineMessage}</span>
          </div>
        )}

        {taskBusy && (
          <div className="mb-4 rounded-[18px] border border-[#1f3248] bg-[#0e1b2c] px-4 py-3 text-[13px] text-[#d8e6f8]">
            Updating workspace...
          </div>
        )}

        {renderedBody()}
      </main>

      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
