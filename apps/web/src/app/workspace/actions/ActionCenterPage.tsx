"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronRight, FileText, Hash, Mail, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { WorkspaceAction, EmailDraft, ActionCardViewModel } from "@/app/dashboard/types";
import { useActionCenter } from "@/app/dashboard/useActionCenter";

type SourceType = "slack" | "email" | "calendar" | "transcript";

interface AgentRunDetail {
  run: {
    id: string;
    source: SourceType;
    sourceRefId: string | null;
    state: string;
    statusMessage: string | null;
    createdAt: string;
  };
  transitions: Array<{
    previousState: string | null;
    nextState: string;
    reason: string;
    createdAt: string;
  }>;
}

const SOURCE_CONFIG: Record<SourceType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  slack:      { label: "Slack",             icon: Hash,         color: "#4f46e5", bg: "#f0f0ff" },
  email:      { label: "Email",             icon: Mail,         color: "#0073EA", bg: "#e6f0ff" },
  calendar:   { label: "Google Calendar",   icon: CalendarDays, color: "#059669", bg: "#e6faf0" },
  transcript: { label: "Meeting Transcript",icon: FileText,     color: "#676879", bg: "#f5f6f8" },
};

function SourcePanel({ data }: { data: AgentRunDetail }) {
  const config = SOURCE_CONFIG[data.run.source] ?? SOURCE_CONFIG.transcript;
  const Icon = config.icon;
  const trail = data.transitions.map((t) => t.nextState);

  return (
    <div className="mt-2 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: config.bg, color: config.color }}
        >
          <Icon size={11} />
          {config.label}
        </span>
        <span className="text-[11px] font-medium text-[var(--pm-text-muted)] uppercase tracking-wide">
          {data.run.state}
        </span>
      </div>

      {trail.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {trail.map((step, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-white border border-[var(--pm-border)] text-[var(--pm-text-secondary)]">
                {step}
              </span>
              {i < trail.length - 1 && (
                <span className="text-[10px] text-[var(--pm-text-muted)]">→</span>
              )}
            </span>
          ))}
        </div>
      )}

      {data.run.sourceRefId && (
        <p className="text-[11px] text-[var(--pm-text-muted)] font-mono truncate">
          ref: {data.run.sourceRefId}
        </p>
      )}

      {data.run.statusMessage && (
        <p className="text-[12px] text-[var(--pm-text-secondary)]">{data.run.statusMessage}</p>
      )}
    </div>
  );
}

type FilterTab = "all" | "email" | "deadline" | "scope" | "meeting";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  email: "Email Drafts",
  deadline: "Deadline Changes",
  scope: "Scope Changes",
  meeting: "Meeting Invites",
};

function impactBadge(impact: ActionCardViewModel["impact"]): { label: string; bg: string } {
  if (impact === "high") return { label: "High impact", bg: "bg-[var(--pm-red-light)] text-[var(--pm-red)]" };
  if (impact === "medium") return { label: "Medium", bg: "bg-[var(--pm-orange-light)] text-[#b87900]" };
  return { label: "Low", bg: "bg-[#e6f0ff] text-[var(--pm-blue)]" };
}

function confidenceBar(conf: string): number {
  const v = parseFloat(conf);
  return Number.isNaN(v) ? 0 : Math.min(1, Math.max(0, v)) * 100;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return { error: text } as T; }
}

export function ActionCenterPage() {
  const [loading, setLoading] = useState(true);
  const [rawActions, setRawActions] = useState<WorkspaceAction[]>([]);
  const [rawDrafts, setRawDrafts] = useState<EmailDraft[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [sourceCache, setSourceCache] = useState<Record<string, AgentRunDetail>>({});
  const [sourceLoadingId, setSourceLoadingId] = useState<string | null>(null);

  const toggleSource = useCallback(async (actionId: string, agentRunId: string) => {
    if (expandedSourceId === actionId) {
      setExpandedSourceId(null);
      return;
    }
    setExpandedSourceId(actionId);
    if (sourceCache[actionId]) return;
    setSourceLoadingId(actionId);
    try {
      const res = await fetch(`/api/workspace/agent/runs/${agentRunId}`);
      const data = await res.json() as AgentRunDetail;
      setSourceCache((prev) => ({ ...prev, [actionId]: data }));
    } finally {
      setSourceLoadingId(null);
    }
  }, [expandedSourceId, sourceCache]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, draftRes] = await Promise.all([
        fetch("/api/workspace/actions"),
        fetch("/api/workspace/email/drafts"),
      ]);
      const actData = await readJson<{ actions?: WorkspaceAction[] }>(actRes);
      const draftData = await readJson<{ items?: EmailDraft[] }>(draftRes);
      setRawActions(actData.actions ?? []);
      setRawDrafts(draftData.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function onRefresh() { void load(); }
    window.addEventListener("larry:refresh-snapshot", onRefresh);
    return () => window.removeEventListener("larry:refresh-snapshot", onRefresh);
  }, [load]);

  const { actionCards, drafts, actionBusyId, correctionBusyId, draftBusyId, handleActionDecision, handleActionCorrect, sendEmailDraft } =
    useActionCenter(rawActions, rawDrafts);

  const filteredCards = filter === "all"
    ? actionCards
    : filter === "email"
    ? []
    : actionCards.filter((c) => {
        if (filter === "deadline") return c.title.includes("deadline") || c.title.includes("extend");
        if (filter === "scope") return c.title.includes("scope") || c.title.includes("plan");
        if (filter === "meeting") return c.title.includes("meeting") || c.title.includes("invite");
        return true;
      });

  const rawFilteredActions = rawActions.filter((a) => {
    const card = actionCards.find((c) => c.id === a.id);
    return card ? filteredCards.some((f) => f.id === card.id) : false;
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Action Center</h1>
            <p className="mt-1 text-[14px] text-[var(--pm-text-secondary)]">
              Larry's proposed actions — review signals, then approve or correct.
            </p>
          </div>
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#6366f1] px-2 text-[13px] font-bold text-white">
            {actionCards.length + drafts.length}
          </span>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex items-center gap-0 border-b border-[var(--pm-border)]">
          {(Object.entries(FILTER_LABELS) as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`relative px-4 pb-2 pt-1 text-[14px] font-medium transition-colors ${
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
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-8 py-6 space-y-4">
        {loading && (
          <p className="text-[14px] text-[var(--pm-text-muted)]">Loading…</p>
        )}

        {/* Email drafts (shown in All and Email tabs) */}
        {(filter === "all" || filter === "email") && drafts.map((draft) => (
          <article key={draft.id} className="rounded-xl border border-[var(--pm-border)] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <span className="inline-flex items-center rounded-full bg-[#e6f0ff] px-2 py-0.5 text-[11px] font-semibold text-[var(--pm-blue)] mb-1">
                  Email Draft
                </span>
                <h3 className="text-[15px] font-semibold text-[var(--pm-text)]">{draft.subject}</h3>
                <p className="text-[13px] text-[var(--pm-text-muted)]">To: {draft.recipient}</p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-gray-light)] p-3 text-[13px] text-[var(--pm-text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto">
              {draft.body}
            </div>
            <div className="flex gap-2 mt-3">
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

        {/* Action cards */}
        {rawFilteredActions.map((rawAction) => {
          const card = actionCards.find((c) => c.id === rawAction.id);
          if (!card) return null;
          const badge = impactBadge(card.impact);
          const confPct = confidenceBar(card.confidence);
          return (
            <article
              key={card.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${
                card.impact === "high" ? "border-l-4 border-l-[#E2445C] border-[#e6e9ef]" :
                card.impact === "medium" ? "border-l-4 border-l-[#FDAB3D] border-[#e6e9ef]" :
                "border-l-4 border-l-[#0073EA] border-[#e6e9ef]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-[var(--pm-text)] capitalize">
                    {card.title.replace(/_/g, " ")}
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold mt-1 ${badge.bg}`}>
                    {badge.label}
                  </span>
                </div>
              </div>

              {/* Reasoning */}
              <div className="mb-3 space-y-2">
                <p className="text-[14px] text-[var(--pm-text-secondary)]">{card.reason}</p>
                {rawAction.reasoning?.why && rawAction.reasoning.why !== card.reason && (
                  <p className="text-[13px] text-[var(--pm-text-muted)]">{rawAction.reasoning.why}</p>
                )}

                {/* Signals */}
                {rawAction.signals && rawAction.signals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rawAction.signals.map((s, i) => (
                      <span key={i} className="rounded-full bg-[#f0f1f5] px-2 py-0.5 text-[11px] text-[var(--pm-text-secondary)]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Confidence bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--pm-text-muted)] w-20 shrink-0">Confidence</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--pm-gray-light)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#6366f1]"
                      style={{ width: `${confPct}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-[var(--pm-text-muted)] w-10 text-right">{card.confidence}</span>
                </div>

                <p className="text-[12px] text-[var(--pm-text-muted)]">Policy: {card.threshold}</p>
              </div>

              {/* Source panel */}
              {rawAction.agentRunId && (
                <div className="mb-3 border-t border-[var(--pm-border)] pt-3">
                  <button
                    type="button"
                    onClick={() => void toggleSource(card.id, rawAction.agentRunId!)}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--pm-text-secondary)] hover:text-[var(--pm-text)] transition-colors"
                  >
                    <ChevronRight
                      size={13}
                      className={`transition-transform duration-150 ${expandedSourceId === card.id ? "rotate-90" : ""}`}
                    />
                    Source
                  </button>
                  {expandedSourceId === card.id && (
                    sourceLoadingId === card.id
                      ? <p className="mt-2 text-[12px] text-[var(--pm-text-muted)]">Loading…</p>
                      : sourceCache[card.id]
                      ? <SourcePanel data={sourceCache[card.id]} />
                      : null
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={actionBusyId === card.id}
                  onClick={() => void handleActionDecision(card.id, "approve")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00C875] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  <Check size={14} /> Approve
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

        {!loading && filteredCards.length === 0 && drafts.length === 0 && (
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
