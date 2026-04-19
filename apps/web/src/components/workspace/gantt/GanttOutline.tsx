"use client";
import { useRef, useCallback, useEffect, type ReactNode } from "react";
import type { FlatRow } from "./gantt-utils";
import type { GanttNode } from "./gantt-types";
import { GanttOutlineRow } from "./GanttOutlineRow";
import { GANTT_HEADER_HEIGHT } from "./GanttDateHeader";

interface Props {
  rows: FlatRow[];
  expanded: Set<string>;
  selectedKey: string | null;
  hoveredKey: string | null;
  width: number;
  onWidthChange: (w: number) => void;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
  onContextMenu?: (rowKey: string, rowKind: GanttNode["kind"], e: React.MouseEvent) => void;
  header?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const INDENT_STEP = 14;
const INDENT_BASE = 14;

function computeIndentGuides(rows: FlatRow[]): { depth: number; top: number; height: number }[] {
  const out: { depth: number; top: number; height: number }[] = [];
  const segments: { depth: number; top: number; bottom: number }[] = [];
  let y = 0;
  for (const r of rows) {
    if (r.depth >= 1) {
      segments.push({ depth: r.depth, top: y, bottom: y + r.height });
    }
    y += r.height;
  }
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.depth === seg.depth && last.top + last.height === seg.top) {
      last.height = seg.bottom - last.top;
    } else {
      out.push({ depth: seg.depth, top: seg.top, height: seg.bottom - seg.top });
    }
  }
  return out;
}

export function GanttOutline({
  rows, expanded, selectedKey, hoveredKey, width, onWidthChange,
  onToggle, onSelect, onHover, onContextMenu, header, headerActions, footer, overlay,
}: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW.current + (e.clientX - startX.current)));
      onWidthChange(next);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onWidthChange]);

  const guides = computeIndentGuides(rows);

  return (
    <div style={{
      position: "sticky", left: 0, zIndex: 2, background: "var(--surface)",
      width, flexShrink: 0,
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
    }}>
      {header ?? (
        <div
          style={{
            position: "sticky",
            top: 0,
            height: GANTT_HEADER_HEIGHT,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "0 14px 10px 20px",
            background: "var(--surface)",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
            }}
          >
            Task / Groups
          </span>
          {headerActions}
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Indent guides — behind rows */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
          {guides.map((g, i) => (
            <div
              key={`guide-${i}`}
              style={{
                position: "absolute",
                left: INDENT_BASE + (g.depth - 1) * INDENT_STEP + 6,
                top: g.top,
                height: g.height,
                width: 2,
                background: "var(--border-2)",
                opacity: 0.45,
              }}
            />
          ))}
        </div>

        {/* Rows */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {rows.map((row) => (
            <div key={row.key} style={{ height: row.height }}>
              <GanttOutlineRow
                row={row}
                expanded={expanded.has(row.key)}
                selected={selectedKey === row.key}
                hovered={hoveredKey === row.key}
                onToggle={() => onToggle(row.key)}
                onSelect={() => onSelect(row.key)}
                onHover={(h) => onHover(h ? row.key : null)}
                onContextMenu={onContextMenu
                  ? (e) => { e.preventDefault(); onContextMenu(row.key, row.node.kind, e); }
                  : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      {footer}
      {overlay}
      {/* v4 Slice 5 — wider (12 px) hit area so the outline resize handle is
          actually discoverable. The visible affordance stays 1 px wide via
          the outline's right border; this invisible overlay catches clicks. */}
      <div
        onMouseDown={onMouseDown}
        aria-hidden="true"
        style={{ position: "absolute", right: -6, top: 0, bottom: 0, width: 12, cursor: "col-resize" }}
      />
    </div>
  );
}
