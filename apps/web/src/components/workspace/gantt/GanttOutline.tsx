"use client";
import { useRef, useCallback, useEffect, type ReactNode } from "react";
import type { FlatRow, InlineAddMode } from "./gantt-utils";
import { GanttOutlineRow } from "./GanttOutlineRow";
import { GanttInlineAdd } from "./GanttInlineAdd";
import { ROW_HEIGHT } from "./gantt-types";
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
  onInlineAdd?: (ctx: { mode: InlineAddMode; parentKey: string | null }) => void;
  header?: ReactNode;        // optional: full replacement for the default header
  headerActions?: ReactNode; // optional: right-aligned actions inside default header (e.g. gear icon)
  footer?: ReactNode;
  overlay?: ReactNode;       // optional: absolutely-positioned child (e.g. CategoryManagerPanel)
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

export function GanttOutline({
  rows, expanded, selectedKey, hoveredKey, width, onWidthChange,
  onToggle, onSelect, onHover, onInlineAdd, header, headerActions, footer, overlay,
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

  return (
    <div style={{
      position: "sticky", left: 0, zIndex: 2, background: "#fff",
      width, flexShrink: 0,
      borderRight: "1px solid var(--border, #f0edfa)",
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
            borderBottom: "1px solid var(--border, #f0edfa)",
            background: "var(--surface, #fff)",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2, #4b556b)",
            }}
          >
            Task / Groups
          </span>
          {headerActions}
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {rows.map((row) => {
          if (row.kind === "add") {
            return (
              <GanttInlineAdd
                key={row.key}
                mode={row.mode}
                parentKey={row.parentKey}
                depth={row.depth}
                categoryColor={row.categoryColor}
                height={row.height}
                onClick={() => onInlineAdd?.({ mode: row.mode, parentKey: row.parentKey })}
              />
            );
          }
          return (
            <div key={row.key} style={{ height: row.height ?? ROW_HEIGHT }}>
              <GanttOutlineRow
                row={row}
                expanded={expanded.has(row.key)}
                selected={selectedKey === row.key}
                hovered={hoveredKey === row.key}
                onToggle={() => onToggle(row.key)}
                onSelect={() => onSelect(row.key)}
                onHover={(h) => onHover(h ? row.key : null)}
              />
            </div>
          );
        })}
      </div>
      {footer}
      {overlay}
      <div
        onMouseDown={onMouseDown}
        style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize" }}
      />
    </div>
  );
}
