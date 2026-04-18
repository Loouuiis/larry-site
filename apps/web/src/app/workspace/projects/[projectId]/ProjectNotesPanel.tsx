"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getTimezone } from "@/lib/timezone-context";
import type {
  WorkspaceProjectMember,
  WorkspaceProjectMembers,
  WorkspaceProjectNoteVisibility,
} from "@/app/dashboard/types";
import { useProjectNotes } from "@/hooks/useProjectNotes";

function formatRelativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: getTimezone(),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function ProjectNotesPanel({ projectId }: { projectId: string }) {
  const [filter, setFilter] = useState<"all" | WorkspaceProjectNoteVisibility>("all");
  const [composerVisibility, setComposerVisibility] = useState<WorkspaceProjectNoteVisibility>("shared");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [content, setContent] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceProjectMember[]>([]);

  const { notes, loading, error, creating, create, refresh } = useProjectNotes(projectId, filter);

  useEffect(() => {
    let active = true;
    async function loadMembers() {
      const response = await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/members`, {
        cache: "no-store",
      });
      const payload = await readJson<WorkspaceProjectMembers & { error?: string }>(response);
      if (!response.ok || !active) return;
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    }

    void loadMembers();
    return () => {
      active = false;
    };
  }, [projectId]);

  const personalRecipients = useMemo(() => members, [members]);

  useEffect(() => {
    if (composerVisibility !== "personal") {
      setRecipientUserId("");
      return;
    }

    if (personalRecipients.length === 0) {
      setRecipientUserId("");
      return;
    }

    if (!personalRecipients.some((member) => member.userId === recipientUserId)) {
      setRecipientUserId(personalRecipients[0]?.userId ?? "");
    }
  }, [composerVisibility, personalRecipients, recipientUserId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    try {
      await create({
        visibility: composerVisibility,
        content,
        recipientUserId: composerVisibility === "personal" ? recipientUserId : null,
      });
      setContent("");
      if (composerVisibility === "personal") {
        setRecipientUserId(personalRecipients[0]?.userId ?? "");
      }
    } catch (createError) {
      setSubmitError(createError instanceof Error ? createError.message : "Failed to send note.");
    }
  }

  return (
    <div
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[18px] font-semibold" style={{ color: "var(--text-1)" }}>
            Project Notes
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
            Shared and personal collaborator notes inside the project workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
            View
          </label>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | WorkspaceProjectNoteVisibility)}
            className="rounded-full border px-3 py-1.5 text-[12px] font-medium"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-1)" }}
          >
            <option value="all">All notes</option>
            <option value="shared">Shared notes</option>
            <option value="personal">Personal notes</option>
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-[12px] font-semibold"
            style={{ color: "var(--cta)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-4 space-y-3 rounded-[16px] border px-4 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
            Note type
            <select
              value={composerVisibility}
              onChange={(event) => setComposerVisibility(event.target.value as WorkspaceProjectNoteVisibility)}
              disabled={creating}
              className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
            >
              <option value="shared">Shared</option>
              <option value="personal">Personal</option>
            </select>
          </label>

          {composerVisibility === "personal" && (
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
              Recipient
              <select
                value={recipientUserId}
                onChange={(event) => setRecipientUserId(event.target.value)}
                disabled={creating || personalRecipients.length === 0}
                className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
              >
                {personalRecipients.length === 0 && <option value="">No collaborators available</option>}
                {personalRecipients.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label className="block text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
          Note
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              composerVisibility === "personal"
                ? "Write a personal note for this collaborator..."
                : "Write a shared note for the project team..."
            }
            rows={3}
            maxLength={4000}
            className="mt-1 w-full rounded-[12px] border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
          />
        </label>

        {submitError && (
          <div
            className="rounded-[12px] border px-3 py-2 text-[13px]"
            style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            {submitError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              creating ||
              content.trim().length === 0 ||
              (composerVisibility === "personal" && recipientUserId.trim().length === 0)
            }
            className="rounded-full px-4 py-2 text-[12px] font-semibold text-white"
            style={{ background: "var(--cta)" }}
          >
            {creating ? "Sending..." : composerVisibility === "personal" ? "Send personal note" : "Send shared note"}
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {error && (
          <div
            className="rounded-[12px] border px-3 py-2 text-[13px]"
            style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            {error}
          </div>
        )}

        {loading && notes.length === 0 ? (
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            Loading notes...
          </p>
        ) : notes.length === 0 ? (
          <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
            No notes yet for this view.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="rounded-[16px] border px-4 py-3"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
                  {note.visibility === "shared"
                    ? `Shared note by ${note.authorName}`
                    : `${note.authorName} to ${note.recipientName ?? "recipient"}`}
                </p>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {formatRelativeTime(note.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
                {note.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
