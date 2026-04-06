"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { WorkspaceLarryEvent } from "@/app/dashboard/types";

/**
 * Collapsible action detail preview.
 * Shows a 1-2 line description that expands on click to reveal:
 * - Full description text
 * - For email_draft: To, Subject, and Body
 * - For slack_message_draft: Channel and Message
 * - For project_note_send: Note content
 */
export function ActionDetailPreview({ event }: { event: WorkspaceLarryEvent }) {
  const [expanded, setExpanded] = useState(false);
  const payload = event.payload ?? {};
  const description = typeof payload.description === "string" ? payload.description.trim() : null;

  const isEmailDraft = event.actionType === "email_draft";
  const isSlackDraft = event.actionType === "slack_message_draft";
  const isProjectNote = event.actionType === "project_note_send";
  const hasContent = isEmailDraft || isSlackDraft || isProjectNote;

  if (!description && !hasContent) return null;

  const previewText = description
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
        </div>
      )}
    </div>
  );
}
