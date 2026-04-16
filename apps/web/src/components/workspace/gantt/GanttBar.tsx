"use client";
import type { GanttTask } from "./gantt-types";
import { dateToPct, type TimelineRange } from "./gantt-utils";

type Variant = "category" | "project" | "task" | "subtask" | "rollup";

interface Props {
  variant: Variant;
  start: string;
  end: string;
  progressPercent: number;
  range: TimelineRange;
  label?: string;
  task?: GanttTask;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const VARIANT_CSS: Record<Variant, { height: number; bg: string; bar: string; bold?: boolean }> = {
  category: { height: 20, bg: "rgba(108, 68, 246, 0.06)", bar: "rgba(108, 68, 246, 0.18)", bold: true },
  project:  { height: 16, bg: "rgba(108, 68, 246, 0.18)", bar: "#6c44f6" },
  task:     { height: 16, bg: "var(--tl-not-started)", bar: "var(--tl-in-progress-dark, #6c44f6)" },
  subtask:  { height: 10, bg: "var(--tl-not-started)", bar: "var(--tl-in-progress-dark, #6c44f6)" },
  rollup:   { height: 6,  bg: "rgba(108, 68, 246, 0.15)", bar: "rgba(108, 68, 246, 0.40)" },
};

export function GanttBar({ variant, start, end, progressPercent, range, label, highlighted, dimmed, onClick, onMouseEnter, onMouseLeave }: Props) {
  const s = new Date(start);
  const e = new Date(end);
  const left = dateToPct(s, range);
  const right = dateToPct(e, range);
  const width = Math.max(right - left, 0.5);
  const cfg = VARIANT_CSS[variant];
  const ring = highlighted ? "0 0 0 2px #6c44f6" : undefined;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        left: `${left}%`, width: `${width}%`,
        top: `calc(50% - ${cfg.height / 2}px)`,
        height: cfg.height,
        background: cfg.bg,
        borderRadius: cfg.height >= 14 ? 6 : 4,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        boxShadow: ring,
        opacity: dimmed ? 0.3 : 1,
        transition: "box-shadow 120ms",
      }}
      title={label}
    >
      <div style={{
        width: `${Math.min(100, Math.max(0, progressPercent))}%`,
        height: "100%",
        background: cfg.bar,
      }} />
      {label && variant !== "subtask" && (
        <span style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          fontSize: 11, fontWeight: cfg.bold ? 700 : 500,
          color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: "calc(100% - 16px)", mixBlendMode: "normal",
        }}>{label}</span>
      )}
    </div>
  );
}
