"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Zap } from "lucide-react";

interface ConnectorStatus {
  connected?: boolean;
  installUrl?: string;
  lastEventAt?: string | null;
  recentEvents?: Array<{ id: string; title: string; source: string; createdAt: string }>;
}

interface ConnectorsData {
  slack?: ConnectorStatus;
  calendar?: ConnectorStatus;
  email?: ConnectorStatus;
}

const CONNECTOR_INFO = {
  slack: {
    label: "Slack",
    icon: "💬",
    description:
      "Larry monitors project-related channels, sends DM reminders to task owners, posts daily standup summaries, and escalates blocked tasks to manager channels.",
    color: "#4A154B",
  },
  calendar: {
    label: "Google Calendar",
    icon: "📅",
    description:
      "Larry detects upcoming meetings and offers to transcribe them, links calendar events to projects, and can create meeting invites (pending your approval in Action Center).",
    color: "#0073EA",
  },
  email: {
    label: "Email",
    icon: "✉️",
    description:
      "Larry drafts follow-up emails after meetings and weekly status reports. All drafts appear in Action Center for your review before sending.",
    color: "#00C875",
  },
} as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

export function ConnectorsPage() {
  const [data, setData] = useState<ConnectorsData>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/connectors/summary");
      const d = await readJson<{ connectors: ConnectorsData }>(res);
      setData(d.connectors ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleConnect = (connector: keyof typeof CONNECTOR_INFO) => {
    const info = data[connector];
    if (info?.installUrl) {
      window.location.href = info.installUrl;
    } else {
      // Trigger install flow via existing connector API
      void fetch(`/api/workspace/connectors/${connector}/install`).then(async (res) => {
        const d = await readJson<{ installUrl?: string }>(res);
        if (d.installUrl) window.location.href = d.installUrl;
      });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-[var(--pm-border)] bg-[var(--pm-surface)] px-8 py-6">
        <h1 className="text-[22px] font-semibold text-[var(--pm-text)]">Connectors</h1>
        <p className="mt-1 text-[14px] text-[var(--pm-text-secondary)]">
          Connect your tools so Larry can read signals and take action across your stack.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-8 py-6 space-y-4">
        {(Object.keys(CONNECTOR_INFO) as Array<keyof typeof CONNECTOR_INFO>).map((key) => {
          const info = CONNECTOR_INFO[key];
          const status = data[key];
          const connected = Boolean(status?.connected);

          return (
            <div key={key} className="rounded-xl border border-[var(--pm-border)] bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-semibold text-[var(--pm-text)]">{info.label}</h3>
                      {connected ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f9f0] px-2 py-0.5 text-[11px] font-semibold text-[#00854d]">
                          <CheckCircle2 size={11} /> Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f1f5] px-2 py-0.5 text-[11px] font-semibold text-[#9699a8]">
                          <Circle size={11} /> Not connected
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-[var(--pm-text-secondary)] max-w-lg leading-relaxed">
                      {info.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleConnect(key)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium transition ${
                    connected
                      ? "border border-[var(--pm-border)] bg-white text-[var(--pm-text-secondary)] hover:bg-[var(--pm-gray-light)]"
                      : "bg-[#6366f1] text-white hover:bg-[#4f46e5]"
                  }`}
                >
                  {connected ? (
                    <><ExternalLink size={13} /> Reconnect</>
                  ) : (
                    <><Zap size={13} /> Connect</>
                  )}
                </button>
              </div>

              {/* Recent events */}
              {status?.recentEvents && status.recentEvents.length > 0 && (
                <div className="mt-4 border-t border-[var(--pm-border)] pt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--pm-text-muted)]">
                    Recent signals
                  </p>
                  <div className="space-y-1">
                    {status.recentEvents.slice(0, 3).map((ev) => (
                      <div key={ev.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-[var(--pm-text-secondary)] truncate max-w-[280px]">{ev.title}</span>
                        <span className="text-[var(--pm-text-muted)] shrink-0 ml-2">{timeAgo(ev.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connected && !status?.recentEvents?.length && (
                <p className="mt-4 border-t border-[var(--pm-border)] pt-3 text-[12px] text-[var(--pm-text-muted)]">
                  No recent events from this connector yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
