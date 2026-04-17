"use client";
import type { GanttTaskStatus } from "./gantt-types";
import { statusChipFor } from "./gantt-utils";

interface Props {
  status: GanttTaskStatus;
}

export function GanttStatusChip({ status }: Props) {
  const chip = statusChipFor(status);
  if (!chip) return null;
  return (
    <span
      aria-label={`Status: ${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 14,
        padding: "0 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
        color: chip.fg,
        background: chip.bg,
        border: chip.border ? `1px solid ${chip.border}` : "none",
        lineHeight: 1,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {chip.label}
    </span>
  );
}
