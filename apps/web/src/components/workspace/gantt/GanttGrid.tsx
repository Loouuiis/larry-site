"use client";
import { forwardRef, useMemo } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct } from "./gantt-utils";
import { GanttRow } from "./GanttRow";

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey }, ref,
) {
  const markers = useMemo(() => generateMarkers(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ minWidth: "max-content", position: "relative" }}>
        {/* Header */}
        <div style={{ position: "sticky", top: 0, height: 34, background: "#fff", borderBottom: "1px solid var(--border, #eaeaea)", zIndex: 1 }}>
          {markers.map((m, i) => (
            <span key={i} style={{ position: "absolute", left: `${m.pct}%`, top: 10, fontSize: 10, color: "var(--text-muted)" }}>
              {m.label}
            </span>
          ))}
        </div>

        {/* Today line */}
        <div style={{ position: "absolute", left: `${todayPct}%`, top: 34, bottom: 0, width: 1, background: "rgba(108, 68, 246, 0.4)", pointerEvents: "none", zIndex: 1 }} />

        {/* Rows */}
        {rows.map((r) => (
          <GanttRow key={r.key} row={r} range={range} hoveredKey={hoveredKey} selectedKey={selectedKey}
            onHoverKey={onHoverKey} onSelectKey={onSelectKey} />
        ))}
      </div>
    </div>
  );
});

function generateMarkers(range: TimelineRange, zoom: ZoomLevel): Array<{ pct: number; label: string }> {
  const markers: Array<{ pct: number; label: string }> = [];
  const cursor = new Date(range.start);

  if (zoom === "week") {
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (zoom === "month") {
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7 || 7));
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    cursor.setDate(1); cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return markers;
}
