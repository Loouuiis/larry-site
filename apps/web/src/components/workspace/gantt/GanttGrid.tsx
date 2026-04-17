"use client";
import { forwardRef, useMemo } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel, GanttNode } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct, generateDateAxis } from "./gantt-utils";
import { GanttRow } from "./GanttRow";
import { GanttDateHeader, GANTT_HEADER_HEIGHT } from "./GanttDateHeader";

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu }, ref,
) {
  const axis = useMemo(() => generateDateAxis(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ minWidth: "max-content", position: "relative" }}>
        <GanttDateHeader range={range} zoom={zoom} />

        {/* Gridlines — below the axis band, down to grid bottom */}
        <div style={{ position: "absolute", top: GANTT_HEADER_HEIGHT, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 0 }}>
          {axis.days.map((d, i) => (
            <div
              key={`grid-${i}`}
              style={{
                position: "absolute",
                left: `${d.pct}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: d.isMonthStart ? "var(--border)" : "var(--border-2)",
                opacity: d.isMonthStart ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* Today vertical line — no pill (label is in the header) */}
        {todayInRange && (
          <div
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              top: GANTT_HEADER_HEIGHT,
              bottom: 0,
              width: 1.5,
              background: "var(--brand)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}

        {/* Rows */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ height: r.height }}>
              <GanttRow
                row={r}
                range={range}
                hoveredKey={hoveredKey}
                selectedKey={selectedKey}
                onHoverKey={onHoverKey}
                onSelectKey={onSelectKey}
                onContextMenu={onContextMenu}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
