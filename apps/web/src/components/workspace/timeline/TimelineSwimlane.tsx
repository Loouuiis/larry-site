"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { TimelineBar } from "./TimelineBar";
import {
  EASE,
  type TimelineRange, type ColourBy, type TaskGroup,
} from "./timeline-utils";

interface TimelineSwimlaneProps {
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

export function TimelineSwimlane({
  group, range, colourBy, isExpanded, selectedTaskId,
  highlightedTaskIds, dimmedTaskIds,
  onToggle, onSelectTask, onHoverTask,
}: TimelineSwimlaneProps) {
  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ minHeight: 36 }}
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-[var(--text-disabled)] shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-[var(--text-disabled)] shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-[var(--text-1)]">
          {group.label}
        </span>
        <span className="text-[10px] text-[var(--text-disabled)]">
          ({group.tasks.length} task{group.tasks.length === 1 ? "" : "s"})
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && group.tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
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
          </motion.div>
        ))}
      </AnimatePresence>

      {!isExpanded && (
        <div className="h-1 bg-[var(--surface-2)]" />
      )}
    </div>
  );
}
