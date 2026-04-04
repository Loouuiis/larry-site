"use client";

import { motion } from "framer-motion";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import {
  EASE, STATUS_COLOURS,
  parseDate, formatDateRange,
} from "./timeline-utils";

interface TimelineTooltipProps {
  task: WorkspaceTimelineTask;
  anchorRect: DOMRect | null;
  containerRect: DOMRect | null;
}

export function TimelineTooltip({ task, anchorRect, containerRect }: TimelineTooltipProps) {
  if (!anchorRect || !containerRect) return null;

  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate) ?? parseDate(task.dueDate);
  const sc = STATUS_COLOURS[task.status];

  const left = anchorRect.left - containerRect.left + anchorRect.width / 2;
  const top = anchorRect.top - containerRect.top - 8;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="absolute z-50 -translate-x-1/2 -translate-y-full pointer-events-none"
      style={{ left, top }}
    >
      <div
        className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-2)]"
        style={{ minWidth: 200, maxWidth: 300 }}
      >
        <p className="text-[12px] font-semibold text-[var(--text-1)] mb-1.5 leading-snug">
          {task.title}
        </p>

        {task.assigneeName && (
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[7px] font-bold text-[var(--text-muted)]">
              {(task.assigneeName ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="text-[11px] text-[var(--text-2)]">{task.assigneeName}</span>
          </div>
        )}

        {start && end && (
          <p className="text-[10px] text-[var(--text-muted)] mb-1">
            {formatDateRange(start, end)}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-medium text-[var(--text-2)]">
            {task.progressPercent ?? 0}% complete
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{
              background: sc.bg,
              color: sc.text,
            }}
          >
            {sc.label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
