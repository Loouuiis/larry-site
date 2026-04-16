"use client";
import { useMemo } from "react";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import type { GanttTask } from "./gantt-types";
import { buildProjectTree, normalizeGanttStatus } from "./gantt-utils";
import { GanttContainer } from "./GanttContainer";

interface Props {
  projectId: string;
  projectName: string;
  tasks: WorkspaceTimelineTask[];
  timeline: WorkspaceTimeline | null;
  refresh: () => Promise<void>;
}

function toGanttTask(t: WorkspaceTimelineTask): GanttTask {
  return {
    id: t.id,
    projectId: t.projectId ?? "",
    parentTaskId: t.parentTaskId ?? null,
    title: t.title,
    status: normalizeGanttStatus(t.status as string),
    priority: t.priority as GanttTask["priority"],
    assigneeUserId: t.assigneeUserId ?? null,
    assigneeName: t.assigneeName ?? null,
    startDate: t.startDate ?? null,
    endDate: t.endDate ?? t.dueDate ?? null,
    dueDate: t.dueDate ?? null,
    progressPercent: t.progressPercent ?? 0,
  };
}

export function ProjectGanttClient({ projectId, projectName, tasks }: Props) {
  const ganttTasks = useMemo(() => tasks.map(toGanttTask), [tasks]);
  const root = useMemo(
    () => buildProjectTree({ id: projectId, name: projectName, status: "active" }, ganttTasks),
    [projectId, projectName, ganttTasks],
  );

  return <GanttContainer root={root} defaultZoom="month" addLabel="+ Task" />;
}
