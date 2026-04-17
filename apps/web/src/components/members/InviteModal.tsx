"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Shield, ShieldCheck, Users, X, Copy, Check } from "lucide-react";

export type InviteRole = "admin" | "pm" | "member";

const ROLE_OPTIONS: { value: InviteRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin",  label: "Admin",  description: "Manage members, settings, and every project",  icon: ShieldCheck },
  { value: "pm",     label: "PM",     description: "Lead projects they're added to",                icon: Shield },
  { value: "member", label: "Member", description: "Collaborate on projects they're added to",      icon: Users },
];

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteModal({ open, onClose, onInvited }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Reset form state on every open so a re-open feels fresh.
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setDisplayName("");
    setRole("member");
    setBusy(false);
    setError("");
    setSuccessUrl(null);
    setCopied(false);
    const t = setTimeout(() => emailRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/workspace/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            role,
            displayName: displayName.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.message ?? data?.error ?? "Failed to send invite.");
          return;
        }
        setSuccessUrl(typeof data?.inviteUrl === "string" ? data.inviteUrl : null);
        setSuccessEmail(email.trim());
        onInvited();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [email, role, displayName, onInvited],
  );

  const copyLink = useCallback(async () => {
    if (!successUrl) return;
    try {
      await navigator.clipboard.writeText(successUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked in some contexts — keep the URL visible so admin can copy manually.
    }
  }, [successUrl]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2
            id="invite-modal-title"
            className="text-[18px] font-semibold"
            style={{ color: "var(--text-1)" }}
          >
            {successUrl ? "Invitation sent" : "Invite a team member"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <X size={16} />
          </button>
        </div>

        {successUrl ? (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              We emailed <strong>{successEmail}</strong> with an invitation link. You can also copy the link below and share it yourself.
            </p>
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <code
                className="flex-1 truncate text-[12px]"
                style={{ color: "var(--text-1)" }}
                title={successUrl}
              >
                {successUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold"
                style={{
                  background: copied ? "#dcfce7" : "#f5f3ff",
                  color: copied ? "#15803d" : "#6c44f6",
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6" }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="invite-email"
                className="block text-[12px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Email address <span style={{ color: "#b91c1c" }}>*</span>
              </label>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-disabled)" }}
                />
                <input
                  ref={emailRef}
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  className="h-10 w-full rounded-lg border pl-9 pr-3 text-[13px]"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-1)",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="invite-name"
                className="block text-[12px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Display name <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
              </label>
              <input
                id="invite-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Jamie Smith"
                className="h-10 w-full rounded-lg border px-3 text-[13px]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-1)",
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6c44f6")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>

            <fieldset>
              <legend
                className="block text-[12px] font-medium mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Role
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const selected = role === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(opt.value)}
                      className="rounded-lg border p-3 text-left transition-all"
                      style={{
                        borderColor: selected ? "#6c44f6" : "var(--border)",
                        background: selected ? "rgba(108,68,246,0.05)" : "var(--surface)",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon
                          size={14}
                          style={{ color: selected ? "#6c44f6" : "var(--text-muted)" }}
                        />
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: selected ? "#6c44f6" : "var(--text-1)" }}
                        >
                          {opt.label}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-[10.5px] leading-snug"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error && (
              <div
                aria-live="polite"
                className="rounded-lg border px-3 py-2 text-[12px]"
                style={{
                  borderColor: "#fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                }}
              >
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-full border px-4 text-[12px] font-semibold"
                style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
