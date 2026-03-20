"use client";

import { Check, Clock, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { ActionCardViewModel, ConnectorStatus, EmailDraft, WorkspaceActivityItem, WorkspaceOutcomes } from "./types";

interface RightPanelProps {
  completionRate: number;
  avgRiskScore: number;
  blockedCount: number;
  outcomes: WorkspaceOutcomes | null | undefined;
  actionCards: ActionCardViewModel[];
  activityItems: WorkspaceActivityItem[];
  emailDrafts: EmailDraft[];
  actionBusyId: string | null;
  correctionBusyId: string | null;
  draftBusyId: string | null;
  connectors: {
    slack?: ConnectorStatus;
    calendar?: ConnectorStatus;
    email?: ConnectorStatus;
  };
  onActionDecision: (actionId: string, decision: "approve" | "reject") => Promise<void> | void;
  onActionCorrect: (actionId: string) => Promise<void> | void;
  onConnectorInstall: (connector: "slack" | "calendar" | "email") => Promise<void> | void;
  onSendDraft: (draftId: string) => Promise<void> | void;
}

function impactBadge(impact: ActionCardViewModel["impact"]): { label: string; bg: string } {
  if (impact === "high") return { label: "High impact", bg: "bg-[var(--pm-red-light)] text-[var(--pm-red)]" };
  if (impact === "medium") return { label: "Medium", bg: "bg-[var(--pm-orange-light)] text-[#b87900]" };
  return { label: "Low", bg: "bg-[#e6f0ff] text-[var(--pm-blue)]" };
}

function ConnectorRow({ label, connected, onConnect }: { label: string; connected: boolean; onConnect: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`pm-dot ${connected ? "pm-dot-connected" : "pm-dot-disconnected"}`} />
        <span className="text-[13px] text-[var(--pm-text)]">{label}</span>
      </div>
      <button type="button" onClick={onConnect} className="text-[12px] text-[var(--pm-blue)] hover:underline font-medium">
        {connected ? "Reconnect" : "Connect"}
      </button>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RightPanel({
  completionRate,
  avgRiskScore,
  blockedCount,
  outcomes,
  actionCards,
  activityItems,
  emailDrafts,
  actionBusyId,
  correctionBusyId,
  draftBusyId,
  connectors,
  onActionDecision,
  onActionCorrect,
  onConnectorInstall,
  onSendDraft,
}: RightPanelProps) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, completionRate));
  const offset = circumference - (normalized / 100) * circumference;

  const riskColor = avgRiskScore >= 70 ? "var(--pm-red)" : avgRiskScore >= 35 ? "var(--pm-orange)" : "var(--pm-green)";
  const riskLabel = avgRiskScore >= 70 ? "High" : avgRiskScore >= 35 ? "Medium" : "Low";

  return (
    <aside className="space-y-3 p-3">
      {/* Health & Outcomes */}
      <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)] mb-3">Health & Outcomes</h3>

        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <svg width="76" height="76" viewBox="0 0 76 76">
              <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--pm-gray-light)" strokeWidth="6" />
              <circle
                cx="38" cy="38" r={radius}
                fill="none"
                stroke="var(--pm-blue)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform="rotate(-90 38 38)"
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-[var(--pm-text)]">
              {normalized.toFixed(0)}%
            </span>
          </div>

          <div className="space-y-1.5 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--pm-text-secondary)]">Risk</span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: riskColor + "18", color: riskColor }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: riskColor }} />
                {riskLabel} ({avgRiskScore.toFixed(0)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--pm-text-secondary)]">Blocked</span>
              <span className="font-semibold text-[var(--pm-text)]">{blockedCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--pm-text-secondary)]">Auto-exec</span>
              <span className="font-semibold text-[var(--pm-text)]">{outcomes?.metrics?.autoExecutedActions ?? 0}</span>
            </div>
          </div>
        </div>

        {outcomes?.narrative && (
          <p className="mt-3 text-[13px] text-[var(--pm-text-secondary)] leading-relaxed border-t border-[var(--pm-border)] pt-3">
            {outcomes.narrative}
          </p>
        )}
      </section>

      {/* Connectors */}
      <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)] mb-2">Connections</h3>
        <ConnectorRow label="Slack" connected={Boolean(connectors.slack?.connected)} onConnect={() => void onConnectorInstall("slack")} />
        <ConnectorRow label="Google Calendar" connected={Boolean(connectors.calendar?.connected)} onConnect={() => void onConnectorInstall("calendar")} />
        <ConnectorRow label="Email" connected={Boolean(connectors.email?.connected)} onConnect={() => void onConnectorInstall("email")} />
      </section>

      {/* Action Center */}
      <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">Action Center</h3>
          {actionCards.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pm-blue)] text-[10px] font-bold text-white px-1.5">
              {actionCards.length}
            </span>
          )}
        </div>
        <p className="mb-3 text-[11px] leading-snug text-[var(--pm-text-muted)]">
          Prepared for your approval: deadline, scope, ownership, or external impact—review signals, then approve or correct.
        </p>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {actionCards.map((action) => {
            const badge = impactBadge(action.impact);
            return (
              <article key={action.id} className={`rounded-lg border border-[#e6e9ef] p-3 transition-shadow hover:shadow-sm ${
                action.impact === "high" ? "border-l-4 border-l-[#E2445C]" :
                action.impact === "medium" ? "border-l-4 border-l-[#FDAB3D]" :
                "border-l-4 border-l-[#0073EA]"
              }`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span className="text-[13px] font-semibold text-[var(--pm-text)] capitalize">{action.title.replace(/_/g, " ")}</span>
                    <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.bg}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-[var(--pm-text-secondary)] mb-1">{action.reason}</p>
                <p className="text-[11px] text-[var(--pm-text-muted)]">Confidence {action.confidence} · {action.threshold}</p>
                <div className="flex gap-1.5 mt-2.5">
                  <button
                    type="button"
                    disabled={actionBusyId === action.id}
                    onClick={() => void onActionDecision(action.id, "approve")}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#00C875] px-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === action.id}
                    onClick={() => void onActionDecision(action.id, "reject")}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#E2445C] px-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    <X size={13} /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={correctionBusyId === action.id}
                    onClick={() => void onActionCorrect(action.id)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[#e6e9ef] bg-white px-2.5 text-[12px] font-semibold text-[#323338] disabled:opacity-50"
                  >
                    <RefreshCw size={13} /> Correct
                  </button>
                </div>
              </article>
            );
          })}
          {actionCards.length === 0 && (
            <div className="flex flex-col items-center py-4 text-[var(--pm-text-muted)]">
              <ShieldCheck size={24} className="mb-1.5 opacity-40" />
              <p className="text-[13px]">No pending approvals</p>
            </div>
          )}
        </div>
      </section>

      {/* Email Drafts */}
      {emailDrafts.length > 0 && (
        <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)] mb-2">Email Drafts</h3>
          <div className="space-y-2 max-h-[180px] overflow-y-auto">
            {emailDrafts.map(draft => (
              <div key={draft.id} className="rounded-lg border border-[var(--pm-border)] p-3">
                <p className="text-[13px] font-medium text-[var(--pm-text)]">{draft.subject}</p>
                <p className="text-[12px] text-[var(--pm-text-muted)] mt-0.5">To: {draft.recipient}</p>
                <button
                  type="button"
                  disabled={draftBusyId === draft.id}
                  onClick={() => void onSendDraft(draft.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0073EA] px-2.5 text-[12px] font-semibold text-white disabled:opacity-50 mt-2"
                >
                  <Send size={12} /> Send
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity Feed */}
      <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)] mb-2">Activity</h3>
        <div className="space-y-0 max-h-[200px] overflow-y-auto">
          {activityItems.map(item => (
            <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-[#f0f1f3] last:border-0">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--pm-gray-light)]">
                <Clock size={12} className="text-[var(--pm-text-muted)]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-[var(--pm-text)]">{item.title}</p>
                {item.subtitle && <p className="text-[12px] text-[var(--pm-text-muted)]">{item.subtitle}</p>}
                <p className="text-[11px] text-[var(--pm-text-muted)] mt-0.5">
                  {item.source ?? "system"} · {timeAgo(item.createdAt)}
                </p>
              </div>
            </div>
          ))}
          {activityItems.length === 0 && (
            <p className="text-[13px] text-[var(--pm-text-muted)] text-center py-3">No recent activity</p>
          )}
        </div>
      </section>
    </aside>
  );
}
