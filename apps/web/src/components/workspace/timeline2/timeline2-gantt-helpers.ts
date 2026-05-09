import type {
  Timeline2Branch,
  Timeline2Dependency,
  Timeline2DependencyRelation,
  Timeline2Node,
} from "@larry/shared";
import { TIMELINE2_GANTT_COLUMN_ORDER } from "@larry/shared/timeline2";
import {
  addDays,
  dateKey,
  flattenTreeWithOutline,
  KIND_LABELS,
  normalizeText,
  type OutlineTimeline2Node,
} from "./timeline2-ui";
import { diffDays } from "./timeline2-ui";

export type TimelineColumnKey = (typeof TIMELINE2_GANTT_COLUMN_ORDER)[number];
export type ResizableColumnKey = Exclude<TimelineColumnKey, "task_name">;

export const TIMELINE_GANTT_COLUMN_KEYS = [...TIMELINE2_GANTT_COLUMN_ORDER] as TimelineColumnKey[];

export type DependencyDirection = "blocked_by" | "unblocks";

export function buildRange(nodes: Timeline2Node[], scale: number) {
  const today = dateKey(new Date());
  const starts = nodes
    .map((node) => node.rollup.startDate ?? node.startDate)
    .filter(Boolean) as string[];
  const dues = nodes
    .map((node) => node.rollup.dueDate ?? node.dueDate)
    .filter(Boolean) as string[];
  const start = starts.length > 0 ? [...starts].sort()[0] : dateKey(addDays(new Date(), -5));
  const end = dues.length > 0 ? [...dues].sort()[dues.length - 1] : dateKey(addDays(new Date(), 28));
  const paddedStart = dateKey(addDays(new Date(`${start}T00:00:00`), -6));
  const paddedEnd = dateKey(addDays(new Date(`${end}T00:00:00`), 10));
  const total = Math.max(24, diffDays(paddedStart, paddedEnd) + 1);
  const maxDays = scale >= 52 ? 120 : 180;
  const days = Array.from({ length: Math.min(total, maxDays) }, (_, index) =>
    dateKey(addDays(new Date(`${paddedStart}T00:00:00`), index)),
  );
  return { start: paddedStart, end: days[days.length - 1], days, today };
}

export function monthSegments(days: string[]) {
  const segments: Array<{ key: string; label: string; span: number }> = [];
  for (const day of days) {
    const date = new Date(`${day}T00:00:00`);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const label = date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const last = segments[segments.length - 1];
    if (last?.key === key) last.span += 1;
    else segments.push({ key, label, span: 1 });
  }
  return segments;
}

export function visibleRows(
  nodes: Timeline2Node[],
  tree: Timeline2Node[],
  collapsedNodes: Set<string>,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return flattenTreeWithOutline(tree).filter(({ node }) => {
    let parent = node.parentId ? byId.get(node.parentId) ?? null : null;
    while (parent) {
      if (collapsedNodes.has(parent.id)) return false;
      parent = parent.parentId ? byId.get(parent.parentId) ?? null : null;
    }
    return true;
  });
}

export function changedNodeIds(branches: Timeline2Branch[]) {
  return new Set(
    branches.flatMap((branch) =>
      branch.operations
        .filter((operation) => operation.status === "pending" && operation.targetNodeId)
        .map((operation) => operation.targetNodeId as string),
    ),
  );
}

export function dependencyCount(nodeId: string, dependencies: Timeline2Dependency[]) {
  return dependencies.filter(
    (dependency) => dependency.fromNodeId === nodeId || dependency.toNodeId === nodeId,
  ).length;
}

export function rowSearchableText(row: OutlineTimeline2Node) {
  return normalizeText(
    [row.wbs, row.node.title, KIND_LABELS[row.node.kind], ...row.node.assignees.map((a) => a.name)].join(
      " ",
    ),
  );
}

export function relationPreview(
  relation: Timeline2DependencyRelation,
  sourceTitle: string,
  candidateTitle: string,
  direction: DependencyDirection,
) {
  const [from, to] =
    direction === "blocked_by" ? [candidateTitle, sourceTitle] : [sourceTitle, candidateTitle];
  switch (relation) {
    case "finish_to_start":
      return `${from} finishes before ${to} starts.`;
    case "start_to_start":
      return `${from} starts with ${to}.`;
    case "finish_to_finish":
      return `${from} finishes with ${to}.`;
    case "start_to_finish":
      return `${from} starts before ${to} finishes.`;
    default:
      return `${from} links to ${to}.`;
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function reorderColumns(
  order: TimelineColumnKey[],
  dragging: TimelineColumnKey,
  target: TimelineColumnKey,
) {
  if (dragging === target) return order;
  const next = order.filter((key) => key !== dragging);
  const targetIndex = next.indexOf(target);
  next.splice(targetIndex, 0, dragging);
  return next;
}

export function timelineColumnResizeBounds(key: ResizableColumnKey): [number, number] {
  switch (key) {
    case "status":
      return [72, 220];
    case "priority":
      return [64, 170];
    case "progress":
      return [88, 180];
    case "start_date":
      return [72, 150];
    case "due_date":
      return [72, 150];
    case "assignee":
      return [96, 300];
    default:
      return [64, 200];
  }
}
