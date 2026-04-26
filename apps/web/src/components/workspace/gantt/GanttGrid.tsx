"use client";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel, GanttNode, GanttTask } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import type { RowSlice } from "./gantt-virtualize";
import { dateToPct, generateDateAxis, rollUpBar } from "./gantt-utils";
import { GanttRow } from "./GanttRow";
import { GanttDateHeader, GANTT_HEADER_HEIGHT, PX_PER_DAY_BY_ZOOM } from "./GanttDateHeader";

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; type?: "FS" | "FF" | "SS" | "SF" }>;
  onTaskBarClick?: (taskId: string, projectId: string) => void;
  // Timeline — see GanttOutline. Same slice flows into both columns so the
  // left outline and the right grid always render the same rows.
  slice?: RowSlice;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey, onContextMenu,
    dependencies, onTaskBarClick, slice },
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

  // ── Arrow routing helpers ──────────────────────────────────────────────────
  //
  // FS / FF — depart RIGHT from source, arrive going right at target.
  // When target is too close to the elbow we wrap around via a back-track.
  function elbowRight(xFrom: number, yFrom: number, xTo: number, yTo: number): string {
    const STEP = 14, R = 4;
    const dy = yTo - yFrom;
    if (Math.abs(dy) < 1) return `M${xFrom},${yFrom} H${xTo}`;
    const dir = dy > 0 ? 1 : -1;
    const ex = xFrom + STEP;
    if (xTo >= ex + R * 2) {
      return [
        `M${xFrom},${yFrom}`,
        `H${ex - R}`, `Q${ex},${yFrom} ${ex},${yFrom + dir * R}`,
        `V${yTo - dir * R}`, `Q${ex},${yTo} ${ex + R},${yTo}`,
        `H${xTo}`,
      ].join(" ");
    }
    const wrapX = Math.min(xTo - STEP, xFrom - STEP);
    const midY = yFrom + dy / 2;
    return [
      `M${xFrom},${yFrom}`,
      `H${ex - R}`, `Q${ex},${yFrom} ${ex},${yFrom + dir * R}`,
      `V${midY - dir * R}`, `Q${ex},${midY} ${ex - R},${midY}`,
      `H${wrapX + R}`, `Q${wrapX},${midY} ${wrapX},${midY + dir * R}`,
      `V${yTo - dir * R}`, `Q${wrapX},${yTo} ${wrapX + R},${yTo}`,
      `H${xTo}`,
    ].join(" ");
  }

  // SS / SF — depart LEFT from source (elbowX to the left of both anchors),
  // arrive going right at target.
  function elbowLeft(xFrom: number, yFrom: number, xTo: number, yTo: number): string {
    const STEP = 14, R = 4;
    const dy = yTo - yFrom;
    if (Math.abs(dy) < 1) return `M${xFrom},${yFrom} H${xTo}`;
    const dir = dy > 0 ? 1 : -1;
    const ex = Math.min(xFrom, xTo) - STEP;
    return [
      `M${xFrom},${yFrom}`,
      `H${ex + R}`, `Q${ex},${yFrom} ${ex},${yFrom + dir * R}`,
      `V${yTo - dir * R}`, `Q${ex},${yTo} ${ex + R},${yTo}`,
      `H${xTo}`,
    ].join(" ");
  }

  // Returns the SVG path and whether to use the left-facing arrowhead (SF only).
  function buildArrowPath(
    pred: { xStart: number; xEnd: number; yMid: number },
    succ: { xStart: number; xEnd: number; yMid: number },
    type: "FS" | "FF" | "SS" | "SF",
  ): { d: string; leftArrow: boolean } {
    switch (type) {
      case "FS": return { d: elbowRight(pred.xEnd,   pred.yMid, succ.xStart, succ.yMid), leftArrow: false };
      case "FF": return { d: elbowRight(pred.xEnd,   pred.yMid, succ.xEnd,   succ.yMid), leftArrow: false };
      case "SS": return { d: elbowLeft (pred.xStart, pred.yMid, succ.xStart, succ.yMid), leftArrow: false };
      case "SF": return { d: elbowLeft (pred.xStart, pred.yMid, succ.xEnd,   succ.yMid), leftArrow: true  };
    }
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
        {/* Date header */}
        <div>
          <GanttDateHeader range={range} zoom={zoom} />
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
              {/* Right-pointing arrowhead — used for FS, FF, SS */}
              <marker id="gantt-dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#6c44f6" />
              </marker>
              {/* Left-pointing arrowhead — used for SF (Start→Finish, opposite direction) */}
              <marker id="gantt-dep-arrow-left" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
                <path d="M7,0.5 L1,3.5 L7,6.5 Z" fill="#6c44f6" />
              </marker>
            </defs>
            {dependencies.map(({ taskId, dependsOnTaskId, type = "FS" }) => {
              const predCoords = rowYMap.get(dependsOnTaskId);
              const succCoords = rowYMap.get(taskId);
              if (!predCoords || !succCoords) return null;
              const pred = {
                xStart: pctToPx(predCoords.xStartPct),
                xEnd:   pctToPx(predCoords.xEndPct),
                yMid:   predCoords.yMid,
              };
              const succ = {
                xStart: pctToPx(succCoords.xStartPct),
                xEnd:   pctToPx(succCoords.xEndPct),
                yMid:   succCoords.yMid,
              };
              const { d, leftArrow } = buildArrowPath(pred, succ, type);
              return (
                <path
                  key={`dep-${dependsOnTaskId}-${taskId}`}
                  d={d}
                  stroke="#6c44f6"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.7"
                  markerEnd={leftArrow ? "url(#gantt-dep-arrow-left)" : "url(#gantt-dep-arrow)"}
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
});
