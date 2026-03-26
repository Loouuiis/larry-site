"use client";

import { TaskStatus } from "@/app/dashboard/types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Done",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  backlog: "bg-[var(--pm-gray-light)] text-[var(--pm-text-secondary)]",
  not_started: "bg-[#676879] text-white",
  in_progress: "bg-[#FDAB3D] text-[#241a00]",
  waiting: "bg-[#0073EA] text-white",
  blocked: "bg-[#E2445C] text-white",
  completed: "bg-[#00C875] text-white",
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex min-w-[118px] items-center justify-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.01em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

