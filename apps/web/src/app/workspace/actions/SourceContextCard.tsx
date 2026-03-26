"use client";

import { useState } from "react";
import { CalendarDays, FileText, Hash, Mail, MessageSquare } from "lucide-react";
import { WorkspaceAction } from "@/app/dashboard/types";

const SOURCE_CONFIG = {
  slack: { label: "Slack", icon: Hash, color: "#4f46e5", background: "#f0f0ff" },
  email: { label: "Email", icon: Mail, color: "#0073EA", background: "#e6f0ff" },
  calendar: { label: "Calendar", icon: CalendarDays, color: "#059669", background: "#e6faf0" },
  transcript: { label: "Transcript", icon: FileText, color: "#676879", background: "#f5f6f8" },
  larry_chat: { label: "Larry intake", icon: MessageSquare, color: "#8B5CF6", background: "#f4efff" },
} as const;

function readPayloadString(payload: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  const diffMs = timestamp.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffDays, "day");
  }

  return timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function summarizeAction(action: WorkspaceAction): string {
  const payload = action.payload;

  switch (action.actionType) {
    case "project_create": {
      const projectName = readPayloadString(payload, "name") ?? "New project";
      const taskCount = Array.isArray(payload?.tasks) ? payload.tasks.length : 0;
      return taskCount > 0 ? `${projectName} with ${taskCount} starter tasks` : projectName;
    }
    case "status_update": {
      const taskName = readPayloadString(payload, "taskTitle", "title", "taskId") ?? "Task";
      const fromStatus = readPayloadString(payload, "fromStatus", "previousStatus");
      const toStatus = readPayloadString(payload, "toStatus", "status");
      if (fromStatus && toStatus) {
        return `${taskName}: ${humanize(fromStatus)} -> ${humanize(toStatus)}`;
      }
      return toStatus ? `${taskName}: ${humanize(toStatus)}` : taskName;
    }
    case "email_draft":
      return `Draft email to ${readPayloadString(payload, "to", "recipient", "email") ?? "recipient"}`;
    case "follow_up":
      return `Follow up with ${readPayloadString(payload, "recipient", "to", "owner") ?? "recipient"}`;
    case "meeting_invite":
      return readPayloadString(payload, "title", "subject", "meetingTitle") ?? "Meeting invite";
    default:
      return humanize(action.actionType ?? "proposal");
  }
}

export function SourceContextCard({ action }: { action: WorkspaceAction }) {
  const [showFullWhy, setShowFullWhy] = useState(false);
  const sourceType = action.source?.type ?? "transcript";
  const sourceConfig = SOURCE_CONFIG[sourceType] ?? SOURCE_CONFIG.transcript;
  const Icon = sourceConfig.icon;
  const why = action.reasoning?.why ?? action.reason;
  const shouldCollapseWhy = why.length > 180;
  const visibleWhy = shouldCollapseWhy && !showFullWhy ? `${why.slice(0, 177).trimEnd()}...` : why;
  const sourceLabel = [
    action.source?.channelOrTitle ? `From ${action.source.channelOrTitle}` : `From ${sourceConfig.label}`,
    formatTimestamp(action.source?.timestamp),
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-gray-light)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: sourceConfig.background, color: sourceConfig.color }}
        >
          <Icon size={11} />
          {sourceConfig.label}
        </span>
        {sourceLabel && (
          <span className="text-[11px] text-[var(--pm-text-muted)]">{sourceLabel}</span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">What happened</p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--pm-text)]">{summarizeAction(action)}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">Why</p>
          <p className="mt-1 text-[13px] leading-6 text-[var(--pm-text-secondary)]">{visibleWhy}</p>
          {shouldCollapseWhy && (
            <button
              type="button"
              onClick={() => setShowFullWhy((value) => !value)}
              className="mt-1 text-[12px] font-medium text-[var(--pm-blue)] hover:underline"
            >
              {showFullWhy ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pm-text-muted)]">Source</p>
          <blockquote className="mt-1 rounded-lg border border-[var(--pm-border)] bg-white px-3 py-3 text-[13px] leading-6 text-[var(--pm-text-secondary)]">
            {action.source?.excerpt ?? "Source context was not captured for this action."}
          </blockquote>
        </div>
      </div>
    </div>
  );
}
