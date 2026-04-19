"use client";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { PortfolioTimelineResponse, ContextMenuAction, GanttNode } from "@/components/workspace/gantt/gantt-types";
import {
  buildPortfolioTree, buildCategoryColorMap, normalizePortfolioStatuses,
  validateDrop, type DropContext,
} from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";
import { AddNodeModal } from "@/components/workspace/gantt/AddNodeModal";
import { CategoryManagerPanel } from "@/components/workspace/gantt/CategoryManagerPanel";
import { GanttEmptyState } from "@/components/workspace/gantt/GanttEmptyState";
import { CategoryColourPopover } from "@/components/workspace/gantt/CategoryColourPopover";
import type { CategoryOption } from "@/components/workspace/gantt/GanttContextMenu";
import { useTimelineSnapshot, QK_TIMELINE_ORG } from "@/hooks/useTimelineSnapshot";

type AddCtx =
  | { mode: "category" }
  | { mode: "subcategory"; parentCategoryId: string }
  | { mode: "projectCategory"; projectId: string }    // v4 Slice 4.5 — project-scoped category
  | { mode: "project"; parentCategoryId?: string }
  | { mode: "task"; parentProjectId: string }
  | { mode: "subtask"; parentProjectId: string; parentTaskId: string };

type ColourPopover = { categoryId: string; currentColour: string | null; x: number; y: number };

export function PortfolioGanttClient() {
  const qc = useQueryClient();
  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [colourPopover, setColourPopover] = useState<ColourPopover | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // v4 Slice 3A — the timeline read is now React Query. Mutations invalidate
  // QK_TIMELINE_ORG to trigger a refetch; the cached payload stays mounted
  // during refetch so the Gantt never blanks between writes.
  const { data, error: queryError, isError: isFetchError, refetch } = useTimelineSnapshot();

  // Merge query-error and mutation-error into a single banner stream.
  const error =
    mutationError
      ?? (isFetchError ? (queryError instanceof Error ? queryError.message : "Failed to load") : null);

  // Fire-and-forget invalidation — used after every mutation. Consumers of
  // these keys (Task Center, My Tasks, etc.) refetch automatically when they
  // become active again.
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
  };

  // Keep the legacy callback-name for existing consumers (modal onCreated,
  // CategoryManagerPanel onChanged). Invalidate + rely on React Query to
  // refetch, rather than the old per-page `fetchTimeline()` ad-hoc refetch.
  const fetchTimeline = async () => { invalidateAll(); };

  // v4 Slice 4 — drag-and-drop for the full matrix (categories, projects,
  // tasks, subtasks). Sensors keep a 5px activation distance so ordinary
  // clicks on rows don't accidentally start a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Helper used by the optimistic snapshot path — walks up via
  // parentCategoryId so we can locate a category's current ancestor chain
  // for rollback after failure.
  //
  // (Runtime cycle detection for drops now lives in validateDrop; this
  // helper is retained only for the optimistic-update path if it ever needs
  // ancestor awareness again.)

  // v4 Slice 4 — three mutations, one per effect emitted by validateDrop.
  // Each uses the existing optimistic-update + rollback pattern from Slice 3C.
  const moveCategoryMutation = useMutation({
    mutationFn: async (vars: { id: string; parentCategoryId: string | null; projectId: string | null; sortOrder: number }) => {
      const res = await fetch(`/api/workspace/categories/${vars.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentCategoryId: vars.parentCategoryId,
          projectId: vars.projectId,
          sortOrder: vars.sortOrder,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string; error?: string }).message
          ?? (body as { message?: string; error?: string }).error
          ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json();
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: QK_TIMELINE_ORG });
      const previous = qc.getQueryData<PortfolioTimelineResponse>(QK_TIMELINE_ORG);
      qc.setQueryData<PortfolioTimelineResponse>(QK_TIMELINE_ORG, (old) => {
        if (!old) return old;
        return {
          ...old,
          categories: old.categories.map((c) =>
            c.id === vars.id
              ? { ...c, parentCategoryId: vars.parentCategoryId, projectId: vars.projectId }
              : c,
          ),
        };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(QK_TIMELINE_ORG, ctx.previous);
      setMutationError(err instanceof Error ? err.message : "Couldn't move category");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG });
    },
  });

  const moveProjectMutation = useMutation({
    mutationFn: async (vars: { id: string; categoryId: string | null }) => {
      const res = await fetch(`/api/workspace/projects/${vars.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: vars.categoryId, sortOrder: 0 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { message?: string; error?: string }).message
          ?? (body as { message?: string; error?: string }).error
          ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json();
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: QK_TIMELINE_ORG });
      const previous = qc.getQueryData<PortfolioTimelineResponse>(QK_TIMELINE_ORG);
      // Optimistic: the server payload buckets projects under their
      // category's `projects[]` array, so we pluck the project out of its
      // current bucket and push it into the target one.
      qc.setQueryData<PortfolioTimelineResponse>(QK_TIMELINE_ORG, (old) => {
        if (!old) return old;
        let moved: PortfolioTimelineResponse["categories"][number]["projects"][number] | undefined;
        const nextCats = old.categories.map((c) => {
          const keep: typeof c.projects = [];
          for (const p of c.projects) {
            if (p.id === vars.id) moved = p; else keep.push(p);
          }
          return keep.length === c.projects.length ? c : { ...c, projects: keep };
        });
        if (!moved) return old;  // project not found in payload; let refetch handle it
        const targetId = vars.categoryId;
        const targetIdx = nextCats.findIndex((c) =>
          targetId === null ? c.id === null : c.id === targetId,
        );
        if (targetIdx === -1) return { ...old, categories: nextCats };
        const target = nextCats[targetIdx];
        nextCats[targetIdx] = { ...target, projects: [...target.projects, moved] };
        return { ...old, categories: nextCats };
      });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(QK_TIMELINE_ORG, ctx.previous);
      setMutationError(err instanceof Error ? err.message : "Couldn't move project");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG });
    },
  });

  const moveTaskMutation = useMutation({
    mutationFn: async (vars: { id: string; projectId: string | null; parentTaskId: string | null }) => {
      const body: Record<string, unknown> = {};
      if (vars.projectId !== null) body.projectId = vars.projectId;
      body.parentTaskId = vars.parentTaskId;
      const res = await fetch(`/api/workspace/tasks/${vars.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        const msg = (respBody as { message?: string; error?: string }).message
          ?? (respBody as { message?: string; error?: string }).error
          ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json();
    },
    onMutate: async () => {
      // Task optimism is more invasive because tasks live in a nested
      // category.projects[].tasks[] array; for now we skip the optimistic
      // update and rely on refetch. Perceived latency is still < 200 ms
      // on Vercel because the Gantt keeps its current render until settle.
      await qc.cancelQueries({ queryKey: QK_TIMELINE_ORG });
      const previous = qc.getQueryData<PortfolioTimelineResponse>(QK_TIMELINE_ORG);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(QK_TIMELINE_ORG, ctx.previous);
      setMutationError(err instanceof Error ? err.message : "Couldn't move task");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QK_TIMELINE_ORG });
    },
  });

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || !data) return;
    const sourceKey = String(e.active.id);
    const targetKey = String(e.over.id);

    // Build the DropContext from the flat payload so validateDrop can do
    // cycle detection and target lookups without walking the rendered tree.
    const categoriesById = new Map<string, { parentCategoryId: string | null; projectId: string | null }>();
    for (const c of data.categories) {
      if (c.id) categoriesById.set(c.id, { parentCategoryId: c.parentCategoryId ?? null, projectId: c.projectId ?? null });
    }
    const tasksById = new Map<string, { projectId: string; parentTaskId: string | null }>();
    for (const cat of data.categories) {
      for (const p of cat.projects) {
        for (const t of p.tasks) {
          tasksById.set(t.id, { projectId: p.id, parentTaskId: t.parentTaskId ?? null });
        }
      }
    }
    const ctx: DropContext = { categoriesById, tasksById };

    const validation = validateDrop(sourceKey, targetKey, ctx);
    if (!validation.ok) {
      // Silent reject on self-drop (common mis-click); toast everything else.
      if (sourceKey !== targetKey) setMutationError(validation.reason);
      return;
    }

    switch (validation.effect.kind) {
      case "moveCategory":
        moveCategoryMutation.mutate({
          id: validation.effect.sourceId,
          parentCategoryId: validation.effect.newParentCategoryId,
          projectId: validation.effect.newProjectId,
          sortOrder: 0,
        });
        return;
      case "moveProject":
        moveProjectMutation.mutate({
          id: validation.effect.sourceId,
          categoryId: validation.effect.newCategoryId,
        });
        return;
      case "moveTask":
        moveTaskMutation.mutate({
          id: validation.effect.sourceId,
          projectId: validation.effect.newProjectId,
          parentTaskId: validation.effect.newParentTaskId,
        });
        return;
    }
  }

  const categoryColorMap = useMemo(
    () => data ? buildCategoryColorMap(data.categories.map((c) => ({ id: c.id, colour: c.colour }))) : undefined,
    [data],
  );

  const categoriesForSubmenu: CategoryOption[] = useMemo(() => {
    if (!data) return [];
    const real: CategoryOption[] = data.categories
      .filter((c) => c.id !== null)
      .map((c) => ({ id: c.id as string, name: c.name, colour: c.colour ?? "#6c44f6" }));
    return [...real, { id: null, name: "Uncategorised", colour: "#bdb7d0" }];
  }, [data]);

  if (!data && error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBanner message={error} onDismiss={() => setMutationError(null)} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const normalized = normalizePortfolioStatuses(data);
  const root = buildPortfolioTree(normalized);

  const hasRealCategories = data.categories.some((c) => c.id !== null);
  const hasUncategorised = data.categories.some((c) => c.id === null && c.projects.length > 0);
  const isTrulyEmpty = !hasRealCategories && !hasUncategorised;

  // task.id → project.id lookup for context-menu actions
  const taskProjectLookup = new Map<string, string>();
  for (const cat of data.categories) {
    for (const p of cat.projects) {
      for (const t of p.tasks) taskProjectLookup.set(t.id, p.id);
    }
  }

  function selectionContextAddLabel(): string {
    // Label text only — the GanttToolbar renders a <Plus /> icon alongside
    // this string. Do NOT include a leading "+" here or it doubles up.
    if (!selectedKey) return "Category";
    if (selectedKey.startsWith("cat:")) {
      const id = selectedKey.slice(4);
      const cat = data?.categories.find((c) => c.id === (id === "uncat" ? null : id));
      const name = cat?.name ?? "";
      return `Project${name ? " in " + name : ""}`;
    }
    if (selectedKey.startsWith("proj:")) {
      const id = selectedKey.slice(5);
      let pname = "";
      for (const cat of data!.categories) {
        const p = cat.projects.find((pp) => pp.id === id);
        if (p) { pname = p.name; break; }
      }
      return `Task${pname ? " in " + pname : ""}`;
    }
    if (selectedKey.startsWith("task:")) {
      const taskId = selectedKey.slice(5);
      let tname = "";
      for (const cat of data!.categories) for (const p of cat.projects) {
        const t = p.tasks.find((tt) => tt.id === taskId);
        if (t) { tname = t.title; break; }
      }
      return `Subtask${tname ? " in " + tname : ""}`;
    }
    return "Category";
  }

  function handleAdd(context: { selectedKey: string | null }) {
    const k = context.selectedKey;
    if (!k) { setAddCtx({ mode: "category" }); return; }
    if (k.startsWith("cat:")) {
      const id = k.slice(4);
      setAddCtx({ mode: "project", parentCategoryId: id === "uncat" ? undefined : id });
      return;
    }
    if (k.startsWith("proj:")) {
      setAddCtx({ mode: "task", parentProjectId: k.slice(5) });
      return;
    }
    if (k.startsWith("task:")) {
      const taskId = k.slice(5);
      const projectId = taskProjectLookup.get(taskId);
      if (projectId) setAddCtx({ mode: "subtask", parentProjectId: projectId, parentTaskId: taskId });
      return;
    }
    setAddCtx({ mode: "category" });
  }

  // Lookup a project's archived status by id, for preflight on write actions.
  const projectStatusById = new Map<string, string>();
  for (const cat of data.categories) {
    for (const p of cat.projects) projectStatusById.set(p.id, p.status);
  }
  const isArchived = (projectId: string | null | undefined): boolean =>
    !!projectId && projectStatusById.get(projectId) === "archived";

  // Shared error-extraction for API responses, so the archived-project message
  // (HTTP 409 + { message: ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE }) surfaces
  // verbatim instead of "HTTP 409".
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

    if (action === "moveToCategory" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      const projectId = taskProjectLookup.get(taskId);
      if (!projectId) return;
      if (isArchived(projectId)) {
        setMutationError("That task's project is archived — unarchive it first to move it between categories.");
        return;
      }
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
        await fetchTimeline();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "moveToCategory" && rowKind === "project") {
      const projectId = rowKey.slice(5);
      if (isArchived(projectId)) {
        setMutationError("That project is archived — unarchive it first to move it between categories.");
        return;
      }
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
        await fetchTimeline();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      const projectId = taskProjectLookup.get(taskId);
      if (isArchived(projectId)) {
        setMutationError("That task's project is archived — unarchive it first to edit task dates.");
        return;
      }
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: null, dueDate: null }),
        });
        if (!res.ok) {
          setMutationError(await extractApiError(res, "Couldn't remove this task from the timeline"));
          return;
        }
        await fetchTimeline();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to remove task from timeline");
      }
      return;
    }

    if (action === "addChild" && rowKind === "project") {
      setAddCtx({ mode: "task", parentProjectId: rowKey.slice(5) });
      return;
    }

    if (action === "delete") {
      if (rowKind === "task" || rowKind === "subtask") {
        const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
        if (!window.confirm("Delete this task?")) return;
        try {
          const res = await fetch(`/api/workspace/tasks/${taskId}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fetchTimeline();
        } catch (e) {
          setMutationError(e instanceof Error ? e.message : "Failed to delete task");
        }
      }
      if (rowKind === "project") {
        if (!window.confirm("Delete this project and all its tasks?")) return;
        try {
          const res = await fetch(`/api/workspace/projects/${rowKey.slice(5)}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fetchTimeline();
        } catch (e) {
          setMutationError(e instanceof Error ? e.message : "Failed to delete project");
        }
      }
      if (rowKind === "category") {
        const id = rowKey.slice(4);
        if (id === "uncat") return;
        if (!window.confirm("Delete this category? Projects will move to Uncategorised.")) return;
        try {
          const res = await fetch(`/api/workspace/categories/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fetchTimeline();
        } catch (e) {
          setMutationError(e instanceof Error ? e.message : "Failed to delete category");
        }
      }
      return;
    }

    if (action === "addSubcategory" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      setAddCtx({ mode: "subcategory", parentCategoryId: id });
      return;
    }

    if (action === "addCategory" && rowKind === "project") {
      // v4 Slice 4.5 — project-scoped category. The AddNodeModal renders
      // mode "category" with scopedProjectId set, so the server receives
      // projectId and the DB CHECK constraint enforces single-parent.
      setAddCtx({ mode: "projectCategory", projectId: rowKey.slice(5) });
      return;
    }

    if (action === "changeColour" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      const cat = data?.categories.find((c) => c.id === id);
      setColourPopover({
        categoryId: id,
        currentColour: cat?.colour ?? null,
        x: 0, y: 0,  // centred modal — position not used currently
      });
      return;
    }

    if (action === "rename" && rowKind === "category") {
      const id = rowKey.slice(4);
      if (id === "uncat") return;
      const cat = data?.categories.find((c) => c.id === id);
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
        await fetchTimeline();
      } catch (e) {
        setMutationError(e instanceof Error ? e.message : "Failed to rename category");
      }
      return;
    }
  }

  async function applyCategoryColour(hex: string) {
    if (!colourPopover) return;
    try {
      const res = await fetch(`/api/workspace/categories/${colourPopover.categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colour: hex }),
      });
      if (!res.ok) {
        setMutationError(await extractApiError(res, "Couldn't change colour"));
        return;
      }
      setColourPopover(null);
      await fetchTimeline();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to change colour");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to select it.
      </p>

      {error && (
        <div style={{ marginBottom: 12 }}>
          <ErrorBanner message={error} onDismiss={() => setMutationError(null)} onRetry={() => void refetch()} />
        </div>
      )}

      {isTrulyEmpty ? (
        <GanttEmptyState
          kind="noCategories"
          onCreate={() => setAddCtx({ mode: "category" })}
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <GanttContainer
          root={root}
          defaultZoom="month"
          addLabel={selectionContextAddLabel()}
          onAdd={handleAdd}
          onSelectionChange={setSelectedKey}
          categoryColorMap={categoryColorMap}
          onCategoriesClick={() => setManagerOpen((v) => !v)}
          categoriesOpen={managerOpen}
          onContextMenuAction={handleContextMenuAction}
          categoriesForSubmenu={categoriesForSubmenu}
          outlineHeaderActions={
            <button
              type="button"
              onClick={() => setAddCtx({ mode: "category" })}
              aria-label="New category"
              title="New category"
              style={{
                // v4 Slice 5 — icon-only pill so this doesn't duplicate the
                // toolbar "+ Category" button visually. The toolbar button is
                // contextual (label changes with selection); this one is the
                // always-creates-a-category shortcut for power users.
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                background: "var(--surface-2)",
                color: "var(--brand)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          }
        />
        </DndContext>
      )}

      {managerOpen && (
        <CategoryManagerPanel
          onClose={() => setManagerOpen(false)}
          onChanged={async () => { await fetchTimeline(); }}
        />
      )}

      {addCtx && (
        <AddNodeModal
          // subcategory + projectCategory both render as the "category" modal;
          // parent* / scopedProjectId pick which single-parent the server receives.
          mode={
            addCtx.mode === "subcategory" || addCtx.mode === "projectCategory"
              ? "category"
              : addCtx.mode
          }
          parentCategoryId={
            addCtx.mode === "project" ? addCtx.parentCategoryId :
            addCtx.mode === "subcategory" ? addCtx.parentCategoryId :
            undefined
          }
          scopedProjectId={addCtx.mode === "projectCategory" ? addCtx.projectId : undefined}
          parentProjectId={addCtx.mode === "task" || addCtx.mode === "subtask" ? addCtx.parentProjectId : undefined}
          parentTaskId={addCtx.mode === "subtask" ? addCtx.parentTaskId : undefined}
          requireDates={addCtx.mode === "task" || addCtx.mode === "subtask"}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await fetchTimeline(); }}
        />
      )}

      {colourPopover && (
        <CategoryColourPopover
          currentColour={colourPopover.currentColour}
          onApply={applyCategoryColour}
          onClose={() => setColourPopover(null)}
        />
      )}
    </div>
  );
}

function ErrorBanner({
  message, onDismiss, onRetry,
}: { message: string; onDismiss: () => void; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "#fdecef",
        border: "1px solid #f5c1cb",
        color: "#8a1f33",
        fontSize: 13,
      }}
    >
      <span style={{ flex: 1 }}>Couldn&apos;t load timeline: {message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: "transparent",
            border: "1px solid #d97a8b",
            color: "#8a1f33",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: 0,
          color: "#8a1f33",
          cursor: "pointer",
          display: "inline-flex",
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
