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
  not_started: "bg-[#ebebeb] text-[#606060]",
  on_track: "bg-[#a8c0e0] text-[#1a3f70]",
  at_risk: "bg-[#ece4a0] text-[#705800]",
  overdue: "bg-[#ecaaaa] text-[#701818]",
  completed: "bg-[#b8d9b4] text-[#245820]",
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

