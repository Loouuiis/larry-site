"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel, GanttNode, GanttTask } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import type { RowSlice } from "./gantt-virtualize";
import { dateToPct, generateDateAxis, rollUpBar } from "./gantt-utils";
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
  // Timeline — see GanttOutline. Same slice flows into both columns so the
  // left outline and the right grid always render the same rows.
  slice?: RowSlice;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu,
    dependencies, onTaskBarClick, milestones = [], onAddMilestone, slice },
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

  // Build per-task { yMid, xStartPct, xEndPct } for arrow drawing. yMid is
  // measured against the FULL list (not the slice), so dependency arrows
  // remain visually anchored to their tasks even when the slice scrolls.
  // Parent tasks use their rollup bar bounds (min-start / max-end of all descendants).
  const rowYMap = useMemo(() => {
    const map = new Map<string, { yMid: number; xStartPct: number; xEndPct: number }>();
    const todayIso = new Date().toISOString().slice(0, 10);
    let cumulativeY = 0;
    for (const r of rows) {
      if (r.kind === "node") {
        const n = r.node;
        if (n.kind === "task" || n.kind === "subtask") {
          const t = n.task;
          let startNorm: string | null = null;
          let endNorm: string | null = null;
          if (n.children.length === 0) {
            const end = t.endDate ?? t.dueDate;
            endNorm = end ? String(end).slice(0, 10) : null;
            startNorm = t.startDate
              ? String(t.startDate).slice(0, 10)
              : (endNorm && endNorm > todayIso ? todayIso : endNorm);
          } else {
            // Parent task — use rollup bounds across all descendants.
            const descendants: GanttTask[] = [];
            const walk = (node: GanttNode) => {
              if (node.kind === "task" || node.kind === "subtask") descendants.push(node.task);
              for (const c of node.children) walk(c);
            };
            for (const c of n.children) walk(c);
            const rolled = rollUpBar(descendants);
            if (rolled) { startNorm = rolled.start; endNorm = rolled.end; }
          }
          if (startNorm && endNorm) {
            map.set(t.id, {
              yMid: cumulativeY + r.height / 2,
              xStartPct: dateToPct(new Date(startNorm), range),
              xEndPct: dateToPct(new Date(endNorm), range),
            });
          }
        }
      }
      cumulativeY += r.height;
    }
    return map;
  }, [rows, range]);

  const totalRowsHeight = useMemo(() => rows.reduce((acc, r) => acc + r.height, 0), [rows]);

  function pctToPx(pct: number) { return (pct / 100) * containerWidth; }

  // Build an SVG path for a Finish-to-Start dependency arrow.
  // Draws a rounded elbow from the right edge of the predecessor bar to the
  // left edge of the successor bar.  When the successor starts before the
  // elbow point we route around with a wrap-around C-shape.
  function buildArrowPath(xEnd: number, yPred: number, xStart: number, ySucc: number): string {
    const STEP = 14;
    const R = 4;
    const dy = ySucc - yPred;
    if (Math.abs(dy) < 1) return `M${xEnd},${yPred} H${xStart}`;
    const dir = dy > 0 ? 1 : -1;
    const elbowX = xEnd + STEP;
    if (xStart >= elbowX + R * 2) {
      // Simple elbow: right → turn → vertical → turn → right
      return [
        `M${xEnd},${yPred}`,
        `H${elbowX - R}`,
        `Q${elbowX},${yPred} ${elbowX},${yPred + dir * R}`,
        `V${ySucc - dir * R}`,
        `Q${elbowX},${ySucc} ${elbowX + R},${ySucc}`,
        `H${xStart}`,
      ].join(" ");
    }
    // Wrap-around: successor starts before elbow — route around via midpoint
    const wrapX = Math.min(xStart - STEP, xEnd - STEP);
    const midY = yPred + dy / 2;
    return [
      `M${xEnd},${yPred}`,
      `H${elbowX - R}`,
      `Q${elbowX},${yPred} ${elbowX},${yPred + dir * R}`,
      `V${midY - dir * R}`,
      `Q${elbowX},${midY} ${elbowX - R},${midY}`,
      `H${wrapX + R}`,
      `Q${wrapX},${midY} ${wrapX},${midY + dir * R}`,
      `V${ySucc - dir * R}`,
      `Q${wrapX},${ySucc} ${wrapX + R},${ySucc}`,
      `H${xStart}`,
    ].join(" ");
  }

  function handleHeaderClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onAddMilestone) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const totalDays = range.totalDays;
    const clickedDate = new Date(range.start.getTime() + (pct / 100) * totalDays * 86400000);
    onAddMilestone(clickedDate.toISOString().slice(0, 10));
  }

  // Default slice renders every row (matches pre-virtualization behaviour).
  const effectiveSlice: RowSlice = slice ?? {
    startIdx: 0,
    endIdx: rows.length,
    offsetTop: 0,
    totalHeight: totalRowsHeight,
    disabled: true,
  };
  const visibleRows = rows.slice(effectiveSlice.startIdx, effectiveSlice.endIdx);
  const visibleHeight = visibleRows.reduce((a, r) => a + r.height, 0);
  const bottomPad = Math.max(
    0,
    effectiveSlice.totalHeight - effectiveSlice.offsetTop - visibleHeight,
  );

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

        {/* Rows — when virtualized, paddingTop/Bottom spacers preserve the
            full scroll extent while only the window renders. */}
        <div
          role="rowgroup"
          aria-rowcount={rows.length}
          style={{
            position: "relative", zIndex: 1,
            paddingTop: effectiveSlice.offsetTop,
            paddingBottom: bottomPad,
          }}
        >
          {visibleRows.map((r, i) => (
            <div
              key={r.key}
              role="row"
              aria-rowindex={effectiveSlice.startIdx + i + 1}
              style={{ height: r.height }}
            >
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

        {/* Dependency arrows SVG overlay — pixel-accurate via ResizeObserver.
            Drawn against full-list yMid values, so they line up regardless
            of which window the slice is currently rendering. */}
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
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#6c44f6" />
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
              return (
                <path
                  key={`dep-${dependsOnTaskId}-${taskId}`}
                  d={buildArrowPath(xEnd, yPred, xStart, ySucc)}
                  stroke="#6c44f6"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.7"
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
