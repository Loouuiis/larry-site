"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { EASE, STATUS_COLOURS, PRIORITY_COLOURS } from "./timeline-utils";

interface UnscheduledPanelProps {
  tasks: WorkspaceTimelineTask[];
  onScheduleTask: (taskId: string, startDate: string, endDate: string) => void;
}

export function UnscheduledPanel({ tasks, onScheduleTask }: UnscheduledPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="border-t border-dashed border-[var(--border-2)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ minHeight: 36 }}
      >
        {expanded ? (
          <ChevronDown size={12} className="text-[var(--text-disabled)]" />
        ) : (
          <ChevronRight size={12} className="text-[var(--text-disabled)]" />
        )}
        <span className="text-[11px] font-semibold text-[var(--text-2)]">
          Unscheduled
        </span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          {tasks.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1">
              {tasks.map((task) => {
                const sc = STATUS_COLOURS[task.status];
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 cursor-grab active:cursor-grabbing hover:border-[var(--border-2)] transition-colors"
                  >
                    <GripVertical size={12} className="text-[var(--text-disabled)] shrink-0" />

                    <span className="flex-1 truncate text-[11px] font-medium text-[var(--text-2)]">
                      {task.title}
                    </span>

                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {sc.label}
                    </span>

                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PRIORITY_COLOURS[task.priority] }}
                    />

                    {task.assigneeName && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[7px] font-bold text-[var(--text-muted)] shrink-0">
                        {task.assigneeName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
