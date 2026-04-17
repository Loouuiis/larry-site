"use client";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import type { GanttTask, ProjectCategory, ContextMenuAction, GanttNode } from "./gantt-types";
import { DEFAULT_CATEGORY_COLOUR } from "./gantt-types";
import { buildProjectTree, buildCategoryColorMap, normalizeGanttStatus } from "./gantt-utils";
import { GanttContainer } from "./GanttContainer";
import { AddNodeModal } from "./AddNodeModal";

interface Props {
  projectId: string;
  projectName: string;
  tasks: WorkspaceTimelineTask[];
  timeline: WorkspaceTimeline | null;
  refresh: () => Promise<void>;
}

type ProjectSummary = { id: string; categoryId: string | null };

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
  const [categoryColour, setCategoryColour] = useState<string>(DEFAULT_CATEGORY_COLOUR);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectsRes, categoriesRes] = await Promise.all([
          fetch("/api/workspace/projects?status=all", { cache: "no-store" }),
          fetch("/api/workspace/categories", { cache: "no-store" }),
        ]);
        if (!projectsRes.ok || !categoriesRes.ok) return;
        const projectsBody = await projectsRes.json() as { items?: ProjectSummary[] };
        const categoriesBody = await categoriesRes.json() as { categories?: ProjectCategory[] };
        const project = (projectsBody.items ?? []).find((p) => p.id === projectId);
        const categoryId = project?.categoryId ?? null;
        const map = buildCategoryColorMap(categoriesBody.categories?.map((c) => ({ id: c.id, colour: c.colour })) ?? []);
        const colour = categoryId ? (map.get(`cat:${categoryId}`) ?? DEFAULT_CATEGORY_COLOUR) : DEFAULT_CATEGORY_COLOUR;
        if (!cancelled) setCategoryColour(colour);
      } catch {
        // fallback stays Larry purple
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  function handleAdd(context: { selectedKey: string | null }) {
    if (context.selectedKey?.startsWith("task:")) {
      setAddCtx({ mode: "subtask", parentTaskId: context.selectedKey.slice("task:".length) });
    } else {
      setAddCtx({ mode: "task" });
    }
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null },
  ) {
    const { rowKey, rowKind } = args;
    if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: null, dueDate: null }),
        });
        if (!res.ok) return;
        await refresh();
      } catch { /* silent */ }
    }
    if (action === "delete" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      if (!window.confirm("Delete this task?")) return;
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
        if (!res.ok) return;
        await refresh();
      } catch { /* silent */ }
    }
    if (action === "addChild" && rowKind === "project") {
      setAddCtx({ mode: "task" });
    }
  }

  const addLabel =
    selectedKey?.startsWith("task:") ? "+ Subtask" :
    "+ Task";

  return (
    <>
      <GanttContainer
        root={root}
        defaultZoom="month"
        addLabel={addLabel}
        onAdd={handleAdd}
        onSelectionChange={setSelectedKey}
        rootCategoryColor={categoryColour}
        onContextMenuAction={handleContextMenuAction}
        categoriesForSubmenu={[]}
      />
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
