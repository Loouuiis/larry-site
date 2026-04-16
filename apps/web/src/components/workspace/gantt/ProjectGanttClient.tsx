"use client";
import { useMemo, useState } from "react";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import type { GanttTask } from "./gantt-types";
import { buildProjectTree, normalizeGanttStatus } from "./gantt-utils";
import { GanttContainer } from "./GanttContainer";
import { AddNodeModal } from "./AddNodeModal";

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

export function ProjectGanttClient({ projectId, projectName, tasks, timeline, refresh }: Props) {
  const source = (timeline?.gantt && timeline.gantt.length > 0) ? timeline.gantt : tasks;
  const ganttTasks = useMemo(() => (source as WorkspaceTimelineTask[]).map(toGanttTask), [source]);
  const root = useMemo(
    () => buildProjectTree({ id: projectId, name: projectName, status: "active" }, ganttTasks),
    [projectId, projectName, ganttTasks],
  );

  const [addCtx, setAddCtx] = useState<{ mode: "task" | "subtask"; parentTaskId?: string } | null>(null);

  function handleAdd(context: { selectedKey: string | null }) {
    if (context.selectedKey?.startsWith("task:")) {
      setAddCtx({ mode: "subtask", parentTaskId: context.selectedKey.slice("task:".length) });
    } else {
      setAddCtx({ mode: "task" });
    }
  }

  return (
    <>
      <GanttContainer root={root} defaultZoom="month" addLabel={addCtx?.mode === "subtask" ? "+ Subtask" : "+ Task"} onAdd={handleAdd} />
      {addCtx && (
        <AddNodeModal
          mode={addCtx.mode}
          parentProjectId={projectId}
          parentTaskId={addCtx.parentTaskId}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await refresh(); }}
        />
      )}
    </>
  );
}
