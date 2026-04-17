import type {
  CategoryColorMap, ContextMenuItem,
  GanttNode, GanttTask, GanttTaskStatus, PortfolioTimelineResponse, StatusChipData, ZoomLevel,
} from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR, ROW_HEIGHT, ROW_HEIGHT_TASK } from "./gantt-types";

/* ─── DB status normalisation ──────────────────────────────────────── */

const DB_TO_GANTT_STATUS: Record<string, GanttTaskStatus> = {
  backlog:     "not_started",
  not_started: "not_started",
  in_progress: "on_track",
  on_track:    "on_track",
  waiting:     "at_risk",
  at_risk:     "at_risk",
  blocked:     "overdue",
  overdue:     "overdue",
  completed:   "completed",
  done:        "completed",
};

export function normalizeGanttStatus(dbStatus: string | null | undefined): GanttTaskStatus {
  if (!dbStatus) return "not_started";
  return DB_TO_GANTT_STATUS[dbStatus] ?? "not_started";
}

/* ─── Tree building ────────────────────────────────────────────────── */

export function normalizePortfolioStatuses(data: PortfolioTimelineResponse): PortfolioTimelineResponse {
  return {
    ...data,
    categories: data.categories.map((c) => ({
      ...c,
      projects: c.projects.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => ({ ...t, status: normalizeGanttStatus(t.status as string) })),
      })),
    })),
  };
}

export function buildPortfolioTree(resp: PortfolioTimelineResponse): GanttNode {
  const categoryChildren: GanttNode[] = resp.categories.map((c) => ({
    kind: "category",
    id: c.id,
    name: c.name,
    colour: c.colour,
    children: c.projects.map((p) => ({
      kind: "project",
      id: p.id,
      name: p.name,
      status: p.status,
      children: buildTaskForest(p.tasks),
    })),
  }));
  return { kind: "category", id: "__root__", name: "", colour: null, children: categoryChildren };
}

export function buildProjectTree(
  project: { id: string; name: string; status: string },
  tasks: GanttTask[],
): Extract<GanttNode, { kind: "project" }> {
  return {
    kind: "project", id: project.id, name: project.name, status: project.status,
    children: buildTaskForest(tasks),
  };
}

function buildTaskForest(tasks: GanttTask[]): GanttNode[] {
  const byParent = new Map<string | null, GanttTask[]>();
  for (const t of tasks) {
    const list = byParent.get(t.parentTaskId) ?? [];
    list.push(t);
    byParent.set(t.parentTaskId, list);
  }
  const top = byParent.get(null) ?? [];
  return top.map<GanttNode>((t) => ({
    kind: "task",
    id: t.id,
    task: t,
    children: (byParent.get(t.id) ?? []).map<GanttNode>((sub) => ({
      kind: "subtask", id: sub.id, task: sub,
    })),
  }));
}

/* ─── Flatten for rendering ────────────────────────────────────────── */

export type FlatRow = {
  kind: "node";
  key: string;         // stable id, e.g. "cat:c1", "proj:p1", "task:t1", "sub:t2"
  depth: number;       // 0..3
  node: GanttNode;
  hasChildren: boolean;
  categoryColor: string; // resolved category colour; fallback to Larry purple
  dimmed?: boolean;
  height: number;      // per-level (ROW_HEIGHT for cat/proj, ROW_HEIGHT_TASK for task/sub)
};

export interface FlattenOptions {
  categoryColorMap?: CategoryColorMap;
  rootCategoryColor?: string; // used when root is a project (per-project view)
}

export function flattenVisible(
  root: GanttNode,
  expanded: Set<string>,
  options: FlattenOptions = {},
): FlatRow[] {
  const rows: FlatRow[] = [];
  const map = options.categoryColorMap;
  const rootColour = options.rootCategoryColor ?? DEFAULT_CATEGORY_COLOUR;

  function keyOf(node: GanttNode): string {
    if (node.kind === "category") return `cat:${node.id ?? "uncat"}`;
    if (node.kind === "project") return `proj:${node.id}`;
    if (node.kind === "task") return `task:${node.id}`;
    return `sub:${node.id}`;
  }

  function colourFor(node: GanttNode, inherited: string): string {
    if (node.kind !== "category" || node.id === "__root__") return inherited;
    const key = `cat:${node.id ?? "uncat"}`;
    const fromMap = map?.get(key);
    if (fromMap) return fromMap;
    // Fall back to the node's own colour, then root colour, then default.
    return node.colour ?? inherited ?? DEFAULT_CATEGORY_COLOUR;
  }

  function walk(node: GanttNode, depth: number, isSyntheticRoot: boolean, inherited: string) {
    const children: GanttNode[] = (node.kind === "subtask") ? [] : node.children;
    const hasChildren = children.length > 0;
    const key = keyOf(node);
    const categoryColor = colourFor(node, inherited);

    if (!isSyntheticRoot) {
      const height = (node.kind === "task" || node.kind === "subtask") ? ROW_HEIGHT_TASK : ROW_HEIGHT;
      rows.push({ kind: "node", key, depth, node, hasChildren, categoryColor, height });
    }

    if (!isSyntheticRoot && !expanded.has(key)) return;
    for (const child of children) {
      walk(child, depth + (isSyntheticRoot ? 0 : 1), false, categoryColor);
    }
  }

  walk(root, 0, true, rootColour);
  return rows;
}

/* ─── Category colour resolution ───────────────────────────────────── */

export function buildCategoryColorMap(
  categories: ReadonlyArray<{ id: string | null; colour: string | null }>,
): CategoryColorMap {
  const map: CategoryColorMap = new Map();
  for (const c of categories) {
    const key = c.id ? `cat:${c.id}` : "cat:uncat";
    map.set(key, c.colour ?? DEFAULT_CATEGORY_COLOUR);
  }
  return map;
}

// Walk up the tree to find the Category colour for any node key.
// Consulted ad-hoc (render-path uses FlatRow.categoryColor instead).
export function resolveCategoryColor(
  nodeKey: string,
  root: GanttNode,
  map?: CategoryColorMap,
): string {
  function colourOf(node: GanttNode): string {
    if (node.kind !== "category") return DEFAULT_CATEGORY_COLOUR;
    const key = `cat:${node.id ?? "uncat"}`;
    return map?.get(key) ?? node.colour ?? DEFAULT_CATEGORY_COLOUR;
  }

  function keyOf(node: GanttNode): string {
    if (node.kind === "category") return `cat:${node.id ?? "uncat"}`;
    if (node.kind === "project") return `proj:${node.id}`;
    if (node.kind === "task") return `task:${node.id}`;
    return `sub:${node.id}`;
  }

  function find(node: GanttNode, ancestors: GanttNode[]): GanttNode[] | null {
    if (keyOf(node) === nodeKey) return [...ancestors, node];
    if (node.kind === "subtask") return null;
    for (const c of node.children) {
      const hit = find(c, [...ancestors, node]);
      if (hit) return hit;
    }
    return null;
  }

  const path = find(root, []);
  if (!path) return DEFAULT_CATEGORY_COLOUR;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].kind === "category" && (path[i] as { id: string | null }).id !== "__root__") {
      return colourOf(path[i]);
    }
  }
  return DEFAULT_CATEGORY_COLOUR;
}

/* ─── Rollup (parent bar spans children's min→max, progress weighted) ─── */

export interface RolledBar {
  start: string;        // ISO yyyy-mm-dd
  end: string;
  progressPercent: number;
}

export function rollUpBar(tasks: GanttTask[]): RolledBar | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  const ranges = tasks
    .map((t) => {
      const s = t.startDate ? String(t.startDate).slice(0, 10) : null;
      const e = t.endDate ?? t.dueDate;
      const eNorm = e ? String(e).slice(0, 10) : null;
      const sNorm = s ?? (eNorm && eNorm > todayIso ? todayIso : eNorm);
      if (!sNorm || !eNorm) return null;
      const days = Math.max(1, Math.round(
        (new Date(eNorm).getTime() - new Date(sNorm).getTime()) / 86_400_000,
      ));
      return { start: sNorm, end: eNorm, progress: t.progressPercent, days };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (ranges.length === 0) return null;

  const start = ranges.reduce((a, b) => (a < b.start ? a : b.start), ranges[0].start);
  const end = ranges.reduce((a, b) => (a > b.end ? a : b.end), ranges[0].end);

  const totalWeighted = ranges.reduce((sum, r) => sum + r.progress * r.days, 0);
  const totalDays = ranges.reduce((sum, r) => sum + r.days, 0);
  const progressPercent = totalDays === 0 ? 0 : Math.round(totalWeighted / totalDays);

  return { start, end, progressPercent };
}

/* ─── Axis / zoom helpers ──────────────────────────────────────────── */

export function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface TimelineRange { start: Date; end: Date; totalDays: number; }

export function computeRange(tasks: GanttTask[], zoom: ZoomLevel): TimelineRange {
  const now = new Date();
  let earliest = now, latest = now;
  for (const t of tasks) {
    const s = t.startDate ? new Date(t.startDate) : null;
    const e = (t.endDate ?? t.dueDate) ? new Date((t.endDate ?? t.dueDate) as string) : null;
    if (s && s < earliest) earliest = s;
    if (e && e > latest) latest = e;
  }
  const padDays = zoom === "week" ? 3 : zoom === "month" ? 14 : 30;
  const minFuture = zoom === "week" ? 42 : zoom === "month" ? 120 : 365;
  const start = addDays(earliest, -padDays);
  const taskEnd = addDays(latest, padDays);
  const minEnd = addDays(now, minFuture);
  const end = taskEnd > minEnd ? taskEnd : minEnd;
  return { start, end, totalDays: Math.max(daysBetween(start, end), 1) };
}

export function dateToPct(d: Date, range: TimelineRange): number {
  return (daysBetween(range.start, d) / range.totalDays) * 100;
}

/* ─── Date-axis generation (two-row month/day header) ───────────────── */

export interface DateAxisMonth {
  label: string;     // "APR 2026"
  startPct: number;  // left edge as % of axis width
  endPct: number;    // right edge as % (capped at 100)
}

export interface DateAxisDay {
  label: string;     // "23" or "Mon 23"
  pct: number;       // centre position as %
  isMonthStart: boolean;
}

export interface DateAxis {
  months: DateAxisMonth[];
  days: DateAxisDay[];
}

// Generate the date-axis markers for a given range and zoom.
// Week: every day. Month: every 7 days (from Mondays). Quarter: every 14 days.
export function generateDateAxis(range: TimelineRange, zoom: ZoomLevel): DateAxis {
  const months: DateAxisMonth[] = [];
  const days: DateAxisDay[] = [];

  // Months: walk month-starts, each span ends at the next month-start or range end.
  const monthCursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  while (monthCursor <= range.end) {
    const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    const spanStart = monthCursor < range.start ? range.start : monthCursor;
    const spanEnd = nextMonth > range.end ? range.end : nextMonth;
    const startPct = Math.max(0, dateToPct(spanStart, range));
    const endPct = Math.min(100, dateToPct(spanEnd, range));
    if (endPct > startPct) {
      months.push({
        label: monthCursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase(),
        startPct,
        endPct,
      });
    }
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }

  // Days: cadence by zoom.
  const dayCursor = new Date(range.start);
  if (zoom === "week") {
    while (dayCursor <= range.end) {
      days.push({
        label: dayCursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
        pct: dateToPct(dayCursor, range),
        isMonthStart: dayCursor.getDate() === 1,
      });
      dayCursor.setDate(dayCursor.getDate() + 1);
    }
  } else if (zoom === "month") {
    // Advance to the first Monday in range.
    const dow = dayCursor.getDay(); // 0 Sun..6 Sat
    const daysToMonday = (8 - dow) % 7 || 7; // always moves forward to next Monday
    dayCursor.setDate(dayCursor.getDate() + daysToMonday);
    while (dayCursor <= range.end) {
      days.push({
        label: String(dayCursor.getDate()),
        pct: dateToPct(dayCursor, range),
        isMonthStart: dayCursor.getDate() <= 7, // first week of a month
      });
      dayCursor.setDate(dayCursor.getDate() + 7);
    }
  } else {
    // quarter: every 14 days starting at the first of the month after range.start
    dayCursor.setDate(1);
    dayCursor.setMonth(dayCursor.getMonth() + 1);
    while (dayCursor <= range.end) {
      days.push({
        label: String(dayCursor.getDate()),
        pct: dateToPct(dayCursor, range),
        isMonthStart: dayCursor.getDate() === 1,
      });
      dayCursor.setDate(dayCursor.getDate() + 14);
    }
  }

  return { months, days };
}

/* ─── Colour helpers ───────────────────────────────────────────────── */

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

// Returns "#ffffff" or "#11172c" based on WCAG relative luminance.
// White text when the background luminance < 0.55 (dark), dark text otherwise.
export function contrastTextFor(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#ffffff";
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  return L < 0.55 ? "#ffffff" : "#11172c";
}

// 10%-alpha rgba version of a hex colour — used for the CategoryDot ring.
export function tinyTint(hex: string, alpha = 0.15): string {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(108, 68, 246, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/* ─── v3 — context menu items ──────────────────────────────────────── */

export function contextMenuItemsFor(args: {
  rowKind: "category" | "project" | "task" | "subtask";
  isUncategorised: boolean;
}): ContextMenuItem[] {
  if (args.rowKind === "category") {
    if (args.isUncategorised) {
      return [{
        id: "rename",
        label: "Uncategorised is the default bucket; not editable.",
        disabled: true,
      }];
    }
    return [
      { id: "rename",       label: "Rename" },
      { id: "changeColour", label: "Change colour" },
      { id: "delete",       label: "Delete", destructive: true },
    ];
  }
  if (args.rowKind === "project") {
    return [
      { id: "openDetail",     label: "Open project" },
      { id: "moveToCategory", label: "Move to category…", hasSubmenu: true },
      { id: "addChild",       label: "Add task" },
      { id: "delete",         label: "Delete", destructive: true },
    ];
  }
  // task or subtask
  return [
    { id: "openDetail",          label: "Open task" },
    { id: "moveToCategory",      label: "Move project to category…", hasSubmenu: true },
    { id: "removeFromTimeline",  label: "Remove from timeline" },
    { id: "delete",              label: "Delete", destructive: true },
  ];
}

/* ─── v3 — status chip ─────────────────────────────────────────────── */

// Returns null when no chip should render (on_track — the solid bar is the signal).
export function statusChipFor(status: GanttTaskStatus): StatusChipData | null {
  switch (status) {
    case "on_track":
      return null;
    case "not_started":
      return { label: "NS", fg: "var(--text-muted)", bg: "transparent", border: "var(--border)" };
    case "at_risk":
      return { label: "AR", fg: "#ffffff", bg: "var(--tl-at-risk)", border: null };
    case "overdue":
      return { label: "OD", fg: "#ffffff", bg: "var(--tl-overdue)", border: null };
    case "completed":
      return { label: "✓", fg: "#ffffff", bg: "var(--tl-completed)", border: null };
    default:
      return null;
  }
}

// Darken a hex colour by a percentage (0-100) of each RGB channel.
// Returns "#rrggbb". If the input isn't a valid hex, returns it unchanged.
export function darken(hex: string, pct: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const factor = Math.max(0, 1 - pct / 100);
  const r = Math.max(0, Math.min(255, Math.round(rgb.r * factor)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g * factor)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b * factor)));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
