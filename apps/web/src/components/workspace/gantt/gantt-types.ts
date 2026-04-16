import type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse } from "@larry/shared";

export type { GanttTask, GanttTaskStatus, ProjectCategory, PortfolioTimelineResponse };

export type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] }
  | { kind: "subtask";  id: string; task: GanttTask };

export type ZoomLevel = "week" | "month" | "quarter";
export const ROW_HEIGHT = 36;
