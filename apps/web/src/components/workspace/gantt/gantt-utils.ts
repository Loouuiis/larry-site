import type {
  GanttNode, GanttTask, GanttTaskStatus, PortfolioTimelineResponse, ZoomLevel,
} from "./gantt-types";

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

export interface FlatRow {
  key: string;        // stable id, e.g. "cat:c1", "proj:p1", "task:t1", "sub:t2"
  depth: number;      // 0..3
  node: GanttNode;
  hasChildren: boolean;
}

export function flattenVisible(root: GanttNode, expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];

  function keyOf(node: GanttNode): string {
    if (node.kind === "category") return `cat:${node.id ?? "uncat"}`;
    if (node.kind === "project") return `proj:${node.id}`;
    if (node.kind === "task") return `task:${node.id}`;
    return `sub:${node.id}`;
  }

  function walk(node: GanttNode, depth: number, isSyntheticRoot: boolean) {
    const children: GanttNode[] = (node.kind === "subtask") ? [] : node.children;
    const hasChildren = children.length > 0;
    const key = keyOf(node);

    if (!isSyntheticRoot) rows.push({ key, depth, node, hasChildren });

    if (!isSyntheticRoot && !expanded.has(key)) return;
    for (const child of children) walk(child, depth + (isSyntheticRoot ? 0 : 1), false);
  }

  const isSynthetic = root.kind === "category" && root.id === "__root__";
  walk(root, 0, isSynthetic);
  return rows;
}

/* ─── Rollup (parent bar spans children's min→max, progress weighted) ─── */

export interface RolledBar {
  start: string;        // ISO yyyy-mm-dd
  end: string;
  progressPercent: number;
}

export function rollUpBar(tasks: GanttTask[]): RolledBar | null {
  const ranges = tasks
    .map((t) => {
      const s = t.startDate;
      const e = t.endDate ?? t.dueDate;
      if (!s || !e) return null;
      const days = Math.max(1, Math.round(
        (new Date(e).getTime() - new Date(s).getTime()) / 86_400_000,
      ));
      return { start: s, end: e, progress: t.progressPercent, days };
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
