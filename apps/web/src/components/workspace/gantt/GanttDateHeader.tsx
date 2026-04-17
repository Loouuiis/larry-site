"use client";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { generateDateAxis } from "./gantt-utils";

interface Props {
  range: TimelineRange;
  zoom: ZoomLevel;
}

export const GANTT_HEADER_HEIGHT = 48;

export function GanttDateHeader({ range, zoom }: Props) {
  const axis = generateDateAxis(range, zoom);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        height: GANTT_HEADER_HEIGHT,
        background: "var(--surface, #fff)",
        borderBottom: "1px solid var(--border, #f0edfa)",
        zIndex: 2,
      }}
    >
      {/* Month row */}
      <div
        style={{
          position: "relative",
          height: 20,
          borderBottom: "1px solid var(--border, #f0edfa)",
        }}
      >
        {axis.months.map((m, i) => (
          <div
            key={`${m.label}-${i}`}
            style={{
              position: "absolute",
              left: `${m.startPct}%`,
              width: `${Math.max(0, m.endPct - m.startPct)}%`,
              top: 0,
              bottom: 0,
              padding: "4px 0 0 8px",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2, #4b556b)",
              borderRight: i < axis.months.length - 1 ? "1px solid var(--border-2, #bdb7d0)" : "none",
              boxSizing: "border-box",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Day row */}
      <div style={{ position: "relative", height: 28 }}>
        {axis.days.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            style={{
              position: "absolute",
              left: `${d.pct}%`,
              transform: "translateX(-50%)",
              top: 8,
              fontSize: 10,
              color: "var(--text-2, #4b556b)",
              whiteSpace: "nowrap",
            }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
