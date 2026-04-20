"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";
import { TimelineSuggestionPreview } from "./TimelineSuggestionPreview";

/**
 * Collapsible action detail preview.
 * Shows a 1-2 line description that expands on click to reveal:
 * - Full description text
 * - For task_create: structured key/value panel (priority, dates, assignee, labels)
 * - For email_draft: To, Subject, and Body
 * - For slack_message_draft: Channel and Message
 * - For project_note_send: Note content
 */
export function ActionDetailPreview({ event }: { event: WorkspaceLarryEvent }) {
  const [expanded, setExpanded] = useState(false);

  if (typeof event.actionType === "string" && event.actionType.startsWith("timeline_")) {
    return <TimelineSuggestionPreview event={event} />;
  }

  const payload = event.payload ?? {};
  const description = typeof payload.description === "string" ? payload.description.trim() : null;

  const isEmailDraft = event.actionType === "email_draft";
  const isSlackDraft = event.actionType === "slack_message_draft";
  const isProjectNote = event.actionType === "project_note_send";
  const isTaskCreate = event.actionType === "task_create";
  const hasContent = isEmailDraft || isSlackDraft || isProjectNote || isTaskCreate;

  if (!description && !hasContent) return null;

  // For task_create cards, favour the structured key/value summary as the
  // preview line rather than a truncated description. Reviewers need to see
  // priority, dates, and assignee at a glance without having to expand.
  // (B-003.)
  const taskCreatePreviewLine = isTaskCreate ? buildTaskCreateSummary(payload) : null;

  const previewText = taskCreatePreviewLine
    ? taskCreatePreviewLine
    : description
    ? description.length > 140
      ? description.slice(0, 140) + "..."
      : description
    : isEmailDraft
      ? `To: ${payload.to ?? "—"} · ${typeof payload.subject === "string" ? payload.subject : "No subject"}`
      : isSlackDraft
        ? `${payload.channelName ?? "#channel"} · ${typeof payload.message === "string" ? (payload.message as string).slice(0, 80) + "..." : ""}`
        : null;

  if (!previewText && !hasContent) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-start gap-1.5 text-left text-[12px] leading-5"
        style={{ color: "var(--text-2)" }}
      >
        <ChevronRight
          size={14}
          className="mt-0.5 shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <span className={expanded ? "" : "line-clamp-2"}>
          {expanded && description ? description : previewText}
        </span>
      </button>

      {expanded && hasContent && (
        <div
          className="mt-2 ml-5 rounded-lg border px-3 py-3"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {isEmailDraft && (
            <>
              <div className="space-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <p>
                  <span className="font-semibold">To:</span>{" "}
                  {typeof payload.to === "string" ? payload.to : "—"}
                </p>
                <p>
                  <span className="font-semibold">Subject:</span>{" "}
                  {typeof payload.subject === "string" ? payload.subject : "—"}
                </p>
              </div>
              <div
                className="mt-2 border-t pt-2 text-[12px] leading-5"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-1)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {typeof payload.body === "string" ? payload.body : "No content"}
              </div>
            </>
          )}
          {isSlackDraft && (
            <>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold">Channel:</span>{" "}
                {typeof payload.channelName === "string" ? payload.channelName : "—"}
                {payload.isDm === true && (
                  <span className="ml-2 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#eff6ff", color: "#2563eb" }}>
                    DM
                  </span>
                )}
              </p>
              <div
                className="mt-2 border-t pt-2 text-[12px] leading-5"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-1)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {typeof payload.message === "string" ? payload.message : "No content"}
              </div>
            </>
          )}
          {isProjectNote && (
            <div
              className="text-[12px] leading-5"
              style={{ color: "var(--text-1)", whiteSpace: "pre-wrap" }}
            >
              {typeof payload.content === "string" ? payload.content : "No content"}
            </div>
          )}
          {isTaskCreate && <TaskCreateDetail payload={payload} />}
        </div>
      )}
    </div>
  );
}

function buildTaskCreateSummary(payload: Record<string, unknown>): string | null {
  const bits: string[] = [];
  const priority = typeof payload.priority === "string" ? payload.priority : null;
  if (priority) bits.push(`${priority} priority`);
  if (typeof payload.dueDate === "string" && payload.dueDate) bits.push(`due ${payload.dueDate}`);
  else if (typeof payload.startDate === "string" && payload.startDate) bits.push(`starts ${payload.startDate}`);
  const assignee = typeof payload.assigneeName === "string" && payload.assigneeName.trim()
    ? payload.assigneeName.trim()
    : null;
  if (assignee) bits.push(`→ ${assignee}`);
  else bits.push("→ unassigned");
  const labels = Array.isArray(payload.labels)
    ? payload.labels.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  if (labels.length > 0) bits.push(`labels: ${labels.join(", ")}`);
  return bits.length > 0 ? bits.join(" · ") : null;
}

function TaskCreateDetail({ payload }: { payload: Record<string, unknown> }) {
  const priority = typeof payload.priority === "string" ? payload.priority : "medium";
  const startDate = typeof payload.startDate === "string" && payload.startDate ? payload.startDate : "—";
  const dueDate = typeof payload.dueDate === "string" && payload.dueDate ? payload.dueDate : "—";
  const assignee = typeof payload.assigneeName === "string" && payload.assigneeName.trim()
    ? payload.assigneeName.trim()
    : "(unassigned)";
  const labels = Array.isArray(payload.labels)
    ? payload.labels.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const description = typeof payload.description === "string" && payload.description.trim()
    ? payload.description.trim()
    : null;

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <dt className="font-semibold">Priority</dt>
        <dd style={{ color: "var(--text-1)" }}>{priority}</dd>
        <dt className="font-semibold">Start</dt>
        <dd style={{ color: "var(--text-1)" }}>{startDate}</dd>
        <dt className="font-semibold">Due</dt>
        <dd style={{ color: "var(--text-1)" }}>{dueDate}</dd>
        <dt className="font-semibold">Assignee</dt>
        <dd style={{ color: "var(--text-1)" }}>{assignee}</dd>
        <dt className="font-semibold">Labels</dt>
        <dd style={{ color: "var(--text-1)" }}>
          {labels.length === 0 ? (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-2)" }}
                >
                  {label}
                </span>
              ))}
            </span>
          )}
        </dd>
      </dl>
      {description && (
        <div
          className="border-t pt-2 text-[12px] leading-5"
          style={{ borderColor: "var(--border)", color: "var(--text-1)", whiteSpace: "pre-wrap" }}
        >
          {description}
        </div>
      )}
    </div>
  );
}
