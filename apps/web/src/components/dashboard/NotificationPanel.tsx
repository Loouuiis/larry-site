"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Bell,
  Clock,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  CheckCheck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type NotifType = "task_start" | "delay" | "deadline" | "escalation";
type Severity  = "info" | "warning" | "critical";

interface Notification {
  id: string;
  type: NotifType;
  severity: Severity;
  message: string;
  detail?: string;
  timestamp: string; // ISO
  read: boolean;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_NOTIFS: Notification[] = [
  {
    id: "n1",
    type: "escalation",
    severity: "critical",
    message: "Website Redesign escalated to project lead",
    detail: "Task blocked for 3+ days with no update.",
    timestamp: "2026-03-20T08:12:00Z",
    read: false,
  },
  {
    id: "n2",
    type: "deadline",
    severity: "critical",
    message: "Mobile App MVP due in 6 hours",
    detail: "3 of 8 subtasks still in progress.",
    timestamp: "2026-03-20T07:55:00Z",
    read: false,
  },
  {
    id: "n3",
    type: "delay",
    severity: "warning",
    message: "Brand Identity refresh delayed by 2 days",
    detail: "Assignee flagged external dependency.",
    timestamp: "2026-03-20T06:30:00Z",
    read: false,
  },
  {
    id: "n4",
    type: "deadline",
    severity: "warning",
    message: "Q1 Analytics Report due tomorrow",
    detail: "Dashboard section awaiting final data.",
    timestamp: "2026-03-19T17:00:00Z",
    read: false,
  },
  {
    id: "n5",
    type: "task_start",
    severity: "info",
    message: "Reminder: 'Content Strategy' starts today",
    detail: "Assigned to Jordan M.",
    timestamp: "2026-03-20T09:00:00Z",
    read: true,
  },
  {
    id: "n6",
    type: "delay",
    severity: "warning",
    message: "API Integration pushed back 1 day",
    detail: "Third-party vendor unresponsive.",
    timestamp: "2026-03-19T14:15:00Z",
    read: true,
  },
  {
    id: "n7",
    type: "task_start",
    severity: "info",
    message: "Reminder: 'User Testing Round 2' starts in 1 hour",
    detail: "Assigned to Alex K.",
    timestamp: "2026-03-20T08:00:00Z",
    read: true,
  },
  {
    id: "n8",
    type: "escalation",
    severity: "critical",
    message: "CRM Migration escalated — missed 2 milestones",
    detail: "Sponsor notified automatically.",
    timestamp: "2026-03-18T11:00:00Z",
    read: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<NotifType, string> = {
  task_start: "Task Start",
  delay:      "Delay",
  deadline:   "Deadline",
  escalation: "Escalation",
};

const TYPE_ICONS: Record<NotifType, React.ReactNode> = {
  task_start: <Clock size={13} />,
  delay:      <AlertTriangle size={13} />,
  deadline:   <CalendarClock size={13} />,
  escalation: <TrendingUp size={13} />,
};

const SEVERITY_STYLES: Record<Severity, { dot: string; bg: string; text: string; border: string }> = {
  info:     { dot: "bg-[var(--color-accent-blue)]",   bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-100" },
  warning:  { dot: "bg-amber-400",                    bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-100" },
  critical: { dot: "bg-red-500",                      bg: "bg-red-50",    text: "text-red-700",    border: "border-red-100" },
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: Array<{ key: NotifType | "all"; label: string }> = [
  { key: "all",        label: "All" },
  { key: "task_start", label: "Task Start" },
  { key: "delay",      label: "Delays" },
  { key: "deadline",   label: "Deadlines" },
  { key: "escalation", label: "Escalations" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── NotificationCard ─────────────────────────────────────────────────────────

function NotificationCard({
  notif,
  onDismiss,
}: {
  notif: Notification;
  onDismiss: (id: string) => void;
}) {
  const sev = SEVERITY_STYLES[notif.severity];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="group relative flex gap-3 rounded-xl border border-[#f0edfa] p-3.5 transition-shadow hover:shadow-sm"
      style={{ background: notif.read ? "#fff" : "#fafaff" }}
    >
      {/* Unread dot */}
      {!notif.read && (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#6c44f6" }} />
      )}

      {/* Icon */}
      <span
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          notif.read ? "bg-[var(--surface-2)] text-[var(--text-muted)]" : `${sev.bg} ${sev.text}`,
        ].join(" ")}
        style={{ marginLeft: notif.read ? 0 : undefined }}
      >
        {TYPE_ICONS[notif.type]}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p
            className={[
              "text-xs font-semibold leading-snug",
              notif.read ? "text-[var(--text-2)]" : sev.text,
            ].join(" ")}
          >
            {notif.message}
          </p>
          {/* Severity badge */}
          <span
            className={[
              "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              notif.severity === "critical" ? "bg-red-100 text-red-600" :
              notif.severity === "warning"  ? "bg-amber-100 text-amber-600" :
                                              "bg-blue-100 text-blue-600",
            ].join(" ")}
          >
            {notif.severity}
          </span>
        </div>
        {notif.detail && (
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] leading-snug">{notif.detail}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-full border border-[var(--border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {TYPE_LABELS[notif.type]}
          </span>
          <span className="text-[10px] text-[var(--text-disabled)]">{relativeTime(notif.timestamp)}</span>
        </div>
      </div>

      {/* Dismiss */}
      <motion.button
        onClick={() => onDismiss(notif.id)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-disabled)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]"
        aria-label="Dismiss"
      >
        <X size={10} />
      </motion.button>
    </motion.div>
  );
}

// ─── NotificationPanel ────────────────────────────────────────────────────────

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFS);
  const [activeTab, setActiveTab] = useState<NotifType | "all">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const visible = activeTab === "all"
    ? notifications
    : notifications.filter((n) => n.type === activeTab);

  function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="fixed right-4 top-[72px] z-40 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#f0edfa] bg-white sm:right-6"
      style={{ boxShadow: "0 0 40px rgba(0,0,0,0.06)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#f0edfa] px-4 py-3.5">
        <Bell size={15} className="text-[var(--color-brand)]" />
        <h2 className="flex-1 text-sm font-semibold text-[var(--text-1)] tracking-[-0.02em]">
          Notifications
        </h2>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-brand)] px-1.5 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
        <motion.button
          onClick={markAllRead}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
        >
          <CheckCheck size={11} />
          <span className="hidden sm:inline">Mark all read</span>
        </motion.button>
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
          aria-label="Close"
        >
          <X size={13} />
        </motion.button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#f0edfa] px-3 py-2 scrollbar-none">
        {TABS.map((tab) => {
          const count = tab.key === "all"
            ? notifications.length
            : notifications.filter((n) => n.type === tab.key).length;
          const isActive = activeTab === tab.key;
          return (
            <div key={tab.key} className="relative shrink-0">
              <motion.button
                onClick={() => setActiveTab(tab.key)}
                whileTap={{ scale: 0.95 }}
                className={[
                  "relative flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-[var(--color-brand)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-2)]",
                ].join(" ")}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={[
                      "rounded-full px-1 text-[9px] font-bold",
                      isActive
                        ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                    ].join(" ")}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="notif-tab-underline"
                    className="absolute inset-0 rounded-lg bg-[var(--color-brand)]/8"
                    transition={{ duration: 0.2, ease: EASE }}
                  />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Notification list */}
      <div
        className="overflow-y-auto p-3"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2 py-12 text-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)]">
                <Bell size={18} className="text-[var(--text-disabled)]" />
              </span>
              <p className="text-xs font-medium text-[var(--text-muted)]">No notifications here</p>
              <p className="text-[11px] text-[var(--text-disabled)]">You&apos;re all caught up.</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((n) => (
                <NotificationCard key={n.id} notif={n} onDismiss={dismiss} />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Exported badge count helper ──────────────────────────────────────────────

export const TOTAL_NOTIFICATION_COUNT = MOCK_NOTIFS.filter((n) => !n.read).length;
