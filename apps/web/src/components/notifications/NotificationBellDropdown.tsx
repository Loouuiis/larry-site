"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { FeedRow, Notification, NotificationBatch } from "@larry/shared";

const SEVERITY_DOT: Record<string, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(delta / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function clusterByBatch(items: Notification[]): FeedRow[] {
  const groups = new Map<string, Notification[]>();
  const singles: Notification[] = [];
  for (const n of items) {
    if (n.batchId) {
      const arr = groups.get(n.batchId) ?? [];
      arr.push(n);
      groups.set(n.batchId, arr);
    } else {
      singles.push(n);
    }
  }
  const rows: FeedRow[] = [];
  for (const n of singles) rows.push({ kind: "single", notification: n });
  for (const [batchId, arr] of groups) {
    if (arr.length === 1) {
      rows.push({ kind: "single", notification: arr[0]! });
      continue;
    }
    const sorted = [...arr].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const newest = sorted[0]!;
    rows.push({
      kind: "batch",
      batch: {
        batchId,
        headline: headlineFor(sorted),
        count: sorted.length,
        createdAt: newest.createdAt,
        items: sorted,
      },
    });
  }
  rows.sort((a, b) => {
    const aTime = a.kind === "single" ? a.notification.createdAt : a.batch.createdAt;
    const bTime = b.kind === "single" ? b.notification.createdAt : b.batch.createdAt;
    return +new Date(bTime) - +new Date(aTime);
  });
  return rows;
}

function headlineFor(items: Notification[]): string {
  const types = new Set(items.map((n) => n.type));
  if (types.size === 1) {
    const t = items[0]!.type;
    if (t === "action.executed") return `${items.length} actions executed`;
    if (t === "action.failed") return `${items.length} actions failed`;
    if (t === "task.created") return `${items.length} tasks created`;
    if (t === "task.updated") return `${items.length} tasks updated`;
    if (t === "email.drafted") return `${items.length} emails drafted`;
    if (t === "email.sent") return `${items.length} emails sent`;
    if (t === "scan.completed") return `Scan completed (${items.length} events)`;
  }
  return `${items.length} notifications`;
}

export function NotificationBellDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, markRead, dismiss } = useNotifications();
  const rows = useMemo(() => clusterByBatch(items.filter((n) => !n.dismissedAt)), [items]);

  const unreadIds = items.filter((n) => !n.readAt && !n.dismissedAt).map((n) => n.id);

  const navigateTo = async (n: Notification) => {
    await markRead([n.id]);
    onClose();
    router.push(n.deepLink);
  };

  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        right: 0,
        top: "calc(100% + 8px)",
        width: 360,
        maxHeight: 480,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-2, 0 12px 32px rgba(0,0,0,0.12))",
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Notifications</div>
        {unreadIds.length > 0 && (
          <button
            type="button"
            onClick={() => void markRead("all")}
            style={{
              background: "none",
              border: "none",
              color: "#6c44f6",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "28px 14px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            You're all caught up.
          </div>
        ) : (
          rows.map((row) =>
            row.kind === "single" ? (
              <FeedItem
                key={row.notification.id}
                notification={row.notification}
                onClick={() => void navigateTo(row.notification)}
                onDismiss={() => void dismiss([row.notification.id])}
              />
            ) : (
              <BatchItem
                key={row.batch.batchId}
                batch={row.batch}
                onItemClick={(n) => void navigateTo(n)}
                onDismissBatch={() => void dismiss(row.batch.items.map((i) => i.id))}
              />
            )
          )
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px", textAlign: "right" }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/workspace/notifications");
          }}
          style={{
            background: "none",
            border: "none",
            color: "#6c44f6",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          View all →
        </button>
      </div>
    </div>
  );
}

function FeedItem({
  notification: n,
  onClick,
  onDismiss,
}: {
  notification: Notification;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const isUnread = !n.readAt;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        background: isUnread ? "rgba(108, 68, 246, 0.04)" : "transparent",
      }}
    >
      <span
        style={{
          marginTop: 6,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: SEVERITY_DOT[n.severity] ?? "#6b7280",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: isUnread ? 600 : 500, color: "var(--text-1)" }}>{n.title}</div>
        {n.body && (
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>{n.body}</div>
        )}
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
          {formatRelative(n.createdAt)}
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
          padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}

function BatchItem({
  batch,
  onItemClick,
  onDismissBatch,
}: {
  batch: NotificationBatch;
  onItemClick: (n: Notification) => void;
  onDismissBatch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unreadCount = batch.items.filter((n) => !n.readAt).length;

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
          background: unreadCount > 0 ? "rgba(108, 68, 246, 0.04)" : "transparent",
        }}
      >
        {open ? (
          <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: unreadCount > 0 ? 600 : 500, color: "var(--text-1)" }}>
            {batch.headline}
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
            {batch.count} items · {formatRelative(batch.createdAt)}
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss batch"
          onClick={(e) => {
            e.stopPropagation();
            onDismissBatch();
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
            padding: 2,
          }}
        >
          ×
        </button>
      </div>
      {open && (
        <div style={{ background: "var(--surface-2, rgba(0,0,0,0.02))" }}>
          {batch.items.map((n) => (
            <div
              key={n.id}
              onClick={() => onItemClick(n)}
              style={{
                padding: "8px 14px 8px 36px",
                fontSize: 12,
                cursor: "pointer",
                color: "var(--text-1)",
                borderTop: "1px solid var(--border)",
                fontWeight: n.readAt ? 400 : 600,
              }}
            >
              <div>{n.title}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
                {formatRelative(n.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
