"use client";

import { forwardRef, type ReactNode } from "react";
import {
  type TimelineRange, type ZoomLevel,
  generateGridMarkers, dateToPct, formatDateShort,
} from "./timeline-utils";

interface TimelineGridProps {
  range: TimelineRange;
  zoom: ZoomLevel;
  children: ReactNode;
}

export const TimelineGrid = forwardRef<HTMLDivElement, TimelineGridProps>(
  function TimelineGrid({ range, zoom, children }, ref) {
    const markers = generateGridMarkers(range, zoom);
    const today = new Date();
    const todayPct = dateToPct(today, range);
    const todayInRange = todayPct >= 0 && todayPct <= 100;

    // Min-width based on zoom: week=120px/day, month=30px/day, quarter=4px/day
    const pxPerDay = zoom === "week" ? 120 : zoom === "month" ? 30 : 4;
    const minWidth = range.totalDays * pxPerDay;

    return (
      <div
        ref={ref}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
      >
        <div style={{ minWidth: `${minWidth}px` }}>
          {/* ── Time axis header (sticky top) ── */}
          <div
            className="sticky top-0 z-20 border-b border-[var(--border)] bg-white"
            style={{ minHeight: todayInRange ? 48 : 36 }}
          >
            <div className="relative" style={{ height: todayInRange ? 48 : 36 }}>
              {/* Today pill — own row at top */}
              {todayInRange && (
                <span
                  className="absolute top-1 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap z-10"
                  style={{
                    left: `${todayPct}%`,
                    background: "rgba(108, 68, 246, 0.1)",
                    color: "var(--brand)",
                  }}
                >
                  Today, {formatDateShort(today)}
                </span>
              )}

              {/* Date range markers — below the today pill */}
              {markers.map((m, i) => (
                <span
                  key={i}
                  className="absolute text-[10px] font-medium text-[var(--text-disabled)] -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${m.pct}%`, top: todayInRange ? 24 : 10 }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Body with gridlines ── */}
          <div className="relative">
            {/* Gridlines */}
            {markers.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-[var(--border)]"
                style={{ left: `${m.pct}%` }}
              />
            ))}

            {/* Today line */}
            {todayInRange && (
              <div
                className="absolute top-0 bottom-0 w-px z-10"
                style={{
                  left: `${todayPct}%`,
                  background: "rgba(108, 68, 246, 0.4)",
                }}
              />
            )}

            {/* Swimlane rows rendered as children */}
            {children}
          </div>
        </div>
      </div>
    );
  },
);
