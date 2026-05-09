import { TIMELINE2_GANTT_COLUMN_ORDER } from "@larry/shared/timeline2";
import {
  clamp,
  type ResizableColumnKey,
  type TimelineColumnKey,
} from "./timeline2-gantt-helpers";

export const MIN_OUTLINE_WIDTH = 420;
export const MAX_OUTLINE_WIDTH = 960;
export const DEFAULT_OUTLINE_WIDTH = 640;
export const TASK_MIN_WIDTH = 200;
/** Default outline px width for the task-name column (user-resizable; persisted as `columnWidths.task_name`). */
export const DEFAULT_TASK_NAME_COLUMN_WIDTH = 320;
/** Max outline px width when resizing the task-name column. */
export const TASK_NAME_COLUMN_MAX_WIDTH = 560;
export const OUTLINE_TABLE_CHROME_PX = 24;

export function taskNameColumnResizeBounds(): [number, number] {
  return [TASK_MIN_WIDTH, TASK_NAME_COLUMN_MAX_WIDTH];
}

export const DEFAULT_COLUMN_ORDER = [...TIMELINE2_GANTT_COLUMN_ORDER] as TimelineColumnKey[];

export const DEFAULT_COLUMN_WIDTHS: Record<ResizableColumnKey, number> = {
  status: 108,
  priority: 92,
  progress: 112,
  start_date: 88,
  due_date: 88,
  assignee: 148,
};

/** Session storage: map legacy column ids saved before the outline table refactor. */
export function mapLegacyTimelineColumnKey(value: unknown): TimelineColumnKey | null {
  if (typeof value !== "string") return null;
  const mapped: Record<string, TimelineColumnKey> = {
    workflow: "status",
    task: "task_name",
    due: "due_date",
    signals: "assignee",
  };
  const next = mapped[value] ?? (value as TimelineColumnKey);
  return DEFAULT_COLUMN_ORDER.includes(next) ? next : null;
}

export function readSessionNumber(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, min, max);
  } catch {
    return fallback;
  }
}

export function writeSessionNumber(key: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    // Ignore session storage failures.
  }
}

export function readSessionOrder(key: string) {
  if (typeof window === "undefined") return DEFAULT_COLUMN_ORDER;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COLUMN_ORDER;
    const migrated = parsed.map(mapLegacyTimelineColumnKey).filter((v): v is TimelineColumnKey => v !== null);
    const merged: TimelineColumnKey[] = [];
    const seen = new Set<TimelineColumnKey>();
    for (const col of migrated) {
      if (!seen.has(col)) {
        seen.add(col);
        merged.push(col);
      }
    }
    for (const col of DEFAULT_COLUMN_ORDER) {
      if (!seen.has(col)) merged.push(col);
    }
    return merged.length === DEFAULT_COLUMN_ORDER.length ? merged : DEFAULT_COLUMN_ORDER;
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
}

export function writeSessionOrder(key: string, value: TimelineColumnKey[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore session storage failures.
  }
}

export type OutlineWidthsSessionPayload = {
  resizable: Record<ResizableColumnKey, number>;
  taskName: number;
};

export function readSessionOutlineWidths(key: string): OutlineWidthsSessionPayload {
  const emptyResizable = (): OutlineWidthsSessionPayload => ({
    resizable: { ...DEFAULT_COLUMN_WIDTHS },
    taskName: DEFAULT_TASK_NAME_COLUMN_WIDTH,
  });
  if (typeof window === "undefined") return emptyResizable();
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return emptyResizable();
    const parsed = JSON.parse(raw) as Partial<
      Record<ResizableColumnKey | "due" | "signals" | "workflow" | "task_name", number>
    >;
    const [sMin, sMax] = [72, 220];
    const [pMin, pMax] = [64, 170];
    const [progMin, progMax] = [88, 180];
    const [dateMin, dateMax] = [72, 150];
    const [aMin, aMax] = [96, 300];
    const [tnMin, tnMax] = taskNameColumnResizeBounds();
    const resizable: Record<ResizableColumnKey, number> = {
      status: clamp(Number(parsed.status ?? parsed.workflow) || DEFAULT_COLUMN_WIDTHS.status, sMin, sMax),
      priority: clamp(Number(parsed.priority) || DEFAULT_COLUMN_WIDTHS.priority, pMin, pMax),
      progress: clamp(Number(parsed.progress) || DEFAULT_COLUMN_WIDTHS.progress, progMin, progMax),
      start_date: clamp(Number(parsed.start_date) || DEFAULT_COLUMN_WIDTHS.start_date, dateMin, dateMax),
      due_date: clamp(Number(parsed.due_date ?? parsed.due) || DEFAULT_COLUMN_WIDTHS.due_date, dateMin, dateMax),
      assignee: clamp(Number(parsed.assignee ?? parsed.signals) || DEFAULT_COLUMN_WIDTHS.assignee, aMin, aMax),
    };
    const rawTn = Number(parsed.task_name);
    const taskName = clamp(
      Number.isFinite(rawTn) && rawTn > 0 ? rawTn : DEFAULT_TASK_NAME_COLUMN_WIDTH,
      tnMin,
      tnMax,
    );
    return { resizable, taskName };
  } catch {
    return emptyResizable();
  }
}

export function writeSessionOutlineWidths(key: string, payload: OutlineWidthsSessionPayload) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ...payload.resizable, task_name: payload.taskName }));
  } catch {
    // Ignore session storage failures.
  }
}
