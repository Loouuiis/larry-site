"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel, GanttNode } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct, generateDateAxis } from "./gantt-utils";
import { GanttRow } from "./GanttRow";
import { GanttDateHeader, GANTT_HEADER_HEIGHT, PX_PER_DAY_BY_ZOOM } from "./GanttDateHeader";

interface Milestone {
  id: string;
  name: string;
  date: string;
  color?: string;
}

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string }>;
  onTaskBarClick?: (taskId: string, projectId: string) => void;
  milestones?: Milestone[];
  onAddMilestone?: (date: string) => void;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu,
    dependencies, onTaskBarClick, milestones = [], onAddMilestone },
  ref,
) {
  const axis = useMemo(() => generateDateAxis(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  const pxPerDay = PX_PER_DAY_BY_ZOOM[zoom];
  const axisMinWidth = Math.max(600, pxPerDay * range.totalDays);

  // Track actual rendered width of the content container for pixel-accurate arrows.
  const contentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(axisMinWidth);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build per-task { yMid, xStartPct, xEndPct } for arrow drawing.
  const rowYMap = useMemo(() => {
    const map = new Map<string, { yMid: number; xStartPct: number; xEndPct: number }>();
    let cumulativeY = 0;
    for (const r of rows) {
      if (r.kind === "node") {
        const n = r.node;
        if (n.kind === "task" || n.kind === "subtask") {
          const t = n.task;
          if (n.children.length === 0) {
            const todayIso = new Date().toISOString().slice(0, 10);
            const end = t.endDate ?? t.dueDate;
            const endNorm = end ? String(end).slice(0, 10) : null;
            const startNorm = t.startDate
              ? String(t.startDate).slice(0, 10)
              : (endNorm && endNorm > todayIso ? todayIso : endNorm);
            if (startNorm && endNorm) {
              map.set(t.id, {
                yMid: cumulativeY + r.height / 2,
                xStartPct: dateToPct(new Date(startNorm), range),
                xEndPct: dateToPct(new Date(endNorm), range),
              });
            }
          }
        }
      }
      cumulativeY += r.height;
    }
    return map;
  }, [rows, range]);

  const totalRowsHeight = useMemo(() => rows.reduce((acc, r) => acc + r.height, 0), [rows]);

  // Convert percent to actual px for SVG arrow coords.
  function pctToPx(pct: number) { return (pct / 100) * containerWidth; }

  function handleHeaderClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onAddMilestone) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const totalDays = range.totalDays;
    const clickedDate = new Date(range.start.getTime() + (pct / 100) * totalDays * 86400000);
    onAddMilestone(clickedDate.toISOString().slice(0, 10));
  }

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div ref={contentRef} style={{ minWidth: axisMinWidth, position: "relative" }}>
        {/* Date header — clickable to add milestones */}
        <div onClick={onAddMilestone ? handleHeaderClick : undefined}
          style={{ cursor: onAddMilestone ? "crosshair" : undefined }}>
          <GanttDateHeader range={range} zoom={zoom} milestones={milestones} />
        </div>

        {/* Gridlines */}
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

        {/* Today vertical line */}
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

        {/* Milestone vertical lines */}
        {milestones.map((m) => {
          const pct = dateToPct(new Date(m.date), range);
          if (pct < 0 || pct > 100) return null;
          return (
            <div
              key={m.id}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: GANTT_HEADER_HEIGHT,
                bottom: 0,
                width: 1.5,
                background: m.color ?? "#f67a79",
                pointerEvents: "none",
                zIndex: 1,
                opacity: 0.7,
                borderLeft: `1.5px dashed ${m.color ?? "#f67a79"}`,
              }}
            />
          );
        })}

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
                onTaskBarClick={onTaskBarClick}
              />
            </div>
          ))}
        </div>

        {/* Dependency arrows SVG overlay — pixel-accurate via ResizeObserver */}
        {dependencies && dependencies.length > 0 && totalRowsHeight > 0 && (
          <svg
            width={containerWidth}
            height={totalRowsHeight}
            style={{
              position: "absolute",
              top: GANTT_HEADER_HEIGHT,
              left: 0,
              pointerEvents: "none",
              zIndex: 2,
              overflow: "visible",
            }}
          >
            <defs>
              <marker
                id="gantt-dep-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,1 L7,4 L0,7 Z" fill="#6c44f6" opacity="0.65" />
              </marker>
            </defs>
            {dependencies.map(({ taskId, dependsOnTaskId }) => {
              const pred = rowYMap.get(dependsOnTaskId);
              const succ = rowYMap.get(taskId);
              if (!pred || !succ) return null;
              const xEnd   = pctToPx(pred.xEndPct);
              const xStart = pctToPx(succ.xStartPct);
              const yPred  = pred.yMid;
              const ySucc  = succ.yMid;
              const elbowX = xEnd + 10;
              const d = `M${xEnd},${yPred} H${elbowX} V${ySucc} H${xStart}`;
              return (
                <path
                  key={`dep-${dependsOnTaskId}-${taskId}`}
                  d={d}
                  stroke="#6c44f6"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.65"
                  strokeDasharray="5 3"
                  markerEnd="url(#gantt-dep-arrow)"
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
});
