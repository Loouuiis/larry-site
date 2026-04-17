"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioTimelineResponse, ContextMenuAction, GanttNode } from "@/components/workspace/gantt/gantt-types";
import { buildPortfolioTree, buildCategoryColorMap, normalizePortfolioStatuses } from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";
import { AddNodeModal } from "@/components/workspace/gantt/AddNodeModal";
import { CategoryManagerPanel } from "@/components/workspace/gantt/CategoryManagerPanel";
import { GanttEmptyState } from "@/components/workspace/gantt/GanttEmptyState";
import type { CategoryOption } from "@/components/workspace/gantt/GanttContextMenu";

type AddCtx =
  | { mode: "category" }
  | { mode: "project"; parentCategoryId?: string }
  | { mode: "task"; parentProjectId: string }
  | { mode: "subtask"; parentProjectId: string; parentTaskId: string };

export function PortfolioGanttClient() {
  const [data, setData] = useState<PortfolioTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void fetchTimeline(); }, [fetchTimeline]);

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

  if (error) return <div style={{ padding: 24 }}>Couldn&apos;t load timeline: {error}</div>;
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
    if (!selectedKey) return "+ Category";
    if (selectedKey.startsWith("cat:")) {
      const id = selectedKey.slice(4);
      const cat = data?.categories.find((c) => c.id === (id === "uncat" ? null : id));
      const name = cat?.name ?? "";
      return `+ Project${name ? " in " + name : ""}`;
    }
    if (selectedKey.startsWith("proj:")) {
      const id = selectedKey.slice(5);
      let pname = "";
      for (const cat of data!.categories) {
        const p = cat.projects.find((pp) => pp.id === id);
        if (p) { pname = p.name; break; }
      }
      return `+ Task${pname ? " in " + pname : ""}`;
    }
    if (selectedKey.startsWith("task:")) {
      const taskId = selectedKey.slice(5);
      let tname = "";
      for (const cat of data!.categories) for (const p of cat.projects) {
        const t = p.tasks.find((tt) => tt.id === taskId);
        if (t) { tname = t.title; break; }
      }
      return `+ Subtask${tname ? " in " + tname : ""}`;
    }
    return "+ Category";
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

  async function handleContextMenuAction(
    action: ContextMenuAction,
    args: { rowKey: string; rowKind: GanttNode["kind"]; categoryId?: string | null },
  ) {
    const { rowKey, rowKind, categoryId } = args;

    if (action === "moveToCategory" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      const projectId = taskProjectLookup.get(taskId);
      if (!projectId) return;
      try {
        const res = await fetch(`/api/workspace/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: categoryId ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "moveToCategory" && rowKind === "project") {
      const projectId = rowKey.slice(5);
      try {
        const res = await fetch(`/api/workspace/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: categoryId ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to move project");
      }
      return;
    }

    if (action === "removeFromTimeline" && (rowKind === "task" || rowKind === "subtask")) {
      const taskId = rowKey.startsWith("task:") ? rowKey.slice(5) : rowKey.slice(4);
      try {
        const res = await fetch(`/api/workspace/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: null, dueDate: null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchTimeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove task from timeline");
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
          setError(e instanceof Error ? e.message : "Failed to delete task");
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
          setError(e instanceof Error ? e.message : "Failed to delete project");
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
          setError(e instanceof Error ? e.message : "Failed to delete category");
        }
      }
      return;
    }

    if ((action === "rename" || action === "changeColour") && rowKind === "category") {
      // Open the Categories drawer — user finishes the edit there.
      setManagerOpen(true);
      return;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to select it.
      </p>

      {isTrulyEmpty ? (
        <GanttEmptyState
          kind="noCategories"
          onCreate={() => setAddCtx({ mode: "category" })}
        />
      ) : (
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
        />
      )}

      {managerOpen && (
        <CategoryManagerPanel
          onClose={() => setManagerOpen(false)}
          onChanged={async () => { await fetchTimeline(); }}
        />
      )}

      {addCtx && (
        <AddNodeModal
          mode={addCtx.mode}
          parentCategoryId={addCtx.mode === "project" ? addCtx.parentCategoryId : undefined}
          parentProjectId={addCtx.mode === "task" || addCtx.mode === "subtask" ? addCtx.parentProjectId : undefined}
          parentTaskId={addCtx.mode === "subtask" ? addCtx.parentTaskId : undefined}
          onClose={() => setAddCtx(null)}
          onCreated={async () => { await fetchTimeline(); }}
        />
      )}
    </div>
  );
}
