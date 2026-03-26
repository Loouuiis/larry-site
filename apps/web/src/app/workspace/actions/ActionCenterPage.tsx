"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { ActionCardViewModel, EmailDraft, WorkspaceAction } from "@/app/dashboard/types";
import { useActionCenter } from "@/app/dashboard/useActionCenter";
import { SourceContextCard } from "./SourceContextCard";

interface EmailDraftEditState {
  recipient: string;
  subject: string;
  body: string;
}

interface ProjectInfo {
  id: string;
  name: string;
}

function readPayloadString(payload: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function buildEmailDraftEditState(action: WorkspaceAction): EmailDraftEditState | null {
  if (action.actionType !== "email_draft") return null;
  return {
    recipient: readPayloadString(action.payload, "to", "recipient", "email"),
    subject: readPayloadString(action.payload, "subject", "title"),
    body: readPayloadString(action.payload, "body", "message", "slackMessage"),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as T;
  }
}

function humanizeStr(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "unknown date";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function taskLabel(payload: Record<string, unknown> | undefined): string {
  const t = payload?.taskTitle ?? payload?.title;
  return typeof t === "string" && t ? ` for "${t}"` : "";
}

function buildActionTitle(action: WorkspaceAction): string {
  const p = action.payload ?? {};
  switch (action.actionType) {
    case "deadline_change":
      return `Update deadline${taskLabel(p)} to ${fmtDate(p.newDate ?? p.dueDate ?? p.newDeadline)}`;
    case "status_update": {
      const to = p.toStatus ?? p.status;
      return `Mark${taskLabel(p)} as ${typeof to === "string" ? humanizeStr(to) : "updated"}`;
    }
    case "owner_change":
      return `Assign${taskLabel(p)} to ${p.newOwner ?? p.owner ?? "new owner"}`;
    case "task_create":
      return `Create new task: "${p.title ?? p.taskTitle ?? "Untitled"}"`;
    case "email_draft":
      return `Draft email to ${p.to ?? p.recipient ?? "recipient"}: "${p.subject ?? "No subject"}"`;
    case "follow_up":
      return `Send follow-up to ${p.recipient ?? p.to ?? "recipient"}`;
    case "meeting_invite":
      return `Schedule meeting: "${p.title ?? p.subject ?? "Untitled"}"`;
    case "scope_change":
      return `Update project scope${taskLabel(p)}`;
    case "risk_escalation":
      return `Escalate risk${taskLabel(p)}`;
    default:
      return humanizeStr(action.actionType ?? "action");
  }
}

function buildSourceSummary(action: WorkspaceAction): string {
  const p = action.payload ?? {};
  const source = readPayloadString(p as Record<string, unknown>, "sourceType", "source", "channel", "platform");
  const context = readPayloadString(p as Record<string, unknown>, "sourceContext", "context", "summary", "reason");
  if (source && context) return `${humanizeStr(source)}: ${context}`;
  if (context) return context;
  if (source) return `Via ${humanizeStr(source)}`;
  return action.reason ?? "No source context";
}

function relativeTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return fmtDate(value);
}

function confidenceNumber(confidence: string): number {
  const value = parseFloat(confidence);
  if (Number.isNaN(value)) return 0;
  // Handle 0–1 range vs 0–100 range
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

type FilterTab = { id: string; name: string };

export function ActionCenterPage() {
  const [loading, setLoading] = useState(true);
  const [rawActions, setRawActions] = useState<WorkspaceAction[]>([]);
  const [rawDrafts, setRawDrafts] = useState<EmailDraft[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [emailDraftEdits, setEmailDraftEdits] = useState<Record<string, EmailDraftEditState>>({});
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionsResponse, draftsResponse] = await Promise.all([
        fetch("/api/workspace/actions"),
        fetch("/api/workspace/email/drafts?state=draft"),
      ]);
      const actionData = await readJson<{ actions?: WorkspaceAction[] }>(actionsResponse);
      const draftData = await readJson<{ items?: EmailDraft[] }>(draftsResponse);
      setRawActions(actionData.actions ?? []);
      setRawDrafts(draftData.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load();
    }
    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [load]);

  useEffect(() => {
    fetch("/api/workspace/snapshot?includeProjectContext=false")
      .then((r) => r.json())
      .then((data: { projects?: ProjectInfo[] }) => {
        if (Array.isArray(data.projects)) setProjects(data.projects);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setEmailDraftEdits((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const action of rawActions) {
        if (action.actionType !== "email_draft" || next[action.id]) continue;
        const initialState = buildEmailDraftEditState(action);
        if (!initialState) continue;
        next[action.id] = initialState;
        changed = true;
      }

      for (const actionId of Object.keys(next)) {
        const stillExists = rawActions.some(
          (action) => action.id === actionId && action.actionType === "email_draft"
        );
        if (!stillExists) {
          delete next[actionId];
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [rawActions]);

  const {
    actionCards,
    drafts,
    actionBusyId,
    correctionBusyId,
    draftBusyId,
    handleActionDecision,
    handleActionCorrect,
    sendEmailDraft,
  } = useActionCenter(rawActions, rawDrafts);

  const projectsWithActions = useMemo(() => {
    const ids = Array.from(
      new Set(rawActions.map((a) => a.projectId).filter(Boolean) as string[])
    );
    return ids.map((id) => ({
      id,
      name: projects.find((p) => p.id === id)?.name ?? "Unknown project",
    }));
  }, [rawActions, projects]);

  const filterTabs: FilterTab[] = useMemo(
    () => [
      { id: "all", name: "All" },
      { id: "__high__", name: "High Impact" },
      ...projectsWithActions,
    ],
    [projectsWithActions]
  );

  const filteredActions = useMemo(() => {
    if (projectFilter === "all") return rawActions;
    if (projectFilter === "__high__") {
      // High impact across all projects, sorted by confidence ascending (lowest first)
      return [...rawActions]
        .filter((a) => {
          const card = actionCards.find((c) => c.id === a.id);
          return card?.impact === "high";
        })
        .sort((a, b) => {
          const cardA = actionCards.find((c) => c.id === a.id);
          const cardB = actionCards.find((c) => c.id === b.id);
          const confA = confidenceNumber(cardA?.confidence ?? "0");
          const confB = confidenceNumber(cardB?.confidence ?? "0");
          return confA - confB;
        });
    }
    return rawActions.filter((a) => a.projectId === projectFilter);
  }, [rawActions, actionCards, projectFilter]);

  const totalCount = actionCards.length + drafts.length;

  function renderActionRow(rawAction: WorkspaceAction) {
    const card = actionCards.find((item) => item.id === rawAction.id);
    if (!card) return null;

    const isExpanded = expandedIds.has(rawAction.id);
    const isEmailDraftAction = rawAction.actionType === "email_draft";
    const draftEditState = isEmailDraftAction
      ? (emailDraftEdits[card.id] ?? buildEmailDraftEditState(rawAction))
      : null;

    const confNum = confidenceNumber(card.confidence);
    const sourceSummary = buildSourceSummary(rawAction);
    const timestamp = relativeTime(
      rawAction.createdAt ?? rawAction.payload?.createdAt ?? rawAction.payload?.timestamp
    );

    const impactRowClass =
      card.impact === "high"
        ? "pm-action-row pm-action-row-high"
        : card.impact === "medium"
        ? "pm-action-row pm-action-row-medium"
        : "pm-action-row pm-action-row-low";

    return (
      <div key={rawAction.id} className={impactRowClass}>
        {/* Collapsed header — always visible, click to toggle */}
        <button
          type="button"
          onClick={() => toggleExpanded(rawAction.id)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
          style={{ minHeight: 44 }}
          aria-expanded={isExpanded}
        >
          {/* Left: title + source summary */}
          <div className="min-w-0 flex-1">
            <div className="text-h3 truncate">{buildActionTitle(rawAction)}</div>
            <div className="text-body-sm mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
              {sourceSummary}
            </div>
          </div>

          {/* Confidence */}
          <div
            className="text-body-sm shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            {confNum}% confidence
          </div>

          {/* Timestamp */}
          {timestamp && (
            <div
              className="text-body-sm shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {timestamp}
            </div>
          )}

          {/* Chevron */}
          <span className="shrink-0 text-[var(--text-muted)]">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {/* Expanded details */}
        {isExpanded && (
          <div
            className="px-4 pb-4"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="mt-4 space-y-3">
              {/* Source context card */}
              <SourceContextCard action={rawAction} />

              {/* Signals pills */}
              {rawAction.signals && rawAction.signals.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rawAction.signals.map((signal, index) => (
                    <span
                      key={`${rawAction.id}-signal-${index}`}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              )}

              {/* Policy explanation */}
              {card.threshold && (
                <p className="text-caption" style={{ color: "var(--text-muted)" }}>
                  Policy: {card.threshold}
                </p>
              )}

              {/* Email draft editor */}
              {isEmailDraftAction && draftEditState && (
                <div
                  className="mt-3 grid gap-3 rounded-[var(--radius-card)] p-4"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                  }}
                >
                  <label
                    className="grid gap-1"
                    style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}
                  >
                    To
                    <input
                      value={draftEditState.recipient}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmailDraftEdits((previous) => ({
                          ...previous,
                          [card.id]: {
                            ...(previous[card.id] ?? draftEditState),
                            recipient: value,
                          },
                        }));
                      }}
                      className="h-10 rounded-[var(--radius-btn)] px-3 outline-none"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        fontSize: 13,
                        color: "var(--text-1)",
                      }}
                    />
                  </label>
                  <label
                    className="grid gap-1"
                    style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}
                  >
                    Subject
                    <input
                      value={draftEditState.subject}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmailDraftEdits((previous) => ({
                          ...previous,
                          [card.id]: {
                            ...(previous[card.id] ?? draftEditState),
                            subject: value,
                          },
                        }));
                      }}
                      className="h-10 rounded-[var(--radius-btn)] px-3 outline-none"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        fontSize: 13,
                        color: "var(--text-1)",
                      }}
                    />
                  </label>
                  <label
                    className="grid gap-1"
                    style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}
                  >
                    Body
                    <textarea
                      value={draftEditState.body}
                      onChange={(event) => {
                        const value = event.target.value;
                        setEmailDraftEdits((previous) => ({
                          ...previous,
                          [card.id]: {
                            ...(previous[card.id] ?? draftEditState),
                            body: value,
                          },
                        }));
                      }}
                      rows={6}
                      className="rounded-[var(--radius-btn)] px-3 py-2 outline-none"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        fontSize: 13,
                        color: "var(--text-1)",
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionBusyId === card.id}
                onClick={() =>
                  void handleActionDecision(
                    card.id,
                    "approve",
                    isEmailDraftAction && draftEditState
                      ? {
                          overridePayload: {
                            to: draftEditState.recipient,
                            recipient: draftEditState.recipient,
                            subject: draftEditState.subject,
                            body: draftEditState.body,
                          },
                        }
                      : {}
                  )
                }
                className="pm-btn pm-btn-sm pm-btn-success inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check size={14} />
                {isEmailDraftAction ? "Send draft" : "Approve"}
              </button>
              <button
                type="button"
                disabled={actionBusyId === card.id}
                onClick={() => void handleActionDecision(card.id, "reject")}
                className="pm-btn pm-btn-sm pm-btn-danger inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <X size={14} />
                Reject
              </button>
              <button
                type="button"
                disabled={correctionBusyId === card.id}
                onClick={() => void handleActionCorrect(card.id)}
                className="pm-btn pm-btn-sm pm-btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Correct
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const showEmailDrafts = projectFilter === "all";
  const hasContent =
    filteredActions.length > 0 || (showEmailDrafts && drafts.length > 0);

  return (
    <div
      className="min-h-full overflow-y-auto px-6 py-6"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Page header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1" style={{ color: "var(--text-1)" }}>
            Action Centre
          </h1>
          <p
            className="text-body-sm mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Review what Larry found, why it matters, and the source before you approve.
          </p>
        </div>

        {/* Total count badge */}
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-2)",
            border: "1px solid var(--border)",
            minWidth: 28,
            height: 24,
          }}
        >
          {totalCount}
        </span>
      </div>

      {/* Filter tabs */}
      <div
        className="mb-5 flex items-center overflow-x-auto"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {filterTabs.map((tab) => {
          const isActive = projectFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setProjectFilter(tab.id)}
              className="relative shrink-0 px-4 pb-2 pt-1 transition-colors"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? "var(--cta)" : "var(--text-muted)",
                borderBottom: isActive
                  ? "2px solid var(--cta)"
                  : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "var(--cta)" : "transparent",
                cursor: "pointer",
              }}
            >
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Skeleton loading */}
      {loading && (
        <div
          className="overflow-hidden"
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            background: "var(--surface)",
          }}
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="px-4 py-3"
              style={{ borderBottom: n < 3 ? "1px solid var(--border)" : undefined }}
            >
              <div
                className="pm-shimmer mb-2 h-4 rounded"
                style={{ width: "55%" }}
              />
              <div
                className="pm-shimmer h-3 rounded"
                style={{ width: "35%" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && hasContent && (
        <div className="space-y-5">
          {/* Email drafts — all view only */}
          {showEmailDrafts && drafts.length > 0 && (
            <div
              className="overflow-hidden"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                background: "var(--surface)",
              }}
            >
              {drafts.map((draft, index) => {
                const isExpanded = expandedIds.has(`draft-${draft.id}`);
                return (
                  <div
                    key={draft.id}
                    style={{
                      borderBottom:
                        index < drafts.length - 1
                          ? "1px solid var(--border)"
                          : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(`draft-${draft.id}`)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                      style={{ minHeight: 44 }}
                      aria-expanded={isExpanded}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-h3 truncate">{draft.subject}</div>
                        <div
                          className="text-body-sm mt-0.5 truncate"
                          style={{ color: "var(--text-muted)" }}
                        >
                          To: {draft.recipient}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: "#e6f0ff",
                          color: "var(--cta)",
                        }}
                      >
                        Email Draft
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </button>

                    {isExpanded && (
                      <div
                        className="px-4 pb-4"
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <div
                          className="mt-4 max-h-32 overflow-y-auto rounded-[var(--radius-btn)] p-3 text-[13px] whitespace-pre-wrap"
                          style={{
                            border: "1px solid var(--border)",
                            background: "var(--surface-2)",
                            color: "var(--text-2)",
                          }}
                        >
                          {draft.body}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={draftBusyId === draft.id}
                            onClick={() => void sendEmailDraft(draft.id)}
                            className="pm-btn pm-btn-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                            style={{
                              background: "var(--cta)",
                              color: "#fff",
                            }}
                          >
                            <Send size={13} />
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action rows list */}
          {filteredActions.length > 0 && (
            <div
              className="overflow-hidden"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-card)",
                background: "var(--surface)",
              }}
            >
              {filteredActions.map((rawAction, index) => {
                const row = renderActionRow(rawAction);
                if (!row) return null;
                return (
                  <div
                    key={rawAction.id}
                    style={{
                      borderBottom:
                        index < filteredActions.length - 1
                          ? "1px solid var(--border)"
                          : undefined,
                    }}
                  >
                    {row}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasContent && (
        <div
          className="flex flex-col items-center rounded-[var(--radius-card)] border-dashed py-16 text-center"
          style={{
            border: "1px dashed var(--border)",
            background: "var(--surface)",
          }}
        >
          <ShieldCheck
            size={32}
            className="mb-3 opacity-40"
            style={{ color: "var(--text-muted)" }}
          />
          <p
            className="text-h3"
            style={{ fontSize: 15, color: "var(--text-1)" }}
          >
            All clear
          </p>
          <p
            className="text-body-sm mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            No pending actions in this category.
          </p>
        </div>
      )}
    </div>
  );
}
