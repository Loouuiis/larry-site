"use client";

import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { getStatusColour, PRIORITY_COLOURS, parseDate, formatDateShort } from "./timeline-utils";

interface TimelineMobileListProps {
  tasks: WorkspaceTimelineTask[];
  onSelectTask: (id: string) => void;
}

export function TimelineMobileList({ tasks, onSelectTask }: TimelineMobileListProps) {
  const sorted = [...tasks].sort((a, b) => {
    const da = a.endDate ?? a.dueDate;
    const db = b.endDate ?? b.dueDate;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(da).getTime() - new Date(db).getTime();
  });

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)] mb-2">
        Timeline (sorted by deadline)
      </p>
      {sorted.map((task) => {
        const sc = getStatusColour(task.status);
        const dueDate = parseDate(task.endDate) ?? parseDate(task.dueDate);
        const hasMilestones = (task.milestones?.length ?? 0) > 0;

        return (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors"
          >
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: sc.bg, color: sc.text }}
            >
              {sc.label}
            </span>

            <span className="flex-1 truncate text-[11px] font-medium text-[var(--text-1)]">
              {hasMilestones && <span className="mr-1">◆</span>}
              {task.title}
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

            {dueDate && (
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                {formatDateShort(dueDate)}
              </span>
            )}
          </button>
        );
      })}

      {sorted.length === 0 && (
        <p className="text-center text-[12px] text-[var(--text-disabled)] py-8">
          No tasks to display
        </p>
      )}
    </div>
  );
}
