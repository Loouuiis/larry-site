"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
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

type AddCtx =
  | { mode: "task" }
  | { mode: "subtask"; parentTaskId: string }
  | { mode: "category" };

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

  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [categoryColour, setCategoryColour] = useState<string>(DEFAULT_CATEGORY_COLOUR);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to remove task from timeline");
      }
    }
    if (action === "delete" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      if (!window.confirm("Delete this task?")) return;
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to delete task");
      }
    }
    if (action === "addChild" && rowKind === "project") {
      setAddCtx({ mode: "task" });
    }
  }

  // Label text only — GanttToolbar provides the leading <Plus /> icon.
  const addLabel = selectedKey?.startsWith("task:") ? "Subtask" : "Task";

  return (
    <>
      {mutationError && (
        <div
          role="alert"
          style={{
            margin: "8px 0",
            padding: "8px 12px",
            background: "var(--pm-red-light)",
            border: "1px solid var(--pm-red)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--pm-red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{mutationError}</span>
          <button
            onClick={() => setMutationError(null)}
            aria-label="Dismiss error"
            style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}
      <GanttContainer
        root={root}
        defaultZoom="month"
        addLabel={addLabel}
        onAdd={handleAdd}
        onSelectionChange={setSelectedKey}
        rootCategoryColor={categoryColour}
        onContextMenuAction={handleContextMenuAction}
        categoriesForSubmenu={[]}
        outlineHeaderActions={
          <button
            type="button"
            onClick={() => setAddCtx({ mode: "category" })}
            aria-label="New category in this project"
            title="New category in this project"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              height: 24,
              padding: "0 8px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: "var(--brand)",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <Plus size={12} strokeWidth={2.5} />
            Category
          </button>
        }
      />
      {addCtx && (
        <AddNodeModal
          mode={addCtx.mode === "subtask" ? "subtask" : addCtx.mode === "task" ? "task" : "category"}
          parentProjectId={addCtx.mode === "task" || addCtx.mode === "subtask" ? projectId : undefined}
          parentTaskId={addCtx.mode === "subtask" ? addCtx.parentTaskId : undefined}
          scopedProjectId={addCtx.mode === "category" ? projectId : undefined}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await refresh(); }}
        />
      )}
    </>
  );
}
