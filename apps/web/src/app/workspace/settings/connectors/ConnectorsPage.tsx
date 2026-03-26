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
      void fetch(`/api/workspace/connectors/${connector}/install`).then(async (res) => {
        const d = await readJson<{ installUrl?: string }>(res);
        if (d.installUrl) window.location.href = d.installUrl;
      });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Page header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "20px 32px",
        }}
      >
        <h1 className="text-h1">Settings</h1>
        <p className="text-body-sm" style={{ marginTop: "4px" }}>
          Manage your workspace preferences and integrations.
        </p>
      </div>

      <div
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Workspace Settings section */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            background: "var(--surface)",
          }}
        >
          <h2 className="text-h2">Workspace Settings</h2>
          <p className="text-body-sm" style={{ marginTop: "4px" }}>
            Configure your workspace preferences.
          </p>
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Workspace name */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                  Workspace name
                </p>
                <p className="text-body-sm">Larry Workspace</p>
              </div>
              <button className="pm-btn pm-btn-secondary pm-btn-sm">Edit</button>
            </div>

            {/* Timezone */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                  Timezone
                </p>
                <p className="text-body-sm">UTC (default)</p>
              </div>
              <button className="pm-btn pm-btn-secondary pm-btn-sm">Change</button>
            </div>

            {/* Notification preferences */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: "var(--surface)",
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)" }}>
                  Notification preferences
                </p>
                <p className="text-body-sm">Email notifications for approvals</p>
              </div>
              <button className="pm-btn pm-btn-secondary pm-btn-sm">Configure</button>
            </div>
          </div>
        </section>

        {/* Connectors section */}
        <section>
          <h2 className="text-h2" style={{ marginBottom: "4px" }}>Connectors</h2>
          <p className="text-body-sm" style={{ marginBottom: "16px" }}>
            Connect your tools so Larry can read signals and take action across your stack.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {(Object.keys(CONNECTOR_INFO) as Array<keyof typeof CONNECTOR_INFO>).map((key) => {
              const info = CONNECTOR_INFO[key];
              const status = data[key];
              const connected = Boolean(status?.connected);

              return (
                <div
                  key={key}
                  style={{
                    borderRadius: "var(--radius-card)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    padding: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <span style={{ fontSize: "22px", lineHeight: 1 }}>{info.icon}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h3 className="text-h2">{info.label}</h3>
                          {connected ? (
                            <span
                              className="pm-pill"
                              style={{ background: "#e6f9f0", color: "#00854d", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <CheckCircle2 size={10} /> Connected
                            </span>
                          ) : (
                            <span
                              className="pm-pill"
                              style={{ background: "var(--surface-2)", color: "var(--text-disabled)", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Circle size={10} /> Not connected
                            </span>
                          )}
                        </div>
                        <p className="text-body-sm" style={{ marginTop: "4px", maxWidth: "440px" }}>
                          {info.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConnect(key)}
                      className={`pm-btn pm-btn-sm ${connected ? "pm-btn-secondary" : "pm-btn-primary"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
                    >
                      {connected ? (
                        <><ExternalLink size={12} /> Reconnect</>
                      ) : (
                        <><Zap size={12} /> Connect</>
                      )}
                    </button>
                  </div>

                  {/* Recent events */}
                  {status?.recentEvents && status.recentEvents.length > 0 && (
                    <div
                      style={{
                        marginTop: "14px",
                        borderTop: "1px solid var(--border)",
                        paddingTop: "14px",
                      }}
                    >
                      <p
                        style={{
                          marginBottom: "8px",
                          fontSize: "11px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: "var(--text-muted)",
                        }}
                      >
                        Recent signals
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {status.recentEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}
                          >
                            <span
                              className="text-body-sm"
                              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}
                            >
                              {ev.title}
                            </span>
                            <span style={{ flexShrink: 0, marginLeft: "8px", fontSize: "11px", color: "var(--text-disabled)" }}>
                              {timeAgo(ev.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {connected && !status?.recentEvents?.length && (
                    <p
                      style={{
                        marginTop: "14px",
                        borderTop: "1px solid var(--border)",
                        paddingTop: "12px",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      No recent events from this connector yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
