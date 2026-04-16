"use client";
import { useCallback, useEffect, useState } from "react";
import type { PortfolioTimelineResponse } from "@/components/workspace/gantt/gantt-types";
import { buildPortfolioTree, normalizePortfolioStatuses } from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";

export function PortfolioGanttClient() {
  const [data, setData] = useState<PortfolioTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <div style={{ padding: 24 }}>Couldn't load timeline: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const root = buildPortfolioTree(normalizePortfolioStatuses(data));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to open details.
      </p>
      <GanttContainer root={root} defaultZoom="month" addLabel="+ Add" />
    </div>
  );
}
