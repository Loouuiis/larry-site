"use client";
import { useRef, useCallback, useEffect } from "react";
import type { FlatRow } from "./gantt-utils";
import { GanttOutlineRow } from "./GanttOutlineRow";

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
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

export function GanttOutline({ rows, expanded, selectedKey, hoveredKey, width, onWidthChange, onToggle, onSelect, onHover }: Props) {
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
    <div style={{ position: "sticky", left: 0, zIndex: 2, background: "#fff", width, flexShrink: 0, borderRight: "1px solid var(--border, #eaeaea)" }}>
      <div style={{ overflow: "hidden" }}>
        {rows.map((row) => (
          <GanttOutlineRow
            key={row.key}
            row={row}
            expanded={expanded.has(row.key)}
            selected={selectedKey === row.key}
            hovered={hoveredKey === row.key}
            onToggle={() => onToggle(row.key)}
            onSelect={() => onSelect(row.key)}
            onHover={(h) => onHover(h ? row.key : null)}
          />
        ))}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize" }}
      />
    </div>
  );
}
