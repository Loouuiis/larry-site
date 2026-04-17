"use client";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { generateDateAxis, dateToPct } from "./gantt-utils";

interface Props {
  range: TimelineRange;
  zoom: ZoomLevel;
}

// 16px space above for the "Today" label + 48px axis band = 64px total
export const GANTT_HEADER_HEIGHT = 64;
const AXIS_BAND_HEIGHT = 48;
const TODAY_LABEL_BAND = 16;

// Horizontal scale: px-per-day per zoom. Drives the grid minWidth so day-
// number labels and month labels never overlap. Tuned so adjacent ticks are
// spaced comfortably wider than their labels (~16px for "23" at 11px tabular):
//   - week:    daily ticks × 36px = 36px between labels (20px gap)
//   - month:   weekly ticks × 14px per day = 98px between labels
//   - quarter: biweekly ticks × 8px per day = 112px between labels
export const PX_PER_DAY_BY_ZOOM: Record<ZoomLevel, number> = {
  week:    36,
  month:   14,
  quarter:  8,
};

export function GanttDateHeader({ range, zoom }: Props) {
  const axis = generateDateAxis(range, zoom);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        height: GANTT_HEADER_HEIGHT,
        background: "var(--surface)",
        zIndex: 3,
      }}
    >
      {/* Today label band (top 16px) */}
      <div style={{ position: "relative", height: TODAY_LABEL_BAND }}>
        {todayInRange && (
          <span
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              transform: "translateX(-50%)",
              top: 2,
              fontSize: 10,
              fontWeight: 600,
              color: "var(--brand)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            Today
          </span>
        )}
      </div>

      {/* Axis band (48px) — month row (24px) + day row (24px) */}
      <div
        style={{
          height: AXIS_BAND_HEIGHT,
          position: "relative",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Month row */}
        <div style={{ position: "relative", height: 24 }}>
          {axis.months.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              style={{
                position: "absolute",
                left: `${m.startPct}%`,
                width: `${Math.max(0, m.endPct - m.startPct)}%`,
                top: 0,
                bottom: 0,
                paddingTop: 6,
                paddingLeft: 6,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                borderLeft: i > 0 ? "1px solid var(--border-2)" : "none",
                boxSizing: "border-box",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Day row — ticks + tabular numbers */}
        <div style={{ position: "relative", height: 24 }}>
          {axis.days.map((d, i) => (
            <div
              key={`day-${i}`}
              style={{
                position: "absolute",
                left: `${d.pct}%`,
                transform: "translateX(-50%)",
                top: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 1,
                  height: 4,
                  background: "var(--border-2)",
                }}
              />
              <span
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  fontWeight: 400,
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {d.label.replace(/^[A-Za-z]+\s/, "")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
