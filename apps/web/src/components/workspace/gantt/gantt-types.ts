import type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse } from "@larry/shared";

export type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse };

// Timeline Slice 2 — subtasks now carry `children` so the tree supports
// arbitrary depth (task → subtask → subtask → …). The DB schema already
// allows it via `tasks.parent_task_id` chaining; the cap was a frontend
// artifact that made the feature look missing.
export type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] }
  | { kind: "subtask";  id: string; task: GanttTask; children: GanttNode[] };

export type ZoomLevel = "week" | "month" | "quarter";
export const ROW_HEIGHT = 32;            // category + project (v3)
export const ROW_HEIGHT_TASK = 28;       // task + subtask (v3)

// Key format: "cat:<uuid>" for a real category, "cat:uncat" for the synthetic bucket.
export type CategoryColorMap = Map<string, string>;

// Larry purple — used when a category has no colour or a row has no category.
export const DEFAULT_CATEGORY_COLOUR = "#6c44f6";

// v4 Slice 4 — neutral grey placeholder shown for a project-level Gantt while
// its category colour is loading. Never seed bars with DEFAULT_CATEGORY_COLOUR
// on first render; Larry purple looks *meaningful* (the brand colour) so it
// reads as a category choice rather than "data not loaded yet".
export const NEUTRAL_ROW_COLOUR = "#bdb7d0";

// v3 — trailing status chip beside a bar (GanttStatusChip)
export interface StatusChipData {
  label: string;        // "NS" | "AR" | "OD" | "✓"
  fg: string;           // CSS colour (var() or hex)
  bg: string;           // CSS colour
  border: string | null; // CSS colour or null (no border)
}

// v3 — right-click context menu
export type ContextMenuAction =
  | "openDetail"
  | "moveToCategory"   // submenu → category id payload
  | "removeFromTimeline"
  | "addChild"
  | "addSubcategory"   // v4 — only on category rows; creates category with parentCategoryId
  | "addCategory"      // v4 Slice 4.5 — only on project rows; creates a project-scoped category
  | "rename"
  | "changeColour"
  | "delete";

export interface ContextMenuItem {
  id: ContextMenuAction;
  label: string;
  hasSubmenu?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

// ─── Dependency / task-picker types ────────────────────────────────────
export type DependencyType = "FS" | "FF" | "SS" | "SF";

// Maps API relation strings (and their short forms) to DependencyType.
export const RELATION_TO_DEP_TYPE: Record<string, DependencyType> = {
  finish_to_start: "FS", FS: "FS",
  finish_to_finish: "FF", FF: "FF",
  start_to_start: "SS", SS: "SS",
  start_to_finish: "SF", SF: "SF",
};

export const DEP_TYPE_TO_RELATION: Record<DependencyType, string> = {
  FS: "finish_to_start",
  FF: "finish_to_finish",
  SS: "start_to_start",
  SF: "start_to_finish",
};

export interface TaskDependency {
  dependsOnId: string;
  type: DependencyType;
  offsetDays: number;
}

// Flat task record passed to AddNodeModal so users can pick parent/predecessor.
export interface AvailableTask {
  id: string;
  title: string;
  number: number;
  startDate: string | null;
  endDate: string | null;
  parentTaskId: string | null;
}

export interface ContextMenuState {
  rowKey: string;
  rowKind: "category" | "project" | "task" | "subtask";
  isUncategorised: boolean;
  x: number;
  y: number;
}
