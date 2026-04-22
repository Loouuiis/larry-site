"use client";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { generateDateAxis, dateToPct } from "./gantt-utils";

interface Milestone {
  id: string;
  name: string;
  date: string;
  color?: string;
}

interface Props {
  range: TimelineRange;
  zoom: ZoomLevel;
  milestones?: Milestone[];
}

// 16px space above for the "Today" label + 48px axis band = 64px total
export const GANTT_HEADER_HEIGHT = 64;
const AXIS_BAND_HEIGHT = 48;
const TODAY_LABEL_BAND = 16;

export const PX_PER_DAY_BY_ZOOM: Record<ZoomLevel, number> = {
  week:    48,
  month:   14,
  quarter:  8,
};

export function GanttDateHeader({ range, zoom, milestones = [] }: Props) {
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
      {/* Today pill + milestone diamonds (top 16px) */}
      <div style={{ position: "relative", height: TODAY_LABEL_BAND }}>
        {todayInRange && (
          <span
            style={{
              position: "absolute",
              left: `${todayPct}%`,
              transform: "translateX(-50%)",
              top: 0,
              padding: "1px 6px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#fff",
              background: "var(--brand)",
              borderRadius: 3,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 1px 3px rgba(108, 68, 246, 0.35)",
            }}
          >
            Today {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}

        {/* Milestone diamonds */}
        {milestones.map((m) => {
          const pct = dateToPct(new Date(m.date), range);
          if (pct < 0 || pct > 100) return null;
          const color = m.color ?? "#f67a79";
          return (
            <span
              key={m.id}
              title={`${m.name} — ${m.date}`}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: 0,
                transform: "translateX(-50%)",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              {/* Diamond */}
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
                <polygon points="5,0 10,5 5,10 0,5" fill={color} />
              </svg>
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color,
                letterSpacing: "0.02em",
                maxWidth: 60,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {m.name}
              </span>
            </span>
          );
        })}
      </div>

      {/* Axis band (48px) — month row + day row */}
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

        {/* Day row */}
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
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
