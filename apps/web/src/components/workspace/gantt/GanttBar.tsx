"use client";
import type { GanttTask, GanttTaskStatus } from "./gantt-types";
import { dateToPct, darken, type TimelineRange } from "./gantt-utils";
import { GanttStatusChip } from "./GanttStatusChip";

export type GanttBarVariant = "category" | "project" | "task" | "subtask";

interface Props {
  variant: GanttBarVariant;
  start: string;
  end: string;
  progressPercent: number;
  range: TimelineRange;
  categoryColor: string;
  status?: GanttTaskStatus;
  label?: string;
  task?: GanttTask;
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const HEIGHT_BY_VARIANT: Record<GanttBarVariant, number> = {
  category: 18,
  project:  16,
  task:     14,
  subtask:  10,
};

const RADIUS_BY_VARIANT: Record<GanttBarVariant, number> = {
  category: 3,
  project:  3,
  task:     3,
  subtask:  2,
};

function rgbaFromHex(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(108, 68, 246, ${alpha})`;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GanttBar({
  variant, start, end, progressPercent, range, categoryColor, status,
  highlighted, selected, dimmed, label,
  onClick, onContextMenu, onMouseEnter, onMouseLeave,
}: Props) {
  const s = new Date(start);
  const e = new Date(end);
  const left = dateToPct(s, range);
  const right = dateToPct(e, range);
  const width = Math.max(right - left, 0.5);

  const height = HEIGHT_BY_VARIANT[variant];
  const radius = RADIUS_BY_VARIANT[variant];
  const isLeaf = variant === "task" || variant === "subtask";
  const progressClamped = Math.min(100, Math.max(0, progressPercent));

  const rgbRing = (highlighted || selected)
    ? `0 0 0 2px ${rgbaFromHex(categoryColor, 0.25)}`
    : undefined;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={label}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: `calc(50% - ${height / 2}px)`,
        height,
        display: "flex",
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
        opacity: dimmed ? 0.35 : 1,
        pointerEvents: "auto",
      }}
    >
      {/* Solid category-colour bar */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          background: categoryColor,
          borderRadius: radius,
          boxShadow: rgbRing ?? "0 1px 2px rgba(0,0,0,0.04)",
          transition: "box-shadow 150ms ease-out",
          overflow: "hidden",
        }}
      >
        {/* Progress overlay — darker inner fill up to progress% */}
        {progressClamped > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progressClamped}%`,
              background: darken(categoryColor, 12),
            }}
          />
        )}
      </div>

      {/* Trailing status chip — leaf rows only */}
      {isLeaf && status && (
        <span style={{ marginLeft: 4, flexShrink: 0 }}>
          <GanttStatusChip status={status} />
        </span>
      )}
    </div>
  );
}
