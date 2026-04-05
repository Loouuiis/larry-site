"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, CheckCircle2, Circle, ExternalLink, Mail, MessageSquare, Zap } from "lucide-react";
import { SettingsSubnav } from "../SettingsSubnav";

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
  outlookCalendar?: ConnectorStatus;
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

const CONNECTOR_ICONS: Record<string, ReactNode> = {
  slack: <MessageSquare size={20} />,
  calendar: <Calendar size={20} />,
  outlookCalendar: <Calendar size={20} />,
  email: <Mail size={20} />,
};

const CONNECTOR_INFO = {
  slack: {
    label: "Slack",
    icon: "slack",
    description:
      "Larry reads messages from linked channels to detect project signals, suggests Slack messages when risks or blockers are found, and can DM task owners directly.",
    color: "#6c44f6",
  },
  calendar: {
    label: "Google Calendar",
    icon: "calendar",
    description:
      "Larry detects upcoming meetings and offers to transcribe them, links calendar events to projects, and can create meeting invites (pending your approval in Action Center).",
    color: "#6c44f6",
  },
  outlookCalendar: {
    label: "Outlook Calendar",
    icon: "outlookCalendar",
    description:
      "Larry connects to Microsoft 365 calendars so invites and updates can sync into project activity and action workflows.",
    color: "#6c44f6",
  },
  email: {
    label: "Email",
    icon: "email",
    description:
      "Larry drafts follow-up emails after meetings and weekly status reports. All drafts appear in Action Center for your review before sending.",
    color: "#6c44f6",
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

interface SlackChannel { id: string; name: string; }
interface SlackMapping { slackChannelId: string; slackChannelName: string | null; projectId: string; }

export function ConnectorsPage() {
  const [data, setData] = useState<ConnectorsData>({});
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [calendarLinkedProjectId, setCalendarLinkedProjectId] = useState<string>("");
  const [calendarLinkSaving, setCalendarLinkSaving] = useState(false);
  const [calendarLinkMessage, setCalendarLinkMessage] = useState<string | null>(null);
  const [calendarLinkError, setCalendarLinkError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Slack channel mapping state
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackMappings, setSlackMappings] = useState<SlackMapping[]>([]);
  const [slackMappingChannelId, setSlackMappingChannelId] = useState("");
  const [slackMappingProjectId, setSlackMappingProjectId] = useState("");
  const [slackMappingSaving, setSlackMappingSaving] = useState(false);
  const [slackMappingMessage, setSlackMappingMessage] = useState<string | null>(null);
  const [slackMappingError, setSlackMappingError] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // If this page loaded inside an OAuth popup, notify parent and close.
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (!connected) return;
    if (typeof window !== "undefined" && window.opener) {
      window.opener.postMessage({ type: "oauth_connected", connector: connected }, window.location.origin);
      window.close();
    }
  }, [searchParams]);

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

      const connectors = summaryData.connectors ?? {};
      setData(connectors);
      setProjects(projectsRes.ok ? projectsData.items ?? [] : []);
      if (projectLinkRes.ok) {
        setCalendarLinkedProjectId(projectLinkData.projectId ?? "");
      } else {
        setCalendarLinkedProjectId(connectors.calendar?.projectId ?? "");
      }

      // Load Slack channel data if Slack is connected
      if (connectors.slack?.connected) {
        const [channelsRes, mappingsRes] = await Promise.all([
          fetch("/api/workspace/connectors/slack/channels"),
          fetch("/api/workspace/connectors/slack/channel-mapping"),
        ]);
        if (channelsRes.ok) {
          const channelsData = await readJson<{ channels?: SlackChannel[] }>(channelsRes);
          setSlackChannels(channelsData.channels ?? []);
        }
        if (mappingsRes.ok) {
          const mappingsData = await readJson<{ mappings?: SlackMapping[] }>(mappingsRes);
          setSlackMappings(mappingsData.mappings ?? []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Listen for OAuth popup completion.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "oauth_connected") {
        void load();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  const openOAuthPopup = (url: string) => {
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(url, "larry_oauth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);
  };

  const handleConnect = (connector: keyof typeof CONNECTOR_INFO) => {
    const info = data[connector];
    if (info?.installUrl) {
      openOAuthPopup(info.installUrl);
    } else {
      void fetch(`/api/workspace/connectors/${connector}/install`).then(async (res) => {
        const d = await readJson<{ installUrl?: string }>(res);
        if (d.installUrl) openOAuthPopup(d.installUrl);
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

  const handleSaveSlackChannelMapping = async () => {
    if (!slackMappingChannelId || !slackMappingProjectId) return;
    setSlackMappingSaving(true);
    setSlackMappingMessage(null);
    setSlackMappingError(null);
    try {
      const channel = slackChannels.find((c) => c.id === slackMappingChannelId);
      const response = await fetch("/api/workspace/connectors/slack/channel-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slackChannelId: slackMappingChannelId,
          slackChannelName: channel?.name ?? null,
          projectId: slackMappingProjectId || null,
        }),
      });
      if (!response.ok) {
        const err = await readJson<{ error?: string }>(response);
        setSlackMappingError(err.error ?? "Failed to save mapping.");
        return;
      }
      // Refresh mappings
      const mappingsRes = await fetch("/api/workspace/connectors/slack/channel-mapping");
      if (mappingsRes.ok) {
        const mappingsData = await readJson<{ mappings?: SlackMapping[] }>(mappingsRes);
        setSlackMappings(mappingsData.mappings ?? []);
      }
      setSlackMappingChannelId("");
      setSlackMappingProjectId("");
      setSlackMappingMessage("Channel linked to project.");
    } catch (error) {
      setSlackMappingError(error instanceof Error ? error.message : "Failed to save mapping.");
    } finally {
      setSlackMappingSaving(false);
    }
  };

  const handleRemoveSlackMapping = async (slackChannelId: string) => {
    try {
      await fetch("/api/workspace/connectors/slack/channel-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackChannelId, projectId: null }),
      });
      setSlackMappings((prev) => prev.filter((m) => m.slackChannelId !== slackChannelId));
    } catch {
      // ignore
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
        <SettingsSubnav active="connectors" />
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
                      <span style={{ color: info.color, display: "flex", alignItems: "center" }}>{CONNECTOR_ICONS[key]}</span>
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

                  {key === "slack" && connected && (
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
                        style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-1)" }}
                      >
                        Link a Slack channel to a project
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <select
                          value={slackMappingChannelId}
                          onChange={(e) => { setSlackMappingChannelId(e.target.value); setSlackMappingMessage(null); setSlackMappingError(null); }}
                          disabled={loading || slackMappingSaving || slackChannels.length === 0}
                          style={{
                            minWidth: "160px",
                            maxWidth: "220px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            padding: "8px 10px",
                            fontSize: "12px",
                            color: "var(--text-1)",
                          }}
                        >
                          <option value="">Select channel…</option>
                          {slackChannels.map((c) => (
                            <option key={c.id} value={c.id}>#{c.name}</option>
                          ))}
                        </select>
                        <select
                          value={slackMappingProjectId}
                          onChange={(e) => { setSlackMappingProjectId(e.target.value); setSlackMappingMessage(null); setSlackMappingError(null); }}
                          disabled={loading || slackMappingSaving || projects.length === 0}
                          style={{
                            minWidth: "160px",
                            maxWidth: "220px",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            padding: "8px 10px",
                            fontSize: "12px",
                            color: "var(--text-1)",
                          }}
                        >
                          <option value="">Select project…</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="pm-btn pm-btn-secondary pm-btn-sm"
                          disabled={!slackMappingChannelId || !slackMappingProjectId || slackMappingSaving}
                          onClick={() => void handleSaveSlackChannelMapping()}
                        >
                          {slackMappingSaving ? "Saving…" : "Save link"}
                        </button>
                      </div>
                      {slackChannels.length === 0 && (
                        <p className="text-body-sm">No channels found. Make sure the bot has been added to at least one channel.</p>
                      )}
                      {slackMappingMessage && (
                        <p className="text-body-sm" style={{ color: "#166534" }}>{slackMappingMessage}</p>
                      )}
                      {slackMappingError && (
                        <p className="text-body-sm" style={{ color: "#b91c1c" }}>{slackMappingError}</p>
                      )}
                      {slackMappings.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                          <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                            Linked channels
                          </p>
                          {slackMappings.map((m) => {
                            const proj = projects.find((p) => p.id === m.projectId);
                            return (
                              <div
                                key={m.slackChannelId}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "var(--text-1)" }}
                              >
                                <span>
                                  <span style={{ fontWeight: 500 }}>#{m.slackChannelName ?? m.slackChannelId}</span>
                                  {" → "}
                                  <span>{proj?.name ?? m.projectId}</span>
                                </span>
                                <button
                                  type="button"
                                  className="pm-btn pm-btn-secondary pm-btn-sm"
                                  style={{ fontSize: "11px", padding: "2px 8px" }}
                                  onClick={() => void handleRemoveSlackMapping(m.slackChannelId)}
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

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
