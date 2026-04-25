"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@larry/shared";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

const SEVERITY_BORDER: Record<string, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

export function NotificationBanners() {
  const router = useRouter();
  const { bannerQueue, consumeBanner, markRead, dismiss } = useNotifications();
  const visible = bannerQueue.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, bannerQueue.length - MAX_VISIBLE);

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      {visible.map((n) => (
        <BannerCard
          key={n.id}
          notification={n}
          onClick={async () => {
            await markRead([n.id]);
            consumeBanner(n.id);
            router.push(n.deepLink);
          }}
          onDismiss={async () => {
            await dismiss([n.id]);
            consumeBanner(n.id);
          }}
          onExpire={() => consumeBanner(n.id)}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => {
            for (const n of bannerQueue.slice(MAX_VISIBLE)) consumeBanner(n.id);
            document.getElementById("notification-bell-button")?.click();
          }}
          style={{
            pointerEvents: "auto",
            alignSelf: "flex-end",
            padding: "6px 12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

function BannerCard({
  notification: n,
  onClick,
  onDismiss,
  onExpire,
}: {
  notification: Notification;
  onClick: () => void;
  onDismiss: () => void;
  onExpire: () => void;
}) {
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (hover) return;
    const t = window.setTimeout(onExpire, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [hover, onExpire]);

  return (
    <div
      role={n.severity === "error" ? "alert" : "status"}
      aria-live={n.severity === "error" ? "assertive" : "polite"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        pointerEvents: "auto",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${SEVERITY_BORDER[n.severity] ?? "#6b7280"}`,
        borderRadius: 8,
        boxShadow: "var(--shadow-1)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {n.body}
          </div>
        )}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          color: "var(--text-muted)",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
