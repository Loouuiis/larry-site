"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mail, Send, ChevronDown, ChevronUp, Check,
  Pencil, Sparkles, FolderKanban, Zap, X, SquarePen,
} from "lucide-react";

interface EmailDraft {
  id: string;
  projectId: string | null;
  projectName: string | null;
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

const FIELD_STYLE: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-input, 6px)",
  fontSize: "13px",
  padding: "8px 10px",
  background: "var(--surface)",
  color: "var(--text-1)",
  outline: "none",
  fontFamily: "inherit",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: "4px",
  display: "block",
};

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
  const [sendError, setSendError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editRecipient, setEditRecipient] = useState(draft.recipient);
  const [editSubject, setEditSubject] = useState(draft.subject);
  const [editBody, setEditBody] = useState(draft.body);

  // AI suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    setSendError(null);
    try {
      await onSend({ ...draft, recipient: editRecipient, subject: editSubject, body: editBody });
      setSent(true);
      setEditing(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const handleCancelEdit = () => {
    setEditRecipient(draft.recipient);
    setEditSubject(draft.subject);
    setEditBody(draft.body);
    setSuggestion(null);
    setSuggestionError(null);
    setEditing(false);
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestion(null);
    setSuggestionError(null);
    try {
      const message = `Improve this email draft. Return only the improved body text, no commentary or explanation.\n\nSubject: ${editSubject}\nTo: ${editRecipient}\n\n${editBody}`;
      const res = await fetch("/api/workspace/larry/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          projectId: draft.projectId ?? undefined,
        }),
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok || json.error) {
        setSuggestionError(json.error ?? "Larry couldn't suggest improvements right now.");
      } else {
        setSuggestion(json.message ?? null);
      }
    } catch {
      setSuggestionError("Failed to get suggestion.");
    } finally {
      setSuggesting(false);
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
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,1fr) 72px 100px 36px",
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
        {/* Project + action links */}
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {draft.projectId ? (
            <Link
              href={`/workspace/projects/${draft.projectId}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-2)",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-badge)",
                padding: "2px 7px",
                whiteSpace: "nowrap",
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "120px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--cta)"; e.currentTarget.style.background = "rgba(0,115,234,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.background = "var(--surface-2)"; }}
            >
              <FolderKanban size={9} />
              {draft.projectName ?? "Project"}
            </Link>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>—</span>
          )}
          {draft.actionId && (
            <Link
              href="/workspace/actions"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-2)",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-badge)",
                padding: "2px 7px",
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--cta)"; e.currentTarget.style.background = "rgba(0,115,234,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.background = "var(--surface-2)"; }}
            >
              <Zap size={9} />
              Action
            </Link>
          )}
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

      {/* Expanded panel */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Metadata strip */}
          {(draft.projectId || draft.actionId) && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              {draft.projectId && (
                <Link
                  href={`/workspace/projects/${draft.projectId}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    color: "var(--text-2)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cta)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
                >
                  <FolderKanban size={12} />
                  {draft.projectName ?? "Project"}
                </Link>
              )}
              {draft.actionId && (
                <Link
                  href="/workspace/actions"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    color: "var(--text-2)",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cta)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
                >
                  <Zap size={12} />
                  View Larry action
                </Link>
              )}
            </div>
          )}

          {/* Read-only view */}
          {!editing && (
            <>
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
                }}
              >
                {draft.body}
              </div>
              {sendError && (
                <p style={{ fontSize: "12px", color: "#c0392b" }}>{sendError}</p>
              )}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {!sent && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        height: "32px",
                        padding: "0 14px",
                        borderRadius: "var(--radius-btn)",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text-2)",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
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
                        opacity: sending ? 0.7 : 1,
                      }}
                    >
                      <Send size={12} />
                      {sending ? "Sending…" : "Send now"}
                    </button>
                  </>
                )}
                {sent && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#2e7d32", fontWeight: 500 }}>
                    <Check size={13} />
                    Email sent
                  </span>
                )}
              </div>
            </>
          )}

          {/* Edit view */}
          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={LABEL_STYLE}>To</label>
                <input
                  type="email"
                  value={editRecipient}
                  onChange={(e) => setEditRecipient(e.target.value)}
                  style={FIELD_STYLE}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Subject</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  style={FIELD_STYLE}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Body</label>
                <textarea
                  rows={8}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  style={{ ...FIELD_STYLE, resize: "vertical", lineHeight: 1.6 }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* AI suggestion button */}
              <div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleSuggest(); }}
                  disabled={suggesting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    height: "30px",
                    padding: "0 12px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid rgba(108,68,246,0.3)",
                    background: "rgba(108,68,246,0.06)",
                    color: "#6c44f6",
                    fontSize: "12px",
                    fontWeight: 600,
                    opacity: suggesting ? 0.7 : 1,
                  }}
                >
                  <Sparkles size={12} />
                  {suggesting ? "Thinking…" : "Suggest improvements"}
                </button>
              </div>

              {/* Suggestion block */}
              {suggestionError && (
                <p style={{ fontSize: "12px", color: "#c0392b" }}>{suggestionError}</p>
              )}
              {suggestion && (
                <div
                  style={{
                    background: "rgba(108,68,246,0.06)",
                    border: "1px solid rgba(108,68,246,0.2)",
                    borderRadius: "var(--radius-card)",
                    padding: "12px 14px",
                  }}
                >
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6c44f6", marginBottom: "8px" }}>
                    Larry's suggestion
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: "10px" }}>
                    {suggestion}
                  </p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditBody(suggestion); setSuggestion(null); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        height: "28px",
                        padding: "0 10px",
                        borderRadius: "var(--radius-btn)",
                        border: "none",
                        background: "#6c44f6",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <Check size={11} />
                      Use this
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSuggestion(null); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        height: "28px",
                        padding: "0 10px",
                        borderRadius: "var(--radius-btn)",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text-2)",
                        fontSize: "12px",
                        fontWeight: 500,
                      }}
                    >
                      <X size={11} />
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Edit action buttons */}
              {sendError && (
                <p style={{ fontSize: "12px", color: "#c0392b" }}>{sendError}</p>
              )}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: "32px",
                    padding: "0 14px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-2)",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: "32px",
                    padding: "0 14px",
                    borderRadius: "var(--radius-btn)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-1)",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Save
                </button>
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
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  <Send size={12} />
                  {sending ? "Sending…" : "Send now"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Tenant member type ───────────────────────────────────────────── */

interface TenantMember {
  id: string;
  name: string;
  email: string;
}

/* ── Recipient input with member autocomplete ─────────────────────── */

function RecipientInput({
  value,
  onChange,
  members,
}: {
  value: string;
  onChange: (v: string) => void;
  members: TenantMember[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = value.trim().length > 0
    ? members.filter((m) => {
        const q = value.toLowerCase();
        return (
          m.email.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="name@example.com"
        style={FIELD_STYLE}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {suggestions.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m.email);
                setOpen(false);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                width: "100%",
                padding: "8px 12px",
                background: "none",
                border: "none",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)" }}>
                {m.name || m.email}
              </span>
              {m.name && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Compose modal ────────────────────────────────────────────────── */

function ComposeModal({
  members,
  onClose,
  onSent,
}: {
  members: TenantMember[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function handleSend(sendNow: boolean) {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setError("Please fill in To, Subject and Body.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/email/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, body, sendNow }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? "Failed.");
      }
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSending(false);
    }
  }

  async function handleSuggest() {
    if (!subject.trim() && !body.trim()) return;
    setSuggesting(true);
    setSuggestion(null);
    try {
      const res = await fetch("/api/workspace/larry/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Improve this email draft. Return only the improved body text, no commentary.\n\nSubject: ${subject}\nTo: ${to}\n\n${body}`,
        }),
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Could not suggest.");
      setSuggestion(json.message ?? null);
    } catch {
      setError("Larry couldn't suggest improvements right now.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          background: "var(--surface)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>
            New message
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={LABEL_STYLE}>To</label>
            <RecipientInput value={to} onChange={setTo} members={members} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              style={FIELD_STYLE}
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Body</label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              style={{ ...FIELD_STYLE, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          {/* AI suggestion button */}
          <div>
            <button
              type="button"
              onClick={() => void handleSuggest()}
              disabled={suggesting || (!subject.trim() && !body.trim())}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "30px",
                padding: "0 12px",
                borderRadius: "var(--radius-btn)",
                border: "1px solid rgba(108,68,246,0.3)",
                background: "rgba(108,68,246,0.06)",
                color: "#6c44f6",
                fontSize: "12px",
                fontWeight: 600,
                opacity: suggesting ? 0.7 : 1,
              }}
            >
              <Sparkles size={12} />
              {suggesting ? "Thinking…" : "Suggest improvements"}
            </button>
          </div>

          {/* Suggestion block */}
          {suggestion && (
            <div
              style={{
                background: "rgba(108,68,246,0.06)",
                border: "1px solid rgba(108,68,246,0.2)",
                borderRadius: "var(--radius-card)",
                padding: "12px 14px",
              }}
            >
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6c44f6", marginBottom: "8px" }}>
                Larry's suggestion
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: "10px" }}>
                {suggestion}
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => { setBody(suggestion); setSuggestion(null); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "28px", padding: "0 10px", borderRadius: "var(--radius-btn)", border: "none", background: "#6c44f6", color: "#fff", fontSize: "12px", fontWeight: 600 }}
                >
                  <Check size={11} /> Use this
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestion(null)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "28px", padding: "0 10px", borderRadius: "var(--radius-btn)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-2)", fontSize: "12px", fontWeight: 500 }}
                >
                  <X size={11} /> Dismiss
                </button>
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: "12px", color: "#c0392b" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px 18px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            onClick={() => void handleSend(false)}
            disabled={sending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              height: "34px",
              padding: "0 16px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-2)",
              fontSize: "13px",
              fontWeight: 500,
              opacity: sending ? 0.6 : 1,
            }}
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void handleSend(true)}
            disabled={sending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              height: "34px",
              padding: "0 16px",
              borderRadius: "var(--radius-btn)",
              border: "none",
              background: "var(--cta)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              opacity: sending ? 0.7 : 1,
            }}
          >
            <Send size={13} />
            {sending ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Tab = "draft" | "sent";

export function EmailDraftsClient() {
  const [tab, setTab] = useState<Tab>("draft");
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [members, setMembers] = useState<TenantMember[]>([]);

  useEffect(() => {
    fetch("/api/workspace/members", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { members?: TenantMember[] }) => setMembers(data.members ?? []))
      .catch(() => {});
  }, []);

  function loadDrafts(state: Tab) {
    setLoading(true);
    fetch(`/api/workspace/email/drafts?state=${state}&limit=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { items?: EmailDraft[] }) => setDrafts(data.items ?? []))
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadDrafts(tab); }, [tab]);

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
    transition: "color 0.12s",
  });

  return (
    <div style={{ minHeight: "100%", overflowY: "auto", background: "var(--page-bg)", padding: "24px" }}>
      {composing && (
        <ComposeModal
          members={members}
          onClose={() => setComposing(false)}
          onSent={() => { setTab("sent"); loadDrafts("sent"); }}
        />
      )}

      {/* Header */}
      <h1 className="text-h1" style={{ marginBottom: "4px" }}>Mail</h1>
      <p className="text-body-sm" style={{ marginBottom: "16px" }}>
        Outbound mail drafts and sent messages from Larry.
      </p>

      {/* Tabs + Compose button on same row */}
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
        <button style={TAB_STYLE(tab === "draft")} onClick={() => setTab("draft")}>Drafts</button>
        <button style={TAB_STYLE(tab === "sent")} onClick={() => setTab("sent")}>Sent</button>
        <button
          type="button"
          onClick={() => setComposing(true)}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            height: "30px",
            padding: "0 14px",
            borderRadius: "var(--radius-btn)",
            border: "none",
            background: "var(--cta)",
            color: "#fff",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "4px",
          }}
        >
          <SquarePen size={13} />
          Compose
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
            gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,1fr) 72px 100px 36px",
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
          <span>Project / Action</span>
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
