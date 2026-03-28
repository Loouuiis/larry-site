"use client";

import type { LarryEvent } from "@/hooks/useLarryEvents";

interface LarryActivityRailProps {
  suggested: LarryEvent[];
  activity: LarryEvent[];
  accepting: string | null;
  dismissing: string | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

function formatRelativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

export function LarryActivityRail({
  suggested,
  activity,
  accepting,
  dismissing,
  onAccept,
  onDismiss,
}: LarryActivityRailProps) {
  if (suggested.length === 0 && activity.length === 0) return null;

  return (
    <div className="space-y-3 mb-5">
      {suggested.length > 0 && (
        <div className="space-y-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#D97706" }}
          >
            Larry suggests
          </p>
          {suggested.map((event) => {
            const isAccepting = accepting === event.id;
            const isDismissing = dismissing === event.id;
            const busy = isAccepting || isDismissing;
            return (
              <div
                key={event.id}
                style={{
                  background: "#FFF7ED",
                  border: "1px solid #FDE68A",
                  borderRadius: "var(--radius-card)",
                  padding: "14px 16px",
                }}
              >
                <p
                  className="text-[14px] font-semibold leading-snug"
                  style={{ color: "var(--text-1)" }}
                >
                  {event.displayText}
                </p>
                <p
                  className="text-[13px] mt-1"
                  style={{ color: "var(--text-2)" }}
                >
                  {event.reasoning}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept(event.id)}
                    style={{
                      height: "30px",
                      padding: "0 12px",
                      background: busy && isAccepting ? "#15803d" : "#16a34a",
                      color: "#fff",
                      borderRadius: "var(--radius-btn)",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "none",
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {isAccepting ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDismiss(event.id)}
                    style={{
                      height: "30px",
                      padding: "0 12px",
                      background: "transparent",
                      color: "var(--text-2)",
                      borderRadius: "var(--radius-btn)",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid var(--border)",
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {isDismissing ? "Dismissing…" : "Dismiss"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activity.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{ padding: "10px 16px 8px", borderBottom: "1px solid var(--border)" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "var(--text-muted)" }}
            >
              Larry did
            </p>
          </div>
          {activity.map((event, i) => (
            <div
              key={event.id}
              style={{
                padding: "9px 16px",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-muted)" }}>Larry · </span>
                {event.displayText}
                {event.reasoning ? (
                  <span style={{ color: "var(--text-muted)" }}> — {event.reasoning}</span>
                ) : null}
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}· {formatRelativeTime(event.createdAt)}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
