import type {
  CategoryColorMap, ContextMenuItem,
  GanttNode, GanttTask, GanttTaskStatus, PortfolioTimelineResponse, StatusChipData, ZoomLevel,
} from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR, ROW_HEIGHT, ROW_HEIGHT_TASK } from "./gantt-types";
import { getTimezone } from "@/lib/timezone-context";

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

// v4 Slice 3C-2 — nested portfolio tree.
//
// Categories can now live at three places in the tree:
//   • Top level (parentCategoryId=null, projectId=null) — "root" categories.
//   • Under another category (parentCategoryId set) — subcategories, rendered
//     as indented siblings of the parent's projects.
//   • Scoped to a project (projectId set) — rendered in the project timeline,
//     not the portfolio. Skipped from this function's output.
//
// Uncategorised (id=null) is a synthetic top-level bucket from the server and
// never has a parentCategoryId, so it always lands top-level.
export function buildPortfolioTree(resp: PortfolioTimelineResponse): GanttNode {
  // Index categories by id (skip project-scoped — not our view) and precompute
  // each one's child-category list for O(N) tree construction.
  const orgCategories = resp.categories.filter((c) => !c.projectId);
  const childrenByParent = new Map<string | null, typeof orgCategories>();
  for (const c of orgCategories) {
    const key = c.parentCategoryId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(c);
    childrenByParent.set(key, list);
  }

  function buildCategoryNode(c: typeof orgCategories[number]): GanttNode {
    const projectNodes: GanttNode[] = c.projects.map((p) => ({
      kind: "project",
      id: p.id,
      name: p.name,
      status: p.status,
      children: buildTaskForest(p.tasks),
    }));
    const subcategoryNodes: GanttNode[] = (c.id != null ? (childrenByParent.get(c.id) ?? []) : []).map(buildCategoryNode);
    return {
      kind: "category",
      id: c.id,
      name: c.name,
      colour: c.colour,
      // Subcategories render above projects to match Asana/Linear ordering.
      children: [...subcategoryNodes, ...projectNodes],
    };
  }

  const topLevel = childrenByParent.get(null) ?? [];
  const categoryChildren: GanttNode[] = topLevel.map(buildCategoryNode);
  return { kind: "category", id: "__root__", name: "", colour: null, children: categoryChildren };
}

// v4 Slice 4 — project timeline can now render project-scoped categories.
//
// The optional `categories` argument carries every category the API returned for
// the tenant; this function picks out the ones scoped to this project (either
// directly via `projectId === project.id`, or as a subcategory nested under
// another project-scoped category) and renders them as rows above the tasks.
//
// Tasks are not (yet) attached to categories — the task→category link lives on
// the DB only via `projects.category_id`, not `tasks.category_id`. So tasks
// keep their existing flat placement under the project root. What this change
// unlocks is *right-clicking a category row* on the project timeline, which
// previously was impossible because no category rows were rendered at all.
//
// When `categories` is absent or empty, this function behaves exactly as before.
export function buildProjectTree(
  project: { id: string; name: string; status: string },
  tasks: GanttTask[],
  categories?: ReadonlyArray<{
    id: string;
    name: string;
    colour: string | null;
    sortOrder: number;
    parentCategoryId: string | null;
    projectId: string | null;
  }>,
): Extract<GanttNode, { kind: "project" }> {
  // Partition tasks: those assigned to a project-scoped category go into that
  // category's node; the rest stay at the project root level (flat list below cats).
  const tasksByCategory = new Map<string, GanttTask[]>();
  const uncategorisedTasks: GanttTask[] = [];
  for (const t of tasks) {
    if (t.categoryId) {
      const list = tasksByCategory.get(t.categoryId) ?? [];
      list.push(t);
      tasksByCategory.set(t.categoryId, list);
    } else {
      uncategorisedTasks.push(t);
    }
  }
  const catNodes = buildProjectScopedCategoryForest(project.id, categories ?? [], tasksByCategory);
  const rootTaskNodes = buildTaskForest(uncategorisedTasks);
  return {
    kind: "project", id: project.id, name: project.name, status: project.status,
    children: [...catNodes, ...rootTaskNodes],
  };
}

type ProjectScopedCategoryInput = {
  id: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;
  projectId: string | null;
};

function buildProjectScopedCategoryForest(
  projectId: string,
  categories: ReadonlyArray<ProjectScopedCategoryInput>,
  tasksByCategory: Map<string, GanttTask[]> = new Map(),
): GanttNode[] {
  if (categories.length === 0) return [];

  const direct = categories.filter((c) => c.projectId === projectId);
  if (direct.length === 0) return [];

  const keep = new Set<string>(direct.map((c) => c.id));
  let frontier: ProjectScopedCategoryInput[] = direct;
  while (frontier.length > 0) {
    const next: ProjectScopedCategoryInput[] = [];
    for (const parent of frontier) {
      for (const c of categories) {
        if (c.parentCategoryId === parent.id && !keep.has(c.id)) {
          keep.add(c.id);
          next.push(c);
        }
      }
    }
    frontier = next;
  }
  const relevant = categories.filter((c) => keep.has(c.id));

  const childrenByParent = new Map<string | null, ProjectScopedCategoryInput[]>();
  for (const c of relevant) {
    const parentInScope = c.parentCategoryId && keep.has(c.parentCategoryId) ? c.parentCategoryId : null;
    const list = childrenByParent.get(parentInScope) ?? [];
    list.push(c);
    childrenByParent.set(parentInScope, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function buildNode(c: ProjectScopedCategoryInput): GanttNode {
    const subs = (childrenByParent.get(c.id) ?? []).map(buildNode);
    const catTasks = buildTaskForest(tasksByCategory.get(c.id) ?? []);
    return {
      kind: "category",
      id: c.id,
      name: c.name,
      colour: c.colour,
      children: [...subs, ...catTasks],
    };
  }

  return (childrenByParent.get(null) ?? []).map(buildNode);
}

// Timeline Slice 2 — recursive so task trees can be arbitrarily deep
// (task → subtask → subtask → …). Cycle-guard via `visited` so a corrupt
// parentTaskId loop in the DB can't hang the render.
function buildTaskForest(tasks: GanttTask[]): GanttNode[] {
  const byParent = new Map<string | null, GanttTask[]>();
  for (const t of tasks) {
    const list = byParent.get(t.parentTaskId) ?? [];
    list.push(t);
    byParent.set(t.parentTaskId, list);
  }
  function build(t: GanttTask, isSub: boolean, visited: Set<string>): GanttNode {
    if (visited.has(t.id)) {
      // Defensive — skip descendants to break the cycle. The row still
      // renders so the user can see and fix the bad data.
      return isSub
        ? { kind: "subtask", id: t.id, task: t, children: [] }
        : { kind: "task", id: t.id, task: t, children: [] };
    }
    const nextVisited = new Set(visited).add(t.id);
    const children = (byParent.get(t.id) ?? []).map((c) => build(c, true, nextVisited));
    return isSub
      ? { kind: "subtask", id: t.id, task: t, children }
      : { kind: "task", id: t.id, task: t, children };
  }
  const top = byParent.get(null) ?? [];
  return top.map((t) => build(t, false, new Set()));
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
  // v4 Slice 5 — a human-readable suffix ("no scheduled tasks") rendered
  // after the row label when the row is a structural container with no
  // scheduled content. Set only on project / category rows whose subtree
  // collapsed to zero Gantt-visible descendants.
  emptyNote?: string;
  // Sequential 1-based number assigned top-to-bottom across all task/subtask rows.
  taskNumber?: number;
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
  let taskCounter = 0;

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
    // Timeline Slice 2 — subtask now carries `children`; no special-case.
    const children: GanttNode[] = node.children;
    const hasChildren = children.length > 0;
    const key = keyOf(node);
    const categoryColor = colourFor(node, inherited);

    // v4 Slice 5 — annotate structural container rows that have no Gantt
    // content so the outline can render a "(no scheduled tasks)" suffix.
    // Project rows: empty = zero children (server already filtered null-date
    // tasks out). Category rows: only when id is a real category (not the
    // Uncategorised bucket — that's already italic + always empty-by-design).
    let emptyNote: string | undefined;
    if (!isSyntheticRoot && !hasChildren) {
      if (node.kind === "project") {
        emptyNote = "no scheduled tasks";
      } else if (node.kind === "category"
                 && node.id !== null
                 && node.id !== "uncat"
                 && node.id !== "__root__") {
        emptyNote = "no projects yet";
      }
    }

    if (!isSyntheticRoot) {
      const height = (node.kind === "task" || node.kind === "subtask") ? ROW_HEIGHT_TASK : ROW_HEIGHT;
      const taskNumber = (node.kind === "task" || node.kind === "subtask") ? ++taskCounter : undefined;
      rows.push({ kind: "node", key, depth, node, hasChildren, categoryColor, height, emptyNote, taskNumber });
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
    // Timeline Slice 2 — subtask now has `children`; walk them too.
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
        label: monthCursor.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: getTimezone() }).toUpperCase(),
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
        label: dayCursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: getTimezone() }),
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
      { id: "addSubcategory", label: "Add subcategory" },
      { id: "rename",         label: "Rename" },
      { id: "changeColour",   label: "Change colour" },
      { id: "delete",         label: "Delete", destructive: true },
    ];
  }
  if (args.rowKind === "project") {
    return [
      { id: "openDetail",     label: "Open project" },
      { id: "moveToCategory", label: "Move to category…", hasSubmenu: true },
      { id: "addChild",       label: "Add task" },
      { id: "addCategory",    label: "Add category in this project" },
      { id: "delete",         label: "Delete", destructive: true },
    ];
  }
  // task or subtask — tasks inherit their category from the parent project,
  // so "moveToCategory" here rewrites the project's categoryId rather than
  // the task's. Until tasks.category_id exists as a real column, be honest
  // in the label about the scope of the action.
  return [
    { id: "openDetail",          label: "Open task" },
    { id: "moveToCategory",      label: "Change project's category…", hasSubmenu: true },
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

/* ─── v4 Slice 5 — search dimming (ancestor-aware) ──────────────────── */

// Build the set of node keys that should stay un-dimmed for a given search
// query. A row stays un-dimmed if:
//   • Its own label matches the query (case-insensitive substring), OR
//   • Any descendant's label matches (so the parent stays legible as
//     context for the match below it), OR
//   • Any ancestor's label matches (so a matched parent keeps its children
//     visible rather than fading them out).
// Returns an empty set when the query is blank; the caller should skip
// dimming entirely in that case.
export function searchUnDimmedKeys(root: GanttNode, rawQuery: string): Set<string> {
  const query = rawQuery.trim().toLowerCase();
  const out = new Set<string>();
  if (!query) return out;

  function keyOf(node: GanttNode): string {
    if (node.kind === "category") return `cat:${node.id ?? "uncat"}`;
    if (node.kind === "project") return `proj:${node.id}`;
    if (node.kind === "task") return `task:${node.id}`;
    return `sub:${node.id}`;
  }

  function labelOf(node: GanttNode): string {
    if (node.kind === "category" || node.kind === "project") return node.name;
    return node.task.title;
  }

  // Mark every node in the given subtree as un-dimmed.
  function addSubtree(node: GanttNode): void {
    const isSyntheticRoot = node.kind === "category" && node.id === "__root__";
    if (!isSyntheticRoot) out.add(keyOf(node));
    // Timeline Slice 2 — subtask now has `children`; walk them too.
    for (const child of node.children) addSubtree(child);
  }

  // walk returns true if `node` or any descendant matched. When a match sits
  // on this node, every queued ancestor key is added to `out`, and the
  // node's whole subtree is kept un-dimmed too.
  function walk(node: GanttNode, ancestors: string[]): boolean {
    const isSyntheticRoot = node.kind === "category" && node.id === "__root__";
    const k = keyOf(node);
    const selfMatch = !isSyntheticRoot && labelOf(node).toLowerCase().includes(query);
    let descendantMatch = false;
    const nextAncestors = isSyntheticRoot ? ancestors : [...ancestors, k];
    for (const child of node.children) {
      if (walk(child, nextAncestors)) descendantMatch = true;
    }
    if (selfMatch) {
      // Propagate up + keep the whole subtree in context.
      for (const a of ancestors) out.add(a);
      addSubtree(node);
      return true;
    }
    if (descendantMatch) {
      // Some child matched — this node stays visible as context.
      if (!isSyntheticRoot) out.add(k);
      return true;
    }
    return false;
  }
  walk(root, []);
  return out;
}

/* ─── v4 Slice 4 — drag-and-drop validation ─────────────────────────── */

// dnd-kit sortable ids issued by GanttOutlineRow:
//   "dnd-cat:<uuid|uncat|__root__>"
//   "dnd-proj:<uuid>"
//   "dnd-task:<uuid>"
//   "dnd-sub:<uuid>"
export type DndKind = "cat" | "proj" | "task" | "sub";

export interface ParsedDndKey {
  kind: DndKind;
  id: string;
}

export function parseDndKey(key: string): ParsedDndKey | null {
  if (key.startsWith("dnd-cat:"))  return { kind: "cat",  id: key.slice("dnd-cat:".length) };
  if (key.startsWith("dnd-proj:")) return { kind: "proj", id: key.slice("dnd-proj:".length) };
  if (key.startsWith("dnd-task:")) return { kind: "task", id: key.slice("dnd-task:".length) };
  if (key.startsWith("dnd-sub:"))  return { kind: "sub",  id: key.slice("dnd-sub:".length) };
  return null;
}

export type DropEffect =
  | { kind: "moveCategory";         sourceId: string; newParentCategoryId: string | null; newProjectId: string | null }
  | { kind: "moveProject";          sourceId: string; newCategoryId: string | null }
  | { kind: "moveTask";             sourceId: string; newProjectId: string | null; newParentTaskId: string | null }
  | { kind: "moveTaskToCategory";   sourceId: string; newCategoryId: string | null };

export type DropValidation =
  | { ok: true;  effect: DropEffect }
  | { ok: false; reason: string };

export interface DropContext {
  // All values are *current* server state. Keys: the entity's UUID.
  categoriesById: Map<string, { parentCategoryId: string | null; projectId: string | null }>;
  tasksById:      Map<string, { projectId: string; parentTaskId: string | null }>;
}

function isAncestorCategory(
  ctx: DropContext,
  ancestorId: string,
  possibleDescendantId: string,
): boolean {
  // Walk up from possibleDescendant via parentCategoryId. Returns true iff we
  // hit ancestorId along the way.
  let cursor: string | null = possibleDescendantId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    const row = ctx.categoriesById.get(cursor);
    cursor = row?.parentCategoryId ?? null;
  }
  return false;
}

// Timeline Slice 2 — task equivalent. Used to reject a task drop that would
// create a cycle (drop-target is a descendant of the source).
function isAncestorTask(
  ctx: DropContext,
  ancestorId: string,
  possibleDescendantId: string,
): boolean {
  let cursor: string | null = possibleDescendantId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    const row = ctx.tasksById.get(cursor);
    cursor = row?.parentTaskId ?? null;
  }
  return false;
}

// v4 Slice 4 — validate a single drop and, if allowed, describe the server
// mutation it should trigger. Rules (spec §4.5, tightened to this slice's
// scope — unsupported combinations reject with a message rather than silently
// falling through):
//
//   source → target        effect
//   ─────────────────────  ──────────────────────────────────────────────
//   category → category    moveCategory (reparent). Cycle-rejected when
//                          target is a descendant of source.
//   category → project     moveCategory (convert to project-scoped).
//   project  → category    moveProject (reparent to that category).
//   task/sub → project     moveTask (cross-project allowed, parent cleared).
//   task/sub → task/sub    moveTask. Target task → source becomes its
//                          subtask. Target subtask → source becomes a
//                          sibling (same parent as target).
//
// Synthetic rows (Uncategorised / __root__) are never valid as source OR
// target — those paths belong to the right-click "Move to category…" submenu.
export function validateDrop(
  sourceKey: string,
  targetKey: string,
  ctx: DropContext,
): DropValidation {
  const src = parseDndKey(sourceKey);
  const tgt = parseDndKey(targetKey);
  if (!src || !tgt) return { ok: false, reason: "Unrecognised row id." };
  if (sourceKey === targetKey) return { ok: false, reason: "Dropped on itself." };

  // Reject synthetic buckets explicitly on either side.
  for (const side of [src, tgt]) {
    if (side.kind === "cat" && (side.id === "uncat" || side.id === "__root__" || side.id === "null")) {
      return { ok: false, reason: "Use the right-click menu to move into Uncategorised." };
    }
  }

  // category → category  (reparent)
  if (src.kind === "cat" && tgt.kind === "cat") {
    if (isAncestorCategory(ctx, src.id, tgt.id)) {
      return { ok: false, reason: "Can't move a category under its own descendant." };
    }
    return {
      ok: true,
      effect: { kind: "moveCategory", sourceId: src.id, newParentCategoryId: tgt.id, newProjectId: null },
    };
  }

  // category → project  (convert to project-scoped)
  if (src.kind === "cat" && tgt.kind === "proj") {
    return {
      ok: true,
      effect: { kind: "moveCategory", sourceId: src.id, newParentCategoryId: null, newProjectId: tgt.id },
    };
  }

  // project → category  (reparent project)
  if (src.kind === "proj" && tgt.kind === "cat") {
    return {
      ok: true,
      effect: { kind: "moveProject", sourceId: src.id, newCategoryId: tgt.id },
    };
  }

  // task/subtask → project  (cross-project move, clears parent task)
  if ((src.kind === "task" || src.kind === "sub") && tgt.kind === "proj") {
    return {
      ok: true,
      effect: { kind: "moveTask", sourceId: src.id, newProjectId: tgt.id, newParentTaskId: null },
    };
  }

  // task/subtask → task/subtask  (reparent + potential cross-project)
  //
  // Timeline Slice 2 — the depth cap is gone. Dropping any task onto any
  // task/subtask makes the source a child of the target. Cycle detection
  // mirrors the category rule: can't drop a task under one of its own
  // descendants.
  if ((src.kind === "task" || src.kind === "sub") && (tgt.kind === "task" || tgt.kind === "sub")) {
    const tgtTask = ctx.tasksById.get(tgt.id);
    if (!tgtTask) return { ok: false, reason: "Target task not found." };
    if (tgt.id === src.id) {
      return { ok: false, reason: "Task cannot be its own parent." };
    }
    if (isAncestorTask(ctx, src.id, tgt.id)) {
      return { ok: false, reason: "Can't move a task under its own descendant." };
    }
    return {
      ok: true,
      effect: { kind: "moveTask", sourceId: src.id, newProjectId: tgtTask.projectId, newParentTaskId: tgt.id },
    };
  }

  // task/subtask → category  (move task into a project-scoped group)
  if ((src.kind === "task" || src.kind === "sub") && tgt.kind === "cat") {
    return {
      ok: true,
      effect: { kind: "moveTaskToCategory", sourceId: src.id, newCategoryId: tgt.id },
    };
  }

  // Everything else: not yet supported by this slice.
  return { ok: false, reason: "That move isn't supported — use the right-click menu." };
}

/* ─── Dependency cascade ───────────────────────────────────────────── */

function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ClientDependency = {
  dependsOnId: string;
  type: "FS" | "FF" | "SS" | "SF";
  offsetDays: number;
};

// Apply client-side dependency constraints to a flat task list. Iterates
// until stable (handles chained FS A→B→C in one pass). Cycle-safe via
// max-iterations guard.
export function applyDependencyCascades(
  tasks: GanttTask[],
  deps: Map<string, ClientDependency>,
): GanttTask[] {
  if (deps.size === 0) return tasks;
  const taskMap = new Map(tasks.map((t) => [t.id, { ...t }]));

  let changed = true;
  let guard = 0;
  while (changed && guard < tasks.length + 1) {
    changed = false;
    guard++;
    for (const [taskId, dep] of deps) {
      const task = taskMap.get(taskId);
      const pred = taskMap.get(dep.dependsOnId);
      if (!task || !pred) continue;

      const predEnd = pred.endDate ?? pred.dueDate;
      const predStart = pred.startDate;
      let newStart = task.startDate;
      let newEnd = task.endDate;

      switch (dep.type) {
        case "FS": if (predEnd) newStart = isoAddDays(predEnd, dep.offsetDays); break;
        case "FF": if (predEnd) newEnd   = isoAddDays(predEnd, dep.offsetDays); break;
        case "SS": if (predStart) newStart = isoAddDays(predStart, dep.offsetDays); break;
        case "SF": if (predStart) newEnd   = isoAddDays(predStart, dep.offsetDays); break;
      }

      if (newStart !== task.startDate || newEnd !== task.endDate) {
        taskMap.set(taskId, { ...task, startDate: newStart, endDate: newEnd });
        changed = true;
      }
    }
  }

  return tasks.map((t) => taskMap.get(t.id) ?? t);
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
