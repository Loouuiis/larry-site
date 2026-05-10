import type {
  Timeline2DependencyRelation,
  Timeline2Node,
  Timeline2NodeKind,
  Timeline2Priority,
  Timeline2Status,
} from "@larry/shared";
import { timeline2DisplayStatus } from "@larry/shared/timeline2";
import type { Timeline2NodeInput } from "@/hooks/useTimeline2";

export type Mode = "tasks" | "timeline";

export interface NodeSheetState {
  mode: "create" | "edit";
  nodeId?: string;
  draft: Timeline2NodeInput;
}

export interface FlattenedTimeline2Node {
  node: Timeline2Node;
  depth: number;
}

export interface OutlineTimeline2Node extends FlattenedTimeline2Node {
  wbs: string;
  path: number[];
  isLastSibling: boolean;
  ancestorHasNext: boolean[];
  parentIds: string[];
}

export const STATUS_LABELS: Record<Timeline2Status, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLORS: Record<Timeline2Status, { bg: string; fg: string; bar: string; soft: string }> = {
  not_started: { bg: "#eef0f6", fg: "#596174", bar: "#aab0bf", soft: "#f6f7fb" },
  in_progress: { bg: "#e8f2ff", fg: "#1d5f99", bar: "#5ea3dc", soft: "#f3f8ff" },
  waiting: { bg: "#fff7df", fg: "#8a6400", bar: "#d6a82d", soft: "#fffaf0" },
  blocked: { bg: "#fff0f1", fg: "#b4233a", bar: "#e06373", soft: "#fff7f8" },
  completed: { bg: "#ecf8ee", fg: "#26733a", bar: "#55b96b", soft: "#f4fbf5" },
  cancelled: { bg: "#f3f1f5", fg: "#72687c", bar: "#a89eb3", soft: "#f8f6fa" },
};

export const PRIORITY_LABELS: Record<Timeline2Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const PRIORITY_COLORS: Record<Timeline2Priority, string> = {
  low: "#26733a",
  medium: "#214968",
  high: "#a16207",
  critical: "#b4233a",
};

export const KIND_LABELS: Record<Timeline2NodeKind, string> = {
  group: "Workstream",
  task: "Task",
  milestone: "Milestone",
};

export const DEPENDENCY_LABELS: Record<Timeline2DependencyRelation, string> = {
  finish_to_start: "Finish to start",
  start_to_start: "Start to start",
  finish_to_finish: "Finish to finish",
  start_to_finish: "Start to finish",
};

export function flattenTree(nodes: Timeline2Node[], depth = 0): FlattenedTimeline2Node[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
}

export function flattenTreeWithOutline(
  nodes: Timeline2Node[],
  depth = 0,
  pathPrefix: number[] = [],
  ancestorHasNext: boolean[] = [],
  parentIds: string[] = [],
): OutlineTimeline2Node[] {
  return nodes.flatMap((node, index) => {
    const path = [...pathPrefix, index + 1];
    const isLastSibling = index === nodes.length - 1;
    const nextAncestorHasNext = [...ancestorHasNext, !isLastSibling];
    return [
      {
        node,
        depth,
        wbs: path.join("."),
        path,
        isLastSibling,
        ancestorHasNext,
        parentIds,
      },
      ...flattenTreeWithOutline(
        node.children,
        depth + 1,
        path,
        nextAncestorHasNext,
        [...parentIds, node.id],
      ),
    ];
  });
}

export function formatDate(value?: string | null): string {
  if (!value) return "--";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Unscheduled";
  if (start === end || !end) return formatDate(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function diffDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function nodeToDraft(node: Timeline2Node): Timeline2NodeInput {
  return {
    parentId: node.parentId,
    kind: node.kind,
    title: node.title,
    description: node.description,
    status: timeline2DisplayStatus(node),
    priority: node.priority,
    startDate: node.startDate,
    dueDate: node.dueDate,
    progress: node.progress,
    actionRequired: node.actionRequired,
    assigneeUserIds: node.assignees.map((assignee) => assignee.userId),
    sortOrder: node.sortOrder,
  };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
