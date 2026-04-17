"use client";
import { ChevronRight } from "lucide-react";
import type { FlatRow } from "./gantt-utils";
import { CategoryDot, type CategoryDotTier } from "./CategoryDot";

type NodeRow = Extract<FlatRow, { kind: "node" }>;

interface Props {
  row: NodeRow;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHover?: (hovered: boolean) => void;
}

type Tier = CategoryDotTier;

const TYPOGRAPHY_BY_TIER: Record<Tier, React.CSSProperties> = {
  category: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-1)",
  },
  project: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-1)",
  },
  task: {
    fontSize: 14,
    fontWeight: 400,
    color: "var(--text-1)",
  },
  subtask: {
    fontSize: 13,
    fontWeight: 400,
    color: "var(--text-2)",
  },
};

function tierOf(kind: NodeRow["node"]["kind"]): Tier { return kind; }

function labelFor(n: NodeRow["node"]): string {
  if (n.kind === "category") {
    if (n.id === null || n.id === "uncat") return n.name || "Uncategorised";
    return n.name;
  }
  if (n.kind === "project") return n.name;
  return n.task.title;
}

export function GanttOutlineRow({
  row, expanded, selected, hovered, onToggle, onSelect, onContextMenu, onHover,
}: Props) {
  const n = row.node;
  const tier = tierOf(n.kind);
  const indent = 14 + row.depth * 14;
  const label = labelFor(n);
  const isCategory = n.kind === "category";
  const isUncategorised = isCategory && (n.id === null || n.id === "uncat");

  const background = selected
    ? "var(--surface-2)"
    : hovered
      ? "var(--surface-2)"
      : "transparent";

  return (
    <div
      role="row"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        height: row.height,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: indent,
        paddingRight: 14,
        borderLeft: selected ? "2px solid var(--brand)" : "2px solid transparent",
        background,
        cursor: onSelect ? "pointer" : "default",
        opacity: row.dimmed ? 0.35 : 1,
        userSelect: "none",
        transition: "background-color 150ms ease-out",
      }}
    >
      {row.hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          aria-label={expanded ? "Collapse" : "Expand"}
          style={{
            width: 12, height: 12, flexShrink: 0,
            background: "transparent", border: 0, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease-out",
            cursor: "pointer",
          }}
        >
          <ChevronRight size={10} strokeWidth={1.5} />
        </button>
      ) : (
        <span style={{ width: 12, flexShrink: 0 }} />
      )}

      <CategoryDot
        color={isUncategorised ? "var(--text-muted)" : row.categoryColor}
        tier={tier}
      />

      <span
        title={label}
        style={{
          ...TYPOGRAPHY_BY_TIER[tier],
          fontStyle: isUncategorised ? "italic" : "normal",
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
