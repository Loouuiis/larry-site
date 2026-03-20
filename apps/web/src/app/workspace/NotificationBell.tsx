"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  body?: string | null;
  source?: string | null;
  createdAt: string;
  readAt?: string | null;
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

interface NotificationBellProps {
  count: number;
  onCountChange: (count: number) => void;
}

export function NotificationBell({ count, onCountChange }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/notifications?unread=true&limit=10");
      if (!res.ok) return;
      const data = await res.json() as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications ?? []);
      onCountChange(data.unreadCount ?? 0);
    } catch {
      // no-op
    }
  }, [onCountChange]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/workspace/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      onCountChange(Math.max(0, count - 1));
    } catch {
      // no-op
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void loadNotifications();
        }}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--pm-text-muted)] hover:bg-[var(--pm-gray-light)]"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[320px] rounded-xl border border-[var(--pm-border)] bg-white shadow-lg">
          <div className="border-b border-[var(--pm-border)] px-4 py-3">
            <h3 className="text-[13px] font-semibold text-[var(--pm-text)]">Notifications</h3>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[var(--pm-text-muted)]">
                No unread notifications
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 border-b border-[var(--pm-border)] px-4 py-3 last:border-0 hover:bg-[#f8f9fb]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--pm-text)]">{n.title}</p>
                    {n.body && <p className="text-[12px] text-[var(--pm-text-secondary)]">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-[var(--pm-text-muted)]">
                      {n.source && `${n.source} · `}{timeAgo(n.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markRead(n.id)}
                    className="shrink-0 text-[11px] text-[var(--pm-blue)] hover:underline"
                  >
                    Mark read
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
