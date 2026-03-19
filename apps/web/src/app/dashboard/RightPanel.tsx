"use client";

import { Check, Mail, RefreshCw, Send, ShieldAlert, X } from "lucide-react";
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

function impactClass(impact: ActionCardViewModel["impact"]): string {
  if (impact === "high") return "border-l-[#E2445C]";
  if (impact === "medium") return "border-l-[#FDAB3D]";
  return "border-l-[#00C875]";
}

function ConnectorRow({
  label,
  connected,
  onConnect,
}: {
  label: string;
  connected: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-[#00C875]" : "bg-slate-300"}`} />
        <span className="text-xs text-slate-700">{label}</span>
      </div>
      <button
        type="button"
        onClick={onConnect}
        className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
      >
        {connected ? "Reconnect" : "Connect"}
      </button>
    </div>
  );
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
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const normalized = Math.max(0, Math.min(100, completionRate));
  const progress = circumference - (normalized / 100) * circumference;

  return (
    <aside className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health & Outcomes</p>
        <div className="mt-3 flex items-center gap-3">
          <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
            <circle cx="36" cy="36" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
            <circle
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              stroke="#0073EA"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              transform="rotate(-90 36 36)"
            />
            <text x="36" y="40" textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">
              {normalized.toFixed(0)}%
            </text>
          </svg>
          <div className="text-sm text-slate-700">
            <p>Avg risk: <span className="font-semibold">{avgRiskScore.toFixed(1)}</span></p>
            <p>Blocked: <span className="font-semibold">{blockedCount}</span></p>
            <p>Auto-executed: <span className="font-semibold">{outcomes?.metrics?.autoExecutedActions ?? 0}</span></p>
          </div>
        </div>
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          {outcomes?.narrative ?? "Larry will generate investor-ready outcome narrative as execution data grows."}
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Connections</p>
        <div className="space-y-1.5">
          <ConnectorRow
            label="Slack"
            connected={Boolean(connectors.slack?.connected)}
            onConnect={() => void onConnectorInstall("slack")}
          />
          <ConnectorRow
            label="Calendar"
            connected={Boolean(connectors.calendar?.connected)}
            onConnect={() => void onConnectorInstall("calendar")}
          />
          <ConnectorRow
            label="Email"
            connected={Boolean(connectors.email?.connected)}
            onConnect={() => void onConnectorInstall("email")}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Center</p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{actionCards.length}</span>
        </div>
        <div className="max-h-[280px] space-y-2 overflow-y-auto">
          {actionCards.map((action) => (
            <article
              key={action.id}
              className={`rounded-md border border-slate-200 border-l-4 bg-slate-50 p-2.5 ${impactClass(action.impact)}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{action.title}</p>
                <span className="text-[11px] text-slate-500">{action.impact}</span>
              </div>
              <p className="text-xs text-slate-800">{action.reason}</p>
              <p className="mt-1 text-[11px] text-slate-500">Confidence {action.confidence} • {action.threshold}</p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={actionBusyId === action.id}
                  onClick={() => void onActionDecision(action.id, "approve")}
                  className="inline-flex h-8 items-center gap-1 rounded bg-[#00C875] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  <Check size={12} />
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === action.id}
                  onClick={() => void onActionDecision(action.id, "reject")}
                  className="inline-flex h-8 items-center gap-1 rounded bg-[#E2445C] px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  <X size={12} />
                  Reject
                </button>
                <button
                  type="button"
                  disabled={correctionBusyId === action.id}
                  onClick={() => void onActionCorrect(action.id)}
                  className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Correct
                </button>
              </div>
            </article>
          ))}
          {actionCards.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 p-2 text-xs text-slate-500">
              No pending approvals.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Email Drafts</p>
        <div className="max-h-[180px] space-y-2 overflow-y-auto">
          {emailDrafts.map((draft) => (
            <article key={draft.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-700">{draft.subject}</p>
              <p className="text-[11px] text-slate-500">To: {draft.recipient}</p>
              <button
                type="button"
                disabled={draftBusyId === draft.id}
                onClick={() => void onSendDraft(draft.id)}
                className="mt-1 inline-flex h-7 items-center gap-1 rounded bg-[#0073EA] px-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                <Send size={11} />
                Send
              </button>
            </article>
          ))}
          {emailDrafts.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 p-2 text-xs text-slate-500">
              No email drafts awaiting action.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
        <div className="max-h-[180px] space-y-2 overflow-y-auto">
          {activityItems.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-700">{item.title}</p>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{item.type}</span>
              </div>
              {item.subtitle && <p className="mt-0.5 text-slate-600">{item.subtitle}</p>}
              <p className="mt-1 text-[10px] text-slate-500">
                <Mail size={10} className="mr-1 inline" />
                {item.source ?? "system"} • {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {activityItems.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-300 p-2 text-xs text-slate-500">
              No recent activity yet.
            </p>
          )}
        </div>
      </section>
      <div className="hidden items-center gap-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700 lg:flex">
        <ShieldAlert size={13} />
        High-impact automation remains approval-gated.
      </div>
    </aside>
  );
}

