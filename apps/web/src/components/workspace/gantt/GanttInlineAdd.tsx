"use client";
import { useState } from "react";
import type { InlineAddMode } from "./gantt-utils";
import { CategoryDot } from "./CategoryDot";

interface Props {
  mode: InlineAddMode;
  parentKey: string | null;
  depth: number;
  categoryColor: string;
  height: number;
  onClick?: () => void;
}

const LABEL_BY_MODE: Record<InlineAddMode, string> = {
  category: "Add category",
  project: "Add project",
  task: "Add task",
  subtask: "Add subtask",
};

export function GanttInlineAdd({ mode, depth, categoryColor, height, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const indent = 14 + depth * 14;

  return (
    <div
      role="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        height,
        paddingLeft: indent,
        paddingRight: 14,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        fontStyle: "italic",
        color: "var(--text-muted, #bdb7d0)",
        borderBottom: "1px solid var(--border, #f0edfa)",
        cursor: onClick ? "pointer" : "default",
        opacity: hovered ? 1 : 0.55,
        transition: "opacity 120ms",
        userSelect: "none",
        background: hovered ? "var(--surface-2, #f6f2fc)" : "transparent",
      }}
    >
      <span style={{ width: 16, flexShrink: 0 }} />
      <CategoryDot color={categoryColor} tier="task" />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        + {LABEL_BY_MODE[mode]}
      </span>
    </div>
  );
}
