"use client";
import { ChevronRight } from "lucide-react";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";

interface Props {
  row: FlatRow;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}

function iconForKind(kind: FlatRow["node"]["kind"]) {
  return kind === "category" ? "C" : kind === "project" ? "P" : kind === "task" ? "·" : "◦";
}

export function GanttOutlineRow({ row, expanded, selected, hovered, onToggle, onSelect, onHover }: Props) {
  const indent = 12 + row.depth * 12;
  const n = row.node;
  const label =
    n.kind === "category" ? n.name :
    n.kind === "project"  ? n.name :
    n.kind === "task"     ? n.task.title :
                             n.task.title;

  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: indent,
        paddingRight: 8,
        borderBottom: "1px solid var(--border, #eaeaea)",
        borderLeft: selected ? "3px solid #6c44f6" : "3px solid transparent",
        background: hovered ? "var(--surface-2, #fafafa)" : "transparent",
        cursor: onSelect ? "pointer" : "default",
        fontSize: n.kind === "category" ? 12 : 13,
        fontWeight: n.kind === "category" ? 700 : n.kind === "project" ? 600 : 500,
        textTransform: n.kind === "category" ? "uppercase" : "none",
        letterSpacing: n.kind === "category" ? 0.4 : 0,
        color: n.kind === "subtask" ? "var(--text-2)" : "var(--text-1)",
        userSelect: "none",
      }}
    >
      {row.hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          style={{
            width: 18, height: 18, marginRight: 4,
            background: "transparent", border: 0, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms", cursor: "pointer",
          }}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight size={14} />
        </button>
      ) : (
        <span style={{ width: 22 }} />
      )}
      <span style={{ width: 14, fontSize: 10, color: "var(--text-muted)" }}>{iconForKind(n.kind)}</span>
      <span style={{ marginLeft: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
        {label}
      </span>
    </div>
  );
}
