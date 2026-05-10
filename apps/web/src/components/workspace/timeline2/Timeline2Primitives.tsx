"use client";

import { GitBranch, Plus } from "lucide-react";
import type { Timeline2Node, Timeline2Priority, Timeline2Status } from "@larry/shared";
import { initials, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS } from "./timeline2-ui";

export function StatusBadge({ status }: { status: Timeline2Status }) {
  const tone = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Timeline2Priority }) {
  const color = PRIORITY_COLORS[priority];
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function HealthBadge({ status }: { status: Timeline2Status }) {
  const tone = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold"
      style={{ background: tone.soft, color: tone.fg, border: `1px solid ${tone.bar}33` }}
      title={`Health: ${STATUS_LABELS[status]}`}
    >
      Health: {STATUS_LABELS[status]}
    </span>
  );
}

export function PersonAvatar({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
      style={{ background: "linear-gradient(135deg, #214968, #5d8bab)" }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function AssigneeChips({ node, compact = false, maxVisible = 4 }: { node: Timeline2Node; compact?: boolean; maxVisible?: number }) {
  const assignees = node.assignees.length > 0 ? node.assignees : node.rollup.assignees;
  if (assignees.length === 0) {
    return <span className="text-[12px] text-[var(--text-disabled)]">Unassigned</span>;
  }

  if (compact) {
    return (
      <div className="flex min-w-0 -space-x-2">
        {assignees.slice(0, maxVisible).map((assignee) => (
          <span key={assignee.userId} className="rounded-full ring-2 ring-white">
            <PersonAvatar name={assignee.name} />
          </span>
        ))}
        {assignees.length > maxVisible && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-[var(--text-muted)] ring-2 ring-white">
            +{assignees.length - maxVisible}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {assignees.slice(0, maxVisible).map((assignee) => (
        <span
          key={assignee.userId}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-white pl-1 pr-2 text-[11px] font-semibold"
          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          <PersonAvatar name={assignee.name} />
          {assignee.name}
        </span>
      ))}
      {assignees.length > maxVisible && (
        <span className="inline-flex h-7 items-center rounded-full px-2 text-[11px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          +{assignees.length - maxVisible}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="relative overflow-hidden border border-dashed px-6 py-16 text-center"
      style={{
        borderColor: "#d5e1ea",
        background: "linear-gradient(135deg, #ffffff 0%, #f9fbfd 55%, #edf3f9 100%)",
        borderRadius: 24,
      }}
    >
      <div className="absolute left-8 top-8 h-28 w-28 rounded-full bg-[#7aa5c5]/10 blur-2xl" />
      <div className="absolute bottom-4 right-12 h-36 w-36 rounded-full bg-[#9cc5a8]/10 blur-3xl" />
      <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg">
        <GitBranch size={24} style={{ color: "var(--cta)" }} />
      </div>
      <p className="relative mt-4 text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
        Timeline 2 is ready for a professional plan
      </p>
      <p className="relative mx-auto mt-2 max-w-[560px] text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
        Start with a workstream, task, milestone, dependency, or ask the v2 AI to propose a branch. This surface only uses the isolated Timeline 2 data model.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="relative mt-6 inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white shadow-lg"
        style={{ background: "linear-gradient(135deg, #214968, #5d8bab)", boxShadow: "0 14px 30px rgba(93,139,171,0.24)" }}
      >
        <Plus size={14} />
        Add first workstream
      </button>
    </div>
  );
}
