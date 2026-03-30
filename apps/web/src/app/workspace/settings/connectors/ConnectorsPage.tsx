"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Zap } from "lucide-react";

interface ConnectorStatus {
  connected?: boolean;
  projectId?: string | null;
  installUrl?: string;
  lastEventAt?: string | null;
  recentEvents?: Array<{ id: string; title: string; source: string; createdAt: string }>;
}

interface ConnectorsData {
  slack?: ConnectorStatus;
  calendar?: ConnectorStatus;
  email?: ConnectorStatus;
}

interface WorkspaceProject {
  id: string;
  name: string;
}

interface CalendarProjectLinkResponse {
  calendarId?: string;
  projectId?: string | null;
  linked?: boolean;
  error?: string;
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
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [calendarLinkedProjectId, setCalendarLinkedProjectId] = useState<string>("");
  const [calendarLinkSaving, setCalendarLinkSaving] = useState(false);
  const [calendarLinkMessage, setCalendarLinkMessage] = useState<string | null>(null);
  const [calendarLinkError, setCalendarLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setCalendarLinkMessage(null);
    setCalendarLinkError(null);
    try {
      const [summaryRes, projectsRes, projectLinkRes] = await Promise.all([
        fetch("/api/workspace/connectors/summary"),
        fetch("/api/workspace/projects"),
        fetch("/api/workspace/connectors/calendar/project-link?calendarId=primary"),
      ]);
      const summaryData = await readJson<{ connectors: ConnectorsData }>(summaryRes);
      const projectsData = await readJson<{ items?: WorkspaceProject[] }>(projectsRes);
      const projectLinkData = await readJson<CalendarProjectLinkResponse>(projectLinkRes);

      setData(summaryData.connectors ?? {});
      setProjects(projectsRes.ok ? projectsData.items ?? [] : []);
      if (projectLinkRes.ok) {
        setCalendarLinkedProjectId(projectLinkData.projectId ?? "");
      } else {
        setCalendarLinkedProjectId(summaryData.connectors?.calendar?.projectId ?? "");
      }
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

  const handleSaveCalendarProjectLink = async () => {
    setCalendarLinkSaving(true);
    setCalendarLinkMessage(null);
    setCalendarLinkError(null);
    try {
      const response = await fetch("/api/workspace/connectors/calendar/project-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: "primary",
          projectId: calendarLinkedProjectId || null,
        }),
      });
      const payload = await readJson<CalendarProjectLinkResponse>(response);
      if (!response.ok) {
        setCalendarLinkError(payload.error ?? "Failed to update calendar project link.");
        return;
      }
      setCalendarLinkedProjectId(payload.projectId ?? "");
      setCalendarLinkMessage(
        payload.projectId
          ? "Calendar is now linked to the selected project."
          : "Calendar project link cleared."
      );
    } catch (error) {
      setCalendarLinkError(
        error instanceof Error ? error.message : "Failed to update calendar project link."
      );
    } finally {
      setCalendarLinkSaving(false);
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

                  {key === "calendar" && (
                    <div
                      style={{
                        marginTop: "14px",
                        borderTop: "1px solid var(--border)",
                        paddingTop: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <label
                        htmlFor="calendar-project-link"
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text-1)",
                        }}
                      >
                        Linked project for calendar signals
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <select
                          id="calendar-project-link"
                          value={calendarLinkedProjectId}
                          onChange={(event) => {
                            setCalendarLinkedProjectId(event.target.value);
                            setCalendarLinkMessage(null);
                            setCalendarLinkError(null);
                          }}
                          disabled={!connected || loading || calendarLinkSaving || projects.length === 0}
                          style={{
                            minWidth: "220px",
                            maxWidth: "320px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            padding: "8px 10px",
                            fontSize: "12px",
                            color: "var(--text-1)",
                          }}
                        >
                          <option value="">Not linked (ingest hints only)</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="pm-btn pm-btn-secondary pm-btn-sm"
                          disabled={!connected || loading || calendarLinkSaving}
                          onClick={() => void handleSaveCalendarProjectLink()}
                        >
                          {calendarLinkSaving ? "Saving..." : "Save link"}
                        </button>
                      </div>
                      {projects.length === 0 && (
                        <p className="text-body-sm">
                          No projects found yet. Create a project to enable calendar linking.
                        </p>
                      )}
                      {calendarLinkMessage && (
                        <p className="text-body-sm" style={{ color: "#166534" }}>
                          {calendarLinkMessage}
                        </p>
                      )}
                      {calendarLinkError && (
                        <p className="text-body-sm" style={{ color: "#b91c1c" }}>
                          {calendarLinkError}
                        </p>
                      )}
                    </div>
                  )}

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
