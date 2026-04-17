import type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse } from "@larry/shared";

export type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse };

export type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] }
  | { kind: "subtask";  id: string; task: GanttTask };

export type ZoomLevel = "week" | "month" | "quarter";
export const ROW_HEIGHT = 36;

// Key format: "cat:<uuid>" for a real category, "cat:uncat" for the synthetic bucket.
export type CategoryColorMap = Map<string, string>;

// Larry purple — used when a category has no colour or a row has no category.
export const DEFAULT_CATEGORY_COLOUR = "#6c44f6";

// v3 — trailing status chip beside a bar (GanttStatusChip)
export interface StatusChipData {
  label: string;        // "NS" | "AR" | "OD" | "✓"
  fg: string;           // CSS colour (var() or hex)
  bg: string;           // CSS colour
  border: string | null; // CSS colour or null (no border)
}
