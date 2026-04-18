"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import type { GanttTask, ProjectCategory, ContextMenuAction, GanttNode } from "./gantt-types";
import { NEUTRAL_ROW_COLOUR } from "./gantt-types";
import { buildProjectTree, buildCategoryColorMap, normalizeGanttStatus } from "./gantt-utils";
import { GanttContainer } from "./GanttContainer";
import { AddNodeModal } from "./AddNodeModal";
import { CategoryColourPopover } from "./CategoryColourPopover";
import type { CategoryOption } from "./GanttContextMenu";

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
  | { mode: "category" }                                 // project-scoped, top-level
  | { mode: "subcategory"; parentCategoryId: string };   // v4 Slice 4 — nested

type ColourPopover = { categoryId: string; currentColour: string | null };

// v4 Slice 4 — share query keys with PortfolioGanttClient so invalidations
// travel across the two surfaces automatically.
const QK_CATEGORIES = ["categories"] as const;
const QK_PROJECTS = ["projects"] as const;

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
  const qc = useQueryClient();
  const source = (timeline?.gantt && timeline.gantt.length > 0) ? timeline.gantt : tasks;
  const ganttTasks = useMemo(() => (source as WorkspaceTimelineTask[]).map(toGanttTask), [source]);

  // v4 Slice 4 — categories + projects come from the same React Query cache that
  // the portfolio timeline populates. If the user navigated here from
  // /workspace/timeline within staleTime, the first render already has the
  // real colour + category tree (fixes the Larry-purple flash reproduced
  // 2026-04-18 at t=12,367 ms → t=13,006 ms).
  const { data: categoriesData } = useQuery({
    queryKey: QK_CATEGORIES,
    queryFn: async (): Promise<{ categories: ProjectCategory[] }> => {
      const res = await fetch("/api/workspace/categories", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
  const { data: projectsData } = useQuery({
    queryKey: QK_PROJECTS,
    queryFn: async (): Promise<{ items: ProjectSummary[] }> => {
      const res = await fetch("/api/workspace/projects?status=all", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const allCategories: ProjectCategory[] = categoriesData?.categories ?? [];

  // The project row's category colour — resolved synchronously from the shared
  // cache. Returns null when data isn't loaded yet; the Gantt renders neutral
  // grey (NEUTRAL_ROW_COLOUR) in that case, never Larry purple.
  const categoryColour: string | null = useMemo(() => {
    if (!projectsData || !categoriesData) return null;
    const proj = projectsData.items.find((p: ProjectSummary) => p.id === projectId);
    if (!proj?.categoryId) return null;
    const map = buildCategoryColorMap(categoriesData.categories.map((c: ProjectCategory) => ({ id: c.id, colour: c.colour })));
    return map.get(`cat:${proj.categoryId}`) ?? null;
  }, [categoriesData, projectsData, projectId]);

  const root = useMemo(
    () => buildProjectTree(
      { id: projectId, name: projectName, status: "active" },
      ganttTasks,
      allCategories,
    ),
    [projectId, projectName, ganttTasks, allCategories],
  );

  // Same shape as PortfolioGanttClient's submenu options — lets "Move to
  // category…" on a task inside the project offer every real category.
  const categoriesForSubmenu: CategoryOption[] = useMemo(() => {
    const real: CategoryOption[] = allCategories
      .filter((c) => !c.projectId || c.projectId === projectId)
      .map((c) => ({ id: c.id, name: c.name, colour: c.colour ?? "#6c44f6" }));
    return [...real, { id: null, name: "Uncategorised", colour: "#bdb7d0" }];
  }, [allCategories, projectId]);

  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [colourPopover, setColourPopover] = useState<ColourPopover | null>(null);

  const invalidateCategoryCaches = () => {
    void qc.invalidateQueries({ queryKey: QK_CATEGORIES });
    void qc.invalidateQueries({ queryKey: ["timeline", "org"] });
  };

  // Keep the refresh() contract for the parent page so tasks still re-render
  // after task-level mutations; chain React Query invalidation alongside.
  const refreshAll = async () => {
    await refresh();
    invalidateCategoryCaches();
    void qc.invalidateQueries({ queryKey: QK_PROJECTS });
  };

  function handleAdd(context: { selectedKey: string | null }) {
    if (context.selectedKey?.startsWith("task:")) {
      setAddCtx({ mode: "subtask", parentTaskId: context.selectedKey.slice("task:".length) });
    } else {
      setAddCtx({ mode: "task" });
    }
  }

  // Shared error extraction so archived-project + 422-from-Zod messages
  // surface as-is rather than "HTTP 409".
  async function extractApiError(res: Response, fallback: string): Promise<string> {
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown };
      const msg = typeof body.message === "string" ? body.message
                : typeof body.error   === "string" ? body.error
                : null;
      if (msg) return msg;
    } catch { /* body wasn't JSON */ }
    return `${fallback} (HTTP ${res.status})`;
  }

  async function handleContextMenuAction(
    action: ContextMenuAction,
    args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null },
  ) {
    const { rowKey, rowKind, categoryId } = args;

    // Task / subtask actions (unchanged pre-existing behaviour).
    if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: null, dueDate: null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refreshAll();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to remove task from timeline");
      }
      return;
    }
    if (action === "delete" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      if (!window.confirm("Delete this task?")) return;
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refreshAll();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to delete task");
      }
      return;
    }
    if (action === "addChild" && rowKind === "project") {
      setAddCtx({ mode: "task" });
      return;
    }
    if (action === "moveToCategory" && (rowKind === "task" || rowKind === "subtask")) {
      // Cross-category move for a task on the project timeline rewrites the
      // project's categoryId (same path as PortfolioGanttClient).
      try {
        const res = await fetch(`/api/workspace/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: categoryId ?? null }),
        });
        if (!res.ok) {
          setMutationError(await extractApiError(res, "Couldn't move this project"));
          return;
        }
        await refreshAll();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    // v4 Slice 4 — category-row actions, mirror of PortfolioGanttClient.
    if (action === "addSubcategory" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      setAddCtx({ mode: "subcategory", parentCategoryId: id });
      return;
    }
    if (action === "changeColour" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      const cat = allCategories.find((c) => c.id === id);
      setColourPopover({ categoryId: id, currentColour: cat?.colour ?? null });
      return;
    }
    if (action === "rename" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      const cat = allCategories.find((c) => c.id === id);
      const next = window.prompt("Rename category to:", cat?.name ?? "");
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === cat?.name) return;
      try {
        const res = await fetch(`/api/workspace/categories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) {
          setMutationError(await extractApiError(res, "Couldn't rename this category"));
          return;
        }
        invalidateCategoryCaches();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to rename category");
      }
      return;
    }
    if (action === "delete" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      if (!window.confirm("Delete this category? Subcategories will also be deleted.")) return;
      try {
        const res = await fetch(`/api/workspace/categories/${id}`, { method: "DELETE" });
        if (!res.ok) {
          setMutationError(await extractApiError(res, "Couldn't delete this category"));
          return;
        }
        invalidateCategoryCaches();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to delete category");
      }
      return;
    }
  }

  const applyCategoryColour = useMutation({
    mutationFn: async ({ id, colour }: { id: string; colour: string }) => {
      const res = await fetch(`/api/workspace/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colour }),
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res, "Couldn't change colour"));
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateCategoryCaches();
      setColourPopover(null);
    },
    onError: (err: unknown) => setMutationError(err instanceof Error ? err.message : "Failed to change colour"),
  });

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
        rootCategoryColor={categoryColour ?? NEUTRAL_ROW_COLOUR}
        onContextMenuAction={handleContextMenuAction}
        categoriesForSubmenu={categoriesForSubmenu}
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
          // subcategory mode reuses the category modal with parentCategoryId set.
          mode={
            addCtx.mode === "subtask"     ? "subtask"
            : addCtx.mode === "task"      ? "task"
            : /* category or subcategory */ "category"
          }
          parentProjectId={addCtx.mode === "task" || addCtx.mode === "subtask" ? projectId : undefined}
          parentTaskId={addCtx.mode === "subtask" ? addCtx.parentTaskId : undefined}
          parentCategoryId={addCtx.mode === "subcategory" ? addCtx.parentCategoryId : undefined}
          // Only the top-level "+ Category" in the toolbar targets this project;
          // a nested subcategory must NOT also send projectId (API CHECK enforces
          // exactly one parent).
          scopedProjectId={addCtx.mode === "category" ? projectId : undefined}
          requireDates={addCtx.mode === "task" || addCtx.mode === "subtask"}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await refreshAll(); }}
        />
      )}
      {colourPopover && (
        <CategoryColourPopover
          currentColour={colourPopover.currentColour}
          onApply={async (hex) => { await applyCategoryColour.mutateAsync({ id: colourPopover.categoryId, colour: hex }); }}
          onClose={() => setColourPopover(null)}
        />
      )}
    </>
  );
}
