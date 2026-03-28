"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { ConnectorStatus, EmailDraft, WorkspaceActivityItem, WorkspaceOutcomes } from "./types";

interface RightPanelProps {
  completionRate: number;
  avgRiskScore: number;
  blockedCount: number;
  outcomes: WorkspaceOutcomes | null | undefined;
  actionCards: { id: string; title: string; reason: string }[];
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

      {/* Action Center summary → link to full page */}
      <section className="rounded-xl border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">Action Center</h3>
          {actionCards.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--pm-blue)] text-[10px] font-bold text-white px-1.5">
              {actionCards.length}
            </span>
          )}
        </div>
        {actionCards.length > 0 ? (
          <p className="text-[13px] text-[var(--pm-text-secondary)] mb-3">
            {actionCards.length} action{actionCards.length !== 1 ? "s" : ""} awaiting your review.
          </p>
        ) : (
          <p className="text-[13px] text-[var(--pm-text-muted)] mb-3">No pending approvals.</p>
        )}
        <Link
          href="/workspace"
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--pm-border)] bg-white text-[13px] font-medium text-[var(--pm-text-secondary)] hover:bg-[var(--pm-gray-light)]"
        >
          Open Workspace →
        </Link>
      </section>

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
