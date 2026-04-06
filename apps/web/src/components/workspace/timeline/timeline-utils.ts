import type { TaskStatus, TaskPriority, WorkspaceTimelineTask } from "@/app/dashboard/types";

/* ─── Constants ────────────────────────────────────────────────────── */

export const EASE = [0.22, 1, 0.36, 1] as const;

export type ZoomLevel = "week" | "month" | "quarter";
export type GroupBy = "phase" | "assignee" | "status";
export type ColourBy = "status" | "assignee" | "priority";

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  week: "W",
  month: "M",
  quarter: "Q",
};

/* ─── Status colour config ─────────────────────────────────────────── */

export interface StatusColourConfig {
  bg: string;
  bgDark: string;
  text: string;
  label: string;
  dot: string;
}

export const STATUS_COLOURS: Record<TaskStatus, StatusColourConfig> = {
  not_started: {
    bg: "var(--tl-not-started)",
    bgDark: "var(--tl-not-started-dark)",
    text: "#606060",
    label: "Not started",
    dot: "#b0b0b0",
  },
  on_track: {
    bg: "var(--tl-in-progress)",
    bgDark: "var(--tl-in-progress-dark)",
    text: "#ffffff",
    label: "In progress",
    dot: "#7ab0d8",
  },
  at_risk: {
    bg: "var(--tl-at-risk)",
    bgDark: "var(--tl-at-risk-dark)",
    text: "#705800",
    label: "At risk",
    dot: "#d4b84a",
  },
  overdue: {
    bg: "var(--tl-overdue)",
    bgDark: "var(--tl-overdue-dark)",
    text: "#ffffff",
    label: "Overdue",
    dot: "#e87878",
  },
  completed: {
    bg: "var(--tl-completed)",
    bgDark: "var(--tl-completed-dark)",
    text: "#ffffff",
    label: "Completed",
    dot: "#6ab86a",
  },
};

const FALLBACK_STATUS: StatusColourConfig = {
  bg: "var(--tl-not-started)",
  bgDark: "var(--tl-not-started-dark)",
  text: "#5b3ec9",
  label: "Unknown",
};

/** Safe accessor — returns fallback config for unknown status values */
export function getStatusColour(status: string): StatusColourConfig {
  return STATUS_COLOURS[status as TaskStatus] ?? FALLBACK_STATUS;
}

export const PRIORITY_COLOURS: Record<TaskPriority, string> = {
  critical: "#e84c6f",
  high: "#f59e0b",
  medium: "#6c44f6",
  low: "#bdb7d0",
};

/* ─── Date helpers ─────────────────────────────────────────────────── */

export function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateRange(start: Date, end: Date): string {
  const days = daysBetween(start, end);
  return `${formatDateShort(start)} – ${formatDateShort(end)} (${days} day${days === 1 ? "" : "s"})`;
}

/* ─── Date range for the timeline axis ─────────────────────────────── */

export interface TimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
}

export function computeTimelineRange(
  tasks: WorkspaceTimelineTask[],
  zoom: ZoomLevel,
): TimelineRange {
  const now = new Date();
  let earliest = now;
  let latest = now;

  for (const t of tasks) {
    const s = parseDate(t.startDate);
    const e = parseDate(t.endDate) ?? parseDate(t.dueDate);
    if (s && s < earliest) earliest = s;
    if (e && e > latest) latest = e;
  }

  // Add padding based on zoom level
  const padDays = zoom === "week" ? 3 : zoom === "month" ? 14 : 30;
  const start = addDays(earliest, -padDays);
  const end = addDays(latest, padDays);
  const totalDays = Math.max(daysBetween(start, end), 1);

  return { start, end, totalDays };
}

export function dateToPct(d: Date, range: TimelineRange): number {
  return (daysBetween(range.start, d) / range.totalDays) * 100;
}

/* ─── Gridline generation ──────────────────────────────────────────── */

export interface GridMarker {
  date: Date;
  label: string;
  pct: number;
}

export function generateGridMarkers(
  range: TimelineRange,
  zoom: ZoomLevel,
): GridMarker[] {
  const markers: GridMarker[] = [];
  const cursor = new Date(range.start);

  if (zoom === "week") {
    // Daily gridlines
    while (cursor <= range.end) {
      markers.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        pct: dateToPct(cursor, range),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (zoom === "month") {
    // Weekly gridlines — start on Monday
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7 || 7));
    while (cursor <= range.end) {
      const weekEnd = addDays(cursor, 6);
      markers.push({
        date: new Date(cursor),
        label: `${formatDateShort(cursor)} – ${formatDateShort(weekEnd)}`,
        pct: dateToPct(cursor, range),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    // Monthly gridlines
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= range.end) {
      markers.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        pct: dateToPct(cursor, range),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return markers;
}

/* ─── Grouping logic ───────────────────────────────────────────────── */

export interface TaskGroup {
  key: string;
  label: string;
  tasks: WorkspaceTimelineTask[];
}

export function groupTasks(
  tasks: WorkspaceTimelineTask[],
  groupBy: GroupBy,
): TaskGroup[] {
  const map = new Map<string, WorkspaceTimelineTask[]>();

  for (const t of tasks) {
    let key: string;
    if (groupBy === "phase") {
      key = t.category ?? "Uncategorised";
    } else if (groupBy === "assignee") {
      key = t.assigneeName ?? t.assigneeUserId ?? "Unassigned";
    } else {
      key = STATUS_COLOURS[t.status]?.label ?? t.status;
    }
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }

  return Array.from(map.entries()).map(([key, tasks]) => ({
    key,
    label: key,
    tasks,
  }));
}

/* ─── Scheduled vs unscheduled split ───────────────────────────────── */

export function splitScheduled(tasks: WorkspaceTimelineTask[]): {
  scheduled: WorkspaceTimelineTask[];
  unscheduled: WorkspaceTimelineTask[];
} {
  const scheduled: WorkspaceTimelineTask[] = [];
  const unscheduled: WorkspaceTimelineTask[] = [];

  for (const t of tasks) {
    if (t.startDate && (t.endDate || t.dueDate)) {
      scheduled.push(t);
    } else {
      unscheduled.push(t);
    }
  }

  return { scheduled, unscheduled };
}
