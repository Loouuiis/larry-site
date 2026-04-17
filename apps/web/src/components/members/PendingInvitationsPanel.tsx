"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, RotateCw, Trash2, Mail } from "lucide-react";
import { RoleBadge } from "./RoleBadge";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  invitedByUserId: string | null;
  createdAt: string;
}

function relativeFrom(iso: string): string {
  const diff = Date.parse(iso) - Date.now();
  if (Number.isNaN(diff)) return "";
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  if (d >= 1) return diff >= 0 ? `in ${d}d` : `${d}d ago`;
  const h = Math.floor(abs / 3_600_000);
  if (h >= 1) return diff >= 0 ? `in ${h}h` : `${h}h ago`;
  return diff >= 0 ? "<1h" : "just now";
}

export function PendingInvitationsPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/invitations?status=pending", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 401/404 likely means RBAC_V2 flag is off or user isn't admin — render nothing silently.
        setItems([]);
        if (res.status >= 500) {
          setError(data?.message ?? "Failed to load pending invitations.");
        }
        return;
      }
      setItems(Array.isArray(data?.invitations) ? data.invitations : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const revoke = async (id: string) => {
    setBusy(`revoke:${id}`);
    try {
      const res = await fetch(`/api/workspace/invitations/${id}/revoke`, { method: "POST" });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setBusy(null);
    }
  };

  const resend = async (id: string) => {
    setBusy(`resend:${id}`);
    try {
      await fetch(`/api/workspace/invitations/${id}/resend`, { method: "POST" });
    } finally {
      setBusy(null);
    }
  };

  // Don't render anything if there are no pending invites and no error — keeps the page clean.
  if (!loading && items.length === 0 && !error) return null;

  return (
    <section
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <header
        className="flex items-center gap-2 px-5 py-3 text-[12px] font-semibold uppercase tracking-wider"
        style={{
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <MailCheck size={14} />
        Pending invitations
        {items.length > 0 && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: "#f5f3ff", color: "#6c44f6" }}
          >
            {items.length}
          </span>
        )}
      </header>

      {loading ? (
        <div className="px-5 py-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading…
        </div>
      ) : error ? (
        <div className="px-5 py-6 text-[13px]" style={{ color: "#b91c1c" }}>
          {error}
        </div>
      ) : (
        items.map((inv, i) => {
          const expired = Date.parse(inv.expiresAt) <= Date.now();
          return (
            <div
              key={inv.id}
              className="flex items-center gap-3 px-5 py-3"
              style={{
                borderBottom: i < items.length - 1 ? "1px solid var(--border)" : undefined,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                <Mail size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] font-semibold truncate"
                  style={{ color: "var(--text-1)" }}
                >
                  {inv.email}
                </p>
                <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  {expired ? "Expired " : "Expires "} {relativeFrom(inv.expiresAt)}
                  {" · invited "} {relativeFrom(inv.createdAt)}
                </p>
              </div>
              <RoleBadge role={inv.role} />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void resend(inv.id)}
                  disabled={busy === `resend:${inv.id}` || expired}
                  title="Resend email"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ color: "var(--text-2)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <RotateCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(inv.id)}
                  disabled={busy === `revoke:${inv.id}`}
                  title="Revoke invitation"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ color: "var(--text-disabled)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#b91c1c";
                    e.currentTarget.style.background = "#fef2f2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-disabled)";
                    e.currentTarget.style.background = "";
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
