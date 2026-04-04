"use client";

import { useEffect, useState } from "react";
import { Mail, Send, ChevronDown, ChevronUp, Check } from "lucide-react";

interface EmailDraft {
  id: string;
  projectId: string | null;
  actionId: string | null;
  recipient: string;
  subject: string;
  body: string;
  state: "draft" | "sent";
  sentAt: string | null;
  createdAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StateBadge({ state }: { state: "draft" | "sent" }) {
  const isSent = state === "sent";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "11px",
        fontWeight: 600,
        color: isSent ? "#2e7d32" : "var(--text-2)",
        background: isSent ? "rgba(46,125,50,0.1)" : "var(--surface-2)",
        borderRadius: "var(--radius-badge)",
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {isSent ? <Check size={9} /> : <Mail size={9} />}
      {isSent ? "Sent" : "Draft"}
    </span>
  );
}

function DraftRow({
  draft,
  onSend,
}: {
  draft: EmailDraft;
  onSend: (draft: EmailDraft) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(draft.state === "sent");
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    setError(null);
    try {
      await onSend(draft);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: expanded ? "var(--surface-2)" : "var(--surface)",
        transition: "background 0.12s",
      }}
    >
      {/* Row header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr) 80px 110px 90px",
          gap: "12px",
          alignItems: "center",
          padding: "12px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-1)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {draft.subject || "(no subject)"}
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {draft.recipient}
        </span>
        <span>
          <StateBadge state={sent ? "sent" : "draft"} />
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {formatDate(draft.sentAt ?? draft.createdAt)}
        </span>
        <span style={{ display: "flex", justifyContent: "flex-end", color: "var(--text-muted)" }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              padding: "14px 16px",
              fontSize: "13px",
              color: "var(--text-2)",
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              marginBottom: "12px",
            }}
          >
            {draft.body}
          </div>
          {error && (
            <p style={{ fontSize: "12px", color: "#c0392b", marginBottom: "8px" }}>{error}</p>
          )}
          {!sent && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "32px",
                padding: "0 14px",
                borderRadius: "var(--radius-btn)",
                border: "none",
                background: "var(--cta)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.7 : 1,
                transition: "opacity 0.12s",
              }}
            >
              <Send size={13} />
              {sending ? "Sending…" : "Send now"}
            </button>
          )}
          {sent && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#2e7d32",
                fontWeight: 500,
              }}
            >
              <Check size={13} />
              Email sent
            </span>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "draft" | "sent";

export function EmailDraftsClient() {
  const [tab, setTab] = useState<Tab>("draft");
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/workspace/email/drafts?state=${tab}&limit=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { items?: EmailDraft[] }) => setDrafts(data.items ?? []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [tab]);

  const handleSend = async (draft: EmailDraft) => {
    const res = await fetch("/api/workspace/email/drafts/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: draft.recipient,
        subject: draft.subject,
        body: draft.body,
        projectId: draft.projectId ?? undefined,
        actionId: draft.actionId ?? undefined,
        sendNow: true,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(json.error ?? "Send failed");
    }
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--cta)" : "var(--text-2)",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--cta)" : "2px solid transparent",
    cursor: "pointer",
    transition: "color 0.12s",
  });

  return (
    <div style={{ minHeight: "100%", overflowY: "auto", background: "var(--page-bg)", padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: "4px" }}>
        <h1 className="text-h1">Email Drafts</h1>
      </div>
      <p className="text-body-sm" style={{ marginBottom: "20px" }}>
        Email drafts and sent messages generated by Larry.
      </p>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0",
          borderBottom: "1px solid var(--border)",
          marginBottom: "16px",
        }}
      >
        <button style={TAB_STYLE(tab === "draft")} onClick={() => setTab("draft")}>
          Drafts
        </button>
        <button style={TAB_STYLE(tab === "sent")} onClick={() => setTab("sent")}>
          Sent
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr) 80px 110px 90px",
            gap: "12px",
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <span>Subject</span>
          <span>Recipient</span>
          <span>Status</span>
          <span>Date</span>
          <span />
        </div>

        {loading ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading…</p>
          </div>
        ) : drafts.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <div
              style={{
                margin: "0 auto 12px",
                display: "flex",
                height: "48px",
                width: "48px",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-card)",
                background: "var(--surface-2)",
              }}
            >
              <Mail size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
              No {tab === "draft" ? "drafts" : "sent emails"} yet
            </p>
            <p className="text-body-sm">
              {tab === "draft"
                ? "Larry will create drafts here when you ask him to write emails."
                : "Sent emails will appear here."}
            </p>
          </div>
        ) : (
          drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} onSend={handleSend} />
          ))
        )}
      </div>
    </div>
  );
}
