"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { ActionCardViewModel, EmailDraft, WorkspaceAction } from "@/app/dashboard/types";
import { useActionCenter } from "@/app/dashboard/useActionCenter";
import { SourceContextCard } from "./SourceContextCard";

interface EmailDraftEditState {
  recipient: string;
  subject: string;
  body: string;
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  task_create: "Task Creates",
  status_update: "Status Updates",
  deadline_change: "Deadline Changes",
  owner_change: "Owner Changes",
  scope_change: "Scope Changes",
  risk_escalation: "Risk Escalations",
  email_draft: "Email Drafts",
  meeting_invite: "Meeting Invites",
  follow_up: "Follow Ups",
  other: "Other",
};

function impactBadge(impact: ActionCardViewModel["impact"]): { label: string; bg: string } {
  if (impact === "high") return { label: "High impact", bg: "bg-[var(--pm-red-light)] text-[var(--pm-red)]" };
  if (impact === "medium") return { label: "Medium", bg: "bg-[var(--pm-orange-light)] text-[#b87900]" };
  return { label: "Low", bg: "bg-[#e6f0ff] text-[var(--pm-blue)]" };
}

function confidenceBar(confidence: string): number {
  const value = parseFloat(confidence);
  return Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value)) * 100;
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

export function ActionCenterPage() {
  const [loading, setLoading] = useState(true);
  const [rawActions, setRawActions] = useState<WorkspaceAction[]>([]);
  const [rawDrafts, setRawDrafts] = useState<EmailDraft[]>([]);
  const [filter, setFilter] = useState("all");
  const [emailDraftEdits, setEmailDraftEdits] = useState<Record<string, EmailDraftEditState>>({});

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
        const stillExists = rawActions.some((action) => action.id === actionId && action.actionType === "email_draft");
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

  const presentTypes = Array.from(new Set(rawActions.map((action) => action.actionType ?? "other")));
  const hasDrafts = drafts.length > 0;
  const dynamicTabs: string[] = [
    "all",
    ...presentTypes.filter((type) => type !== "email_draft"),
    ...(presentTypes.includes("email_draft") || hasDrafts ? ["email_draft"] : []),
  ];

  const filteredRawActions = filter === "all"
    ? rawActions
    : rawActions.filter((action) => (action.actionType ?? "other") === filter);

  const filteredCards = actionCards.filter((card) => filteredRawActions.some((action) => action.id === card.id));
  const showEmailDrafts = filter === "all" || filter === "email_draft";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Action Center</h1>
            <p className="mt-1 text-[14px] text-[var(--pm-text-secondary)]">
              Review what Larry found, why it matters, and the source before you approve.
            </p>
          </div>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#6366f1] px-2 text-[13px] font-bold text-white">
            {actionCards.length + drafts.length}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-0 overflow-x-auto border-b border-[var(--pm-border)]">
          {dynamicTabs.map((key) => {
            const label = key === "all"
              ? "All"
              : ACTION_TYPE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`relative shrink-0 px-4 pb-2 pt-1 text-[14px] font-medium transition-colors ${
                  filter === key
                    ? "text-[var(--pm-blue)]"
                    : "text-[var(--pm-text-secondary)] hover:text-[var(--pm-text)]"
                }`}
              >
                {label}
                {filter === key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-[var(--pm-blue)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-8 py-6">
        {loading && (
          <p className="text-[14px] text-[var(--pm-text-muted)]">Loading...</p>
        )}

        {showEmailDrafts && drafts.map((draft) => (
          <article key={draft.id} className="rounded-xl border border-[var(--pm-border)] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <span className="mb-1 inline-flex items-center rounded-full bg-[#e6f0ff] px-2 py-0.5 text-[11px] font-semibold text-[var(--pm-blue)]">
                  Email Draft
                </span>
                <h3 className="text-[15px] font-semibold text-[var(--pm-text)]">{draft.subject}</h3>
                <p className="text-[13px] text-[var(--pm-text-muted)]">To: {draft.recipient}</p>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] p-3 text-[13px] text-[var(--pm-text-secondary)] whitespace-pre-wrap">
              {draft.body}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={draftBusyId === draft.id}
                onClick={() => void sendEmailDraft(draft.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0073EA] px-3 text-[13px] font-medium text-white disabled:opacity-50"
              >
                <Send size={13} /> Send
              </button>
            </div>
          </article>
        ))}

        {filteredRawActions.map((rawAction) => {
          const card = actionCards.find((item) => item.id === rawAction.id);
          if (!card) return null;

          const badge = impactBadge(card.impact);
          const confidenceWidth = confidenceBar(card.confidence);
          const isEmailDraftAction = rawAction.actionType === "email_draft";
          const draftEditState = isEmailDraftAction
            ? emailDraftEdits[card.id] ?? buildEmailDraftEditState(rawAction)
            : null;

          return (
            <article
              key={card.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${
                card.impact === "high" ? "border-l-4 border-l-[#E2445C] border-[#e6e9ef]"
                  : card.impact === "medium" ? "border-l-4 border-l-[#FDAB3D] border-[#e6e9ef]"
                  : "border-l-4 border-l-[#0073EA] border-[#e6e9ef]"
              }`}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold capitalize text-[var(--pm-text)]">
                    {card.title.replace(/_/g, " ")}
                  </h3>
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.bg}`}>
                    {badge.label}
                  </span>
                </div>
              </div>

              <div className="mb-4 space-y-3">
                <SourceContextCard action={rawAction} />

                {rawAction.signals && rawAction.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rawAction.signals.map((signal, index) => (
                      <span
                        key={`${rawAction.id}-signal-${index}`}
                        className="rounded-full bg-[#f0f1f5] px-2 py-0.5 text-[11px] text-[var(--pm-text-secondary)]"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12px] text-[var(--pm-text-muted)]">Confidence</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--pm-gray-light)]">
                    <div
                      className="h-full rounded-full bg-[#6366f1]"
                      style={{ width: `${confidenceWidth}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-[12px] text-[var(--pm-text-muted)]">{card.confidence}</span>
                </div>

                <p className="text-[12px] text-[var(--pm-text-muted)]">Policy: {card.threshold}</p>
              </div>

              {isEmailDraftAction && draftEditState && (
                <div className="mb-4 grid gap-3 rounded-xl border border-[var(--pm-border)] bg-[var(--pm-gray-light)] p-4">
                  <label className="grid gap-1 text-[12px] font-medium text-[var(--pm-text-secondary)]">
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
                      className="h-10 rounded-lg border border-[var(--pm-border)] bg-white px-3 text-[13px] text-[var(--pm-text)] outline-none focus:border-[var(--pm-blue)]"
                    />
                  </label>

                  <label className="grid gap-1 text-[12px] font-medium text-[var(--pm-text-secondary)]">
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
                      className="h-10 rounded-lg border border-[var(--pm-border)] bg-white px-3 text-[13px] text-[var(--pm-text)] outline-none focus:border-[var(--pm-blue)]"
                    />
                  </label>

                  <label className="grid gap-1 text-[12px] font-medium text-[var(--pm-text-secondary)]">
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
                      className="rounded-lg border border-[var(--pm-border)] bg-white px-3 py-2 text-[13px] text-[var(--pm-text)] outline-none focus:border-[var(--pm-blue)]"
                    />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionBusyId === card.id}
                  onClick={() => void handleActionDecision(
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
                  )}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00C875] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  <Check size={14} /> {isEmailDraftAction ? "Send draft" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === card.id}
                  onClick={() => void handleActionDecision(card.id, "reject")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#E2445C] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  <X size={14} /> Reject
                </button>
                <button
                  type="button"
                  disabled={correctionBusyId === card.id}
                  onClick={() => void handleActionCorrect(card.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e6e9ef] bg-white px-3 text-[13px] font-semibold text-[#323338] disabled:opacity-50"
                >
                  <RefreshCw size={14} /> Correct
                </button>
              </div>
            </article>
          );
        })}

        {!loading && filteredCards.length === 0 && (!showEmailDrafts || drafts.length === 0) && (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--pm-border)] bg-[var(--pm-surface)] py-16 text-center">
            <ShieldCheck size={32} className="mb-3 text-[var(--pm-text-muted)] opacity-40" />
            <p className="text-[15px] font-medium text-[var(--pm-text)]">All clear</p>
            <p className="mt-1 text-[13px] text-[var(--pm-text-muted)]">No pending actions in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}
