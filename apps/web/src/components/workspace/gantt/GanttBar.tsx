"use client";
import type { CSSProperties } from "react";
import type { GanttTask, GanttTaskStatus } from "./gantt-types";
import { contrastTextFor, dateToPct, type TimelineRange } from "./gantt-utils";

export type GanttBarVariant = "category" | "project" | "task" | "subtask";

interface Props {
  variant: GanttBarVariant;
  start: string;
  end: string;
  progressPercent: number;
  range: TimelineRange;
  categoryColor: string;
  status?: GanttTaskStatus; // only meaningful for task/subtask
  label?: string;
  task?: GanttTask;
  highlighted?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const HEIGHT_BY_VARIANT: Record<GanttBarVariant, number> = {
  category: 6,
  project: 10,
  task: 16,
  subtask: 10,
};

const ROLLUP_OPACITY = 0.45;

export function GanttBar({
  variant, start, end, progressPercent, range, categoryColor, status, label, highlighted, selected, dimmed,
  onClick, onMouseEnter, onMouseLeave,
}: Props) {
  const s = new Date(start);
  const e = new Date(end);
  const left = dateToPct(s, range);
  const right = dateToPct(e, range);
  const width = Math.max(right - left, 0.5);

  const height = HEIGHT_BY_VARIANT[variant];
  const isRollup = variant === "category" || variant === "project";

  const effectiveStatus: GanttTaskStatus | undefined = isRollup ? undefined : (status ?? "on_track");

  // Base fill — transparent for not_started, categoryColor otherwise.
  let background: string = categoryColor;
  if (effectiveStatus === "not_started") background = "transparent";

  // Status-driven border.
  let border: CSSProperties["border"] = "none";
  if (effectiveStatus === "not_started") border = `1.5px dashed ${categoryColor}`;
  else if (effectiveStatus === "overdue") border = "2px solid var(--tl-overdue, #e87878)";

  // Opacity.
  let opacity = 1;
  if (isRollup) opacity = ROLLUP_OPACITY;
  else if (effectiveStatus === "completed") opacity = 0.5;
  if (dimmed) opacity *= 0.35;

  const ring = highlighted || selected ? "0 0 0 2px #6c44f6" : undefined;
  const textColor = contrastTextFor(categoryColor);

  const showLabel = !isRollup && variant !== "subtask" && label;
  const labelSuffix = effectiveStatus === "completed" ? " ✓" : "";
  const progressClamped = Math.min(100, Math.max(0, progressPercent));

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={label}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: `calc(50% - ${height / 2}px)`,
        height,
        cursor: onClick ? "pointer" : "default",
        boxShadow: ring,
        opacity,
        transition: "box-shadow 120ms",
      }}
    >
      {/* Base fill + border (status modifier) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background,
          border,
          borderRadius: height >= 14 ? 4 : 3,
          boxSizing: "border-box",
        }}
      />
      {/* Progress fill for task bars with solid background */}
      {variant === "task" && effectiveStatus !== "not_started" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressClamped}%`,
            background: "rgba(255, 255, 255, 0.18)",
            mixBlendMode: "screen",
            borderTopLeftRadius: height >= 14 ? 4 : 3,
            borderBottomLeftRadius: height >= 14 ? 4 : 3,
            pointerEvents: "none",
          }}
        />
      )}
      {/* at_risk top stripe */}
      {effectiveStatus === "at_risk" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "var(--tl-at-risk, #d4b84a)",
            borderTopLeftRadius: height >= 14 ? 4 : 3,
            borderTopRightRadius: height >= 14 ? 4 : 3,
            pointerEvents: "none",
          }}
        />
      )}
      {/* Overdue right-end dot */}
      {effectiveStatus === "overdue" && (
        <div
          style={{
            position: "absolute",
            right: -3,
            top: `calc(50% - 3px)`,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--tl-overdue, #e87878)",
            pointerEvents: "none",
          }}
        />
      )}
      {/* Label */}
      {showLabel && (
        <span
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            fontWeight: 500,
            color: effectiveStatus === "not_started" ? "var(--text-2, #4b556b)" : textColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "calc(100% - 16px)",
            pointerEvents: "none",
          }}
        >
          {label}{labelSuffix}
        </span>
      )}
    </div>
  );
}
