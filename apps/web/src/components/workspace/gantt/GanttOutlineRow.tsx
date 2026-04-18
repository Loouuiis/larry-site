"use client";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
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

// v4 Slice 4 — drag enablement covers every row kind except synthetic buckets:
//   • Categories: real-id org-level / project-scoped / subcategory rows.
//   • Projects: every real project row (including inside Uncategorised).
//   • Tasks / Subtasks: every real task/subtask row.
//   • Excluded: the synthetic __root__ node and the Uncategorised bucket row
//     (id === null / "uncat" on a category), because they don't map to any
//     server-side identity.
function isDraggableRow(n: NodeRow["node"]): boolean {
  if (n.kind === "category") return n.id !== null && n.id !== "uncat" && n.id !== "__root__";
  return true;  // project / task / subtask
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

  // Stable unique id for @dnd-kit — always provide one even when disabled,
  // otherwise dupe ids collide across rows.
  const dndId = useMemo(() => {
    if (n.kind === "category") return `dnd-cat:${n.id ?? "uncat"}`;
    if (n.kind === "project")  return `dnd-proj:${n.id}`;
    if (n.kind === "task")     return `dnd-task:${n.task.id}`;
    return `dnd-sub:${n.task.id}`;
  }, [n]);

  const dndEnabled = isDraggableRow(n);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({ id: dndId, disabled: !dndEnabled });
  const { isOver, setNodeRef: setDropRef } =
    useDroppable({ id: dndId, disabled: !dndEnabled });

  const setRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const background = isOver
    ? "var(--brand-tint, rgba(108,68,246,0.10))"
    : selected
      ? "var(--surface-2)"
      : hovered
        ? "var(--surface-2)"
        : "transparent";

  const dndDomProps = dndEnabled ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={dndEnabled ? setRef : undefined}
      role="row"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...dndDomProps}
      style={{
        height: row.height,
        display: "flex",
        alignItems: "center",
        gap: 8,
        paddingLeft: indent,
        paddingRight: 14,
        borderLeft: selected ? "2px solid var(--brand)" : "2px solid transparent",
        // Drop target outline when any draggable row is hovering over this one.
        outline: isOver && dndEnabled ? "2px dashed var(--brand)" : "none",
        outlineOffset: "-2px",
        background,
        cursor: dndEnabled ? (isDragging ? "grabbing" : "grab") : (onSelect ? "pointer" : "default"),
        opacity: isDragging ? 0.4 : (row.dimmed ? 0.35 : 1),
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
