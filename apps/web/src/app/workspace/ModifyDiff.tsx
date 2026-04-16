"use client";

import type { DiffEntry } from "@/hooks/useModifyPanel";

const LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  dueDate: "Due date",
  assigneeName: "Assignee",
  priority: "Priority",
  newDeadline: "New deadline",
  newOwnerName: "New owner",
  newStatus: "New status",
  newRiskLevel: "Risk level",
  riskLevel: "Risk level",
  to: "To",
  subject: "Subject",
  body: "Body",
};

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function ModifyDiff({ entries }: { entries: DiffEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No changes yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((e) => (
        <li key={e.key} className="flex flex-wrap items-baseline gap-2">
          <span className="font-medium text-neutral-700">
            {LABELS[e.key] ?? e.key}:
          </span>
          <span className="text-neutral-500 line-through">{fmt(e.before)}</span>
          <span aria-hidden className="text-neutral-400">→</span>
          <span className="font-medium text-[#6c44f6]">{fmt(e.after)}</span>
        </li>
      ))}
    </ul>
  );
}
