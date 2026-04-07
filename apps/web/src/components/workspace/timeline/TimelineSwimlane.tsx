"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { TimelineBar } from "./TimelineBar";
import { LABEL_WIDTH } from "./TimelineGrid";
import {
  EASE, getStatusColour,
  type TimelineRange, type ColourBy, type TaskGroup,
  computeGroupSummary, dateToPct, daysBetween,
} from "./timeline-utils";

/* ── Summary bar: muted span across group's date range ─────────────── */

function SummaryBar({
  tasks,
  range,
}: {
  tasks: WorkspaceTimelineTask[];
  range: TimelineRange;
}) {
  const { start, end } = computeGroupSummary(tasks);
  if (!start || !end) return null;

  const leftPct = dateToPct(start, range);
  const widthPct = Math.max((daysBetween(start, end) / range.totalDays) * 100, 0.3);

  return (
    <div
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        top: "50%",
        transform: "translateY(-50%)",
        height: 10,
        borderRadius: 4,
        background: "#6c44f6",
        opacity: 0.18,
        pointerEvents: "none",
      }}
    />
  );
}

/* ── GanttGroup ─────────────────────────────────────────────────────── */

interface GanttGroupProps {
  group: TaskGroup;
  range: TimelineRange;
  colourBy: ColourBy;
  isExpanded: boolean;
  selectedTaskId: string | null;
  highlightedTaskIds: Set<string>;
  dimmedTaskIds: Set<string>;
  onToggle: () => void;
  onSelectTask: (id: string) => void;
  onHoverTask: (id: string | null) => void;
}

export function GanttGroup({
  group,
  range,
  colourBy,
  isExpanded,
  selectedTaskId,
  highlightedTaskIds,
  dimmedTaskIds,
  onToggle,
  onSelectTask,
  onHoverTask,
}: GanttGroupProps) {
  return (
    <div className="border-b border-[var(--border)]">

      {/* Group header row */}
      <div style={{ display: "flex", height: 40 }}>
        {/* Sticky label cell */}
        <button
          onClick={onToggle}
          className="sticky left-0 shrink-0 flex items-center gap-1.5 transition-colors hover:brightness-95"
          style={{
            width: LABEL_WIDTH,
            paddingLeft: 10,
            paddingRight: 10,
            background: "var(--surface-2)",
            borderRight: "1px solid var(--border)",
            zIndex: 2,
            cursor: "pointer",
          }}
        >
          {isExpanded ? (
            <ChevronDown size={11} className="text-[var(--text-disabled)] shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-[var(--text-disabled)] shrink-0" />
          )}
          <span
            className="text-[11px] font-semibold text-[var(--text-1)] truncate flex-1 text-left"
            title={group.label}
          >
            {group.label}
          </span>
          <span className="text-[10px] shrink-0" style={{ color: "var(--text-disabled)" }}>
            {group.tasks.length}
          </span>
        </button>

        {/* Chart cell: summary bar */}
        <div className="relative flex-1">
          <SummaryBar tasks={group.tasks} range={range} />
        </div>
      </div>

      {/* Task rows */}
      <AnimatePresence initial={false}>
        {isExpanded &&
          group.tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 40 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              style={{ display: "flex", overflow: "hidden", borderTop: "1px solid var(--border)" }}
            >
              {/* Sticky label cell */}
              <div
                className="sticky left-0 shrink-0 flex items-center gap-2"
                style={{
                  width: LABEL_WIDTH,
                  paddingLeft: 26,
                  paddingRight: 10,
                  background: "var(--surface)",
                  borderRight: "1px solid var(--border)",
                  zIndex: 2,
                  height: 40,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: getStatusColour(task.status).dot,
                  }}
                />
                <span
                  className="text-[12px] truncate"
                  style={{ color: "var(--text-2)" }}
                  title={task.title}
                >
                  {task.title}
                </span>
              </div>

              {/* Chart cell */}
              <div className="relative flex-1" style={{ height: 40 }}>
                <TimelineBar
                  task={task}
                  range={range}
                  colourBy={colourBy}
                  isGroup={false}
                  isSelected={selectedTaskId === task.id}
                  isHighlighted={highlightedTaskIds.has(task.id)}
                  isDimmed={dimmedTaskIds.has(task.id)}
                  onClick={() => onSelectTask(task.id)}
                  onMouseEnter={() => onHoverTask(task.id)}
                  onMouseLeave={() => onHoverTask(null)}
                />
              </div>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

/** @deprecated Use GanttGroup instead */
export { GanttGroup as TimelineSwimlane };
