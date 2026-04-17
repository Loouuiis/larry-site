"use client";
import { forwardRef, useMemo } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct, generateDateAxis } from "./gantt-utils";
import { GanttRow } from "./GanttRow";
import { GanttDateHeader, GANTT_HEADER_HEIGHT } from "./GanttDateHeader";
import { ROW_HEIGHT } from "./gantt-types";

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
  const axis = useMemo(() => generateDateAxis(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ minWidth: "max-content", position: "relative" }}>
        <GanttDateHeader range={range} zoom={zoom} />

        {/* Vertical gridlines — render before rows so row content stacks on top */}
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
                background: d.isMonthStart
                  ? "var(--border-2, #bdb7d0)"
                  : "var(--surface-2, #f6f2fc)",
                opacity: d.isMonthStart ? 0.6 : 1,
              }}
            />
          ))}
        </div>

        {/* Today line (below the header, runs full height of rows) */}
        {todayInRange && (
          <>
            <div
              style={{
                position: "absolute",
                left: `${todayPct}%`,
                top: GANTT_HEADER_HEIGHT,
                bottom: 0,
                width: 1,
                background: "rgba(108, 68, 246, 0.4)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
            {/* Today pill */}
            <div
              style={{
                position: "absolute",
                left: `${todayPct}%`,
                top: GANTT_HEADER_HEIGHT - 18,
                transform: "translateX(-50%)",
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 600,
                color: "#6c44f6",
                background: "var(--surface, #fff)",
                border: "1px solid rgba(108, 68, 246, 0.35)",
                borderRadius: 4,
                pointerEvents: "none",
                zIndex: 3,
                whiteSpace: "nowrap",
              }}
            >
              Today
            </div>
          </>
        )}

        {/* Rows */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {rows.map((r) => {
            if (r.kind === "add") {
              return (
                <div
                  key={r.key}
                  style={{
                    height: r.height,
                    borderBottom: "1px solid var(--border, #f0edfa)",
                  }}
                />
              );
            }
            return (
              <div key={r.key} style={{ height: r.height ?? ROW_HEIGHT }}>
                <GanttRow
                  row={r}
                  range={range}
                  hoveredKey={hoveredKey}
                  selectedKey={selectedKey}
                  onHoverKey={onHoverKey}
                  onSelectKey={onSelectKey}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
