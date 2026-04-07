"use client";

import { forwardRef, type ReactNode } from "react";
import {
  type TimelineRange, type ZoomLevel,
  generateGridMarkers, dateToPct, formatDateShort,
} from "./timeline-utils";

export const LABEL_WIDTH = 240;

interface TimelineGridProps {
  range: TimelineRange;
  zoom: ZoomLevel;
  /** Rendered inside the chart area overlay (e.g. dependency lines SVG) */
  chartOverlay?: ReactNode;
  children: ReactNode;
}

export const TimelineGrid = forwardRef<HTMLDivElement, TimelineGridProps>(
  function TimelineGrid({ range, zoom, chartOverlay, children }, ref) {
    const markers = generateGridMarkers(range, zoom);
    const today = new Date();
    const todayPct = dateToPct(today, range);
    const todayInRange = todayPct >= 0 && todayPct <= 100;

    const pxPerDay = zoom === "week" ? 120 : zoom === "month" ? 30 : 4;
    const chartMinWidth = range.totalDays * pxPerDay;
    const headerHeight = todayInRange ? 48 : 36;

    return (
      <div
        ref={ref}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
      >
        <div style={{ minWidth: `${LABEL_WIDTH + chartMinWidth}px` }}>

          {/* ── Time axis header (sticky top) ── */}
          <div
            className="sticky top-0 z-20 flex border-b border-[var(--border)] bg-white"
            style={{ height: headerHeight }}
          >
            {/* Blank label column header */}
            <div
              className="sticky left-0 shrink-0 border-r border-[var(--border)] bg-white"
              style={{ width: LABEL_WIDTH, zIndex: 3, height: headerHeight }}
            />
            {/* Chart area header */}
            <div className="relative flex-1" style={{ height: headerHeight }}>
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

          {/* ── Body ── */}
          <div className="relative">
            {/* Chart area overlay: gridlines + today line + dependency SVG */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: LABEL_WIDTH, right: 0, zIndex: 0 }}
            >
              {markers.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-[var(--border)]"
                  style={{ left: `${m.pct}%` }}
                />
              ))}
              {todayInRange && (
                <div
                  className="absolute top-0 bottom-0 w-px z-10"
                  style={{ left: `${todayPct}%`, background: "rgba(108, 68, 246, 0.4)" }}
                />
              )}
              {chartOverlay}
            </div>

            {/* Rows */}
            {children}
          </div>
        </div>
      </div>
    );
  },
);
