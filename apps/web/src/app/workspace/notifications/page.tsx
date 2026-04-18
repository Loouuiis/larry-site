"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, RefreshCw, Search } from "lucide-react";
import { getTimezone } from "@/lib/timezone-context";

export const dynamic = "force-dynamic";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  source: string;
  createdAt: string;
  readAt: string | null;
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return "Just now";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: getTimezone() });
}

function getNotificationIcon(source: string) {
  switch (source) {
    case "email":
      return { bg: "#eff6ff", color: "#1d4ed8" };
    case "slack":
      return { bg: "#ecfdf3", color: "#15803d" };
    case "calendar":
      return { bg: "#fff7ed", color: "#c2410c" };
    case "larry":
    default:
      return { bg: "#f5f3ff", color: "#6c44f6" };
  }
}

function formatSource(source: string): string {
  return source.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SELECT_STYLE: React.CSSProperties = {
  height: "36px",
  padding: "0 10px",
  borderRadius: "var(--radius-btn, 8px)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontSize: "13px",
  cursor: "pointer",
  outline: "none",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterUnread, setFilterUnread] = useState("all");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/notifications?unread=false&limit=100", { cache: "no-store" });
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/workspace/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch { /* silent */ }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.readAt);
    await Promise.allSettled(
      unread.map((n) => fetch(`/api/workspace/notifications/${n.id}/read`, { method: "POST" }))
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }, [notifications]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of notifications) {
      if (n.source) set.add(n.source);
    }
    return Array.from(set).sort();
  }, [notifications]);

  const filtered = useMemo(() => {
    let result = notifications;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.body ?? "").toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q)
      );
    }
    if (filterProjectId) {
      result = result.filter((n) => n.source === filterProjectId);
    }
    if (filterUnread === "unread") {
      result = result.filter((n) => !n.readAt);
    } else if (filterUnread === "read") {
      result = result.filter((n) => !!n.readAt);
    }
    return result;
  }, [notifications, search, filterProjectId, filterUnread]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[960px] space-y-6 px-6 py-8">
        {/* Header */}
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "24px",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "#f5f3ff" }}
                >
                  <Bell size={20} style={{ color: "#6c44f6" }} />
                </div>
                <div>
                  <h1 className="text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--text-1)" }}>
                    Notifications
                  </h1>
                  <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                    All notifications from across your projects.
                    {unreadCount > 0 && (
                      <span style={{ color: "#6c44f6", fontWeight: 600 }}> {unreadCount} unread</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold"
                  style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                >
                  <Check size={13} />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "36px",
                padding: "0 10px",
                borderRadius: "var(--radius-btn, 8px)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                flex: "1 1 200px",
                maxWidth: "340px",
              }}
            >
              <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                placeholder="Search notifications..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: "13px",
                  color: "var(--text-1)",
                }}
              />
            </div>

            {sourceOptions.length > 1 && (
              <select
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
                style={SELECT_STYLE}
              >
                <option value="">All sources</option>
                {sourceOptions.map((src) => (
                  <option key={src} value={src}>{formatSource(src)}</option>
                ))}
              </select>
            )}

            <select
              value={filterUnread}
              onChange={(e) => setFilterUnread(e.target.value)}
              style={SELECT_STYLE}
            >
              <option value="all">All</option>
              <option value="unread">Unread only</option>
              <option value="read">Read only</option>
            </select>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div
            className="rounded-xl border px-4 py-3 text-[13px]"
            style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            {error}
          </div>
        )}

        {/* Notification list */}
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>Loading notifications...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bell size={24} style={{ margin: "0 auto 12px", color: "var(--text-disabled)" }} />
              <p className="text-[14px] font-medium" style={{ color: "var(--text-1)" }}>
                {notifications.length === 0 ? "No notifications yet" : "No notifications match your filters"}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                {notifications.length === 0
                  ? "Notifications from Larry actions, task updates, and team changes will appear here."
                  : "Try adjusting your search or filter criteria."}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((notif, i) => {
                const isRead = !!notif.readAt;
                const icon = getNotificationIcon(notif.source);
                return (
                  <div
                    key={notif.id}
                    className="flex items-start gap-3 px-5 py-4 transition-colors"
                    style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : undefined,
                      background: isRead ? "transparent" : "rgba(108, 68, 246, 0.03)",
                      cursor: isRead ? "default" : "pointer",
                    }}
                    onClick={() => {
                      if (!isRead) void markAsRead(notif.id);
                    }}
                  >
                    {/* Unread dot */}
                    <div className="flex h-6 w-3 shrink-0 items-center justify-center">
                      {!isRead && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#6c44f6",
                          }}
                        />
                      )}
                    </div>

                    {/* Icon */}
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: icon.bg }}
                    >
                      <Bell size={16} style={{ color: icon.color }} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className="text-[13px] truncate"
                          style={{ fontWeight: isRead ? 500 : 600, color: "var(--text-1)" }}
                        >
                          {notif.title}
                        </p>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: icon.bg, color: icon.color }}>
                          {formatSource(notif.source)}
                        </span>
                      </div>
                      {notif.body && (
                        <p className="mt-0.5 text-[12px] leading-5" style={{ color: "var(--text-2)" }}>
                          {notif.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-[11px]" style={{ color: "var(--text-disabled)" }}>
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
