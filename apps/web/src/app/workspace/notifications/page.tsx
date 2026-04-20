"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@larry/shared";
import { getTimezone } from "@/lib/timezone-context";

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<string, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

function formatRelativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: getTimezone(),
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const { items, markRead, dismiss } = useNotifications();
  const visible = useMemo(() => items.filter((n) => !n.dismissedAt), [items]);
  const unreadCount = visible.filter((n) => !n.readAt).length;

  const onRowClick = async (n: Notification) => {
    await markRead([n.id]);
    router.push(n.deepLink);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
      <div className="mx-auto max-w-[960px] space-y-6 px-6 py-8">
        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "24px",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: "#f5f3ff" }}
              >
                <Bell size={20} style={{ color: "#6c44f6" }} />
              </div>
              <div>
                <h1
                  className="text-[24px] font-semibold tracking-[-0.03em]"
                  style={{ color: "var(--text-1)" }}
                >
                  Notifications
                </h1>
                <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                  Every notification from Larry, across your projects.
                  {unreadCount > 0 && (
                    <span style={{ color: "#6c44f6", fontWeight: 600 }}>
                      {" "}
                      {unreadCount} unread
                    </span>
                  )}
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead("all")}
                className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                <Check size={13} />
                Mark all read
              </button>
            )}
          </div>
        </section>

        <section
          style={{
            borderRadius: "var(--radius-card)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          {visible.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bell
                size={24}
                style={{ margin: "0 auto 12px", color: "var(--text-disabled)" }}
              />
              <p className="text-[14px] font-medium" style={{ color: "var(--text-1)" }}>
                You&apos;re all caught up
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                Notifications from tasks, emails, invites, and Larry actions will
                appear here.
              </p>
            </div>
          ) : (
            <div>
              {visible.map((n, i) => {
                const isRead = !!n.readAt;
                return (
                  <div
                    key={n.id}
                    onClick={() => void onRowClick(n)}
                    className="flex items-start gap-3 px-5 py-4 transition-colors"
                    style={{
                      borderBottom:
                        i < visible.length - 1 ? "1px solid var(--border)" : undefined,
                      background: isRead
                        ? "transparent"
                        : "rgba(108, 68, 246, 0.03)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex h-6 w-3 shrink-0 items-center justify-center">
                      {!isRead && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: SEVERITY_DOT[n.severity] ?? "#6b7280",
                          }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[13px]"
                        style={{
                          fontWeight: isRead ? 500 : 600,
                          color: "var(--text-1)",
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          className="mt-0.5 text-[12px] leading-5"
                          style={{ color: "var(--text-2)" }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div
                        className="mt-1 text-[11px]"
                        style={{ color: "var(--text-disabled)" }}
                      >
                        {formatRelativeTime(n.createdAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        void dismiss([n.id]);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: 18,
                        lineHeight: 1,
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      ×
                    </button>
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
