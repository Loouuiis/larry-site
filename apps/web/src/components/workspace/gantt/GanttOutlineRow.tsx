"use client";
import { ChevronRight } from "lucide-react";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";
import { CategoryDot, type CategoryDotTier } from "./CategoryDot";

type NodeRow = Extract<FlatRow, { kind: "node" }>;

interface Props {
  row: NodeRow;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}

type Tier = CategoryDotTier;

const TYPOGRAPHY_BY_TIER: Record<Tier, React.CSSProperties> = {
  category: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-1)",
  },
  project: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-1)",
  },
  task: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-1)",
  },
  subtask: {
    fontSize: 11,
    fontWeight: 400,
    color: "var(--text-2)",
  },
};

function tierOf(kind: NodeRow["node"]["kind"]): Tier {
  return kind;
}

export function GanttOutlineRow({ row, expanded, selected, hovered, onToggle, onSelect, onHover }: Props) {
  const n = row.node;
  const tier = tierOf(n.kind);
  const indent = 14 + row.depth * 14;
  const label =
    n.kind === "category" ? n.name :
    n.kind === "project"  ? n.name :
    n.task.title;

  const isCategory = n.kind === "category";

  const background = isCategory
    ? "var(--surface-2, #f6f2fc)"
    : selected
      ? "rgba(108, 68, 246, 0.04)"
      : hovered
        ? "var(--surface-2, #f6f2fc)"
        : "transparent";

  return (
    <div
      role="row"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: indent,
        paddingRight: 14,
        borderBottom: "1px solid var(--border, #f0edfa)",
        borderLeft: selected ? "3px solid #6c44f6" : "3px solid transparent",
        background,
        cursor: onSelect ? "pointer" : "default",
        opacity: row.dimmed ? 0.35 : 1,
        userSelect: "none",
      }}
    >
      {row.hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          aria-label={expanded ? "Collapse" : "Expand"}
          style={{
            width: 16, height: 16, flexShrink: 0,
            background: "transparent", border: 0, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted, #bdb7d0)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms",
            cursor: "pointer",
          }}
        >
          <ChevronRight size={10} />
        </button>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}

      <CategoryDot color={row.categoryColor} tier={tier} />

      <span
        title={label}
        style={{
          ...TYPOGRAPHY_BY_TIER[tier],
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
    </div>
  );
}
