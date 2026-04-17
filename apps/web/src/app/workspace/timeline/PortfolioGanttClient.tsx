"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";
import type { PortfolioTimelineResponse } from "@/components/workspace/gantt/gantt-types";
import { buildPortfolioTree, buildCategoryColorMap, normalizePortfolioStatuses } from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";
import { AddNodeModal } from "@/components/workspace/gantt/AddNodeModal";
import { CategoryManagerPanel } from "@/components/workspace/gantt/CategoryManagerPanel";

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

  if (error) return <div style={{ padding: 24 }}>Couldn't load timeline: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const normalized = normalizePortfolioStatuses(data);
  const root = buildPortfolioTree(normalized);

  function handleAdd(context: { selectedKey: string | null }) {
    if (context.selectedKey?.startsWith("cat:")) {
      const id = context.selectedKey.slice("cat:".length);
      setAddCtx({ mode: "project", parentCategoryId: id === "uncat" ? undefined : id });
    } else {
      setAddCtx({ mode: "category" });
    }
  }

  const addLabel =
    addCtx?.mode === "project" ? "+ Project"
      : addCtx?.mode === "task" ? "+ Task"
      : addCtx?.mode === "subtask" ? "+ Subtask"
      : "+ Category";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to open details.
      </p>

      <GanttContainer
        root={root}
        defaultZoom="month"
        addLabel={addLabel}
        onAdd={handleAdd}
        categoryColorMap={categoryColorMap}
        outlineHeaderActions={
          <button
            aria-label="Manage categories"
            onClick={() => setManagerOpen(true)}
            style={{
              background: "transparent",
              border: 0,
              padding: 4,
              borderRadius: 4,
              color: "var(--text-muted, #bdb7d0)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Settings size={14} />
          </button>
        }
        outlineOverlay={
          managerOpen ? (
            <CategoryManagerPanel
              onClose={() => setManagerOpen(false)}
              onChanged={async () => { await fetchTimeline(); }}
            />
          ) : null
        }
      />

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
