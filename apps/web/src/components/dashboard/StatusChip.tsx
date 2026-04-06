"use client";

import { TaskStatus } from "@/app/dashboard/types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  completed: "Completed",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  not_started: "bg-[#b0b0b0]/20 text-[#606060]",
  on_track: "bg-[#7ab0d8]/20 text-[#1a3f70]",
  at_risk: "bg-[#d4b84a]/20 text-[#705800]",
  overdue: "bg-[#e87878]/20 text-[#701818]",
  completed: "bg-[#6ab86a]/20 text-[#245820]",
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

