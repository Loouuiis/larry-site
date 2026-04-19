"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Shield, ShieldCheck, Users, X, Copy, Check, Link as LinkIcon } from "lucide-react";

export type InviteRole = "admin" | "pm" | "member";
export type ProjectInviteRole = "owner" | "editor" | "viewer";

const ROLE_OPTIONS: { value: InviteRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin",  label: "Admin",  description: "Manage members, settings, and every project",  icon: ShieldCheck },
  { value: "pm",     label: "PM",     description: "Lead projects they're added to",                icon: Shield },
  { value: "member", label: "Member", description: "Collaborate on projects they're added to",      icon: Users },
];

const PROJECT_ROLE_OPTIONS: { value: ProjectInviteRole; label: string; description: string }[] = [
  { value: "owner",  label: "Admin",  description: "Full control, can manage access" },
  { value: "editor", label: "PM",     description: "Can edit tasks, dates, and notes" },
  { value: "viewer", label: "Member", description: "Read-only access" },
];

type InviteTab = "email" | "link";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
  /** When present, scopes both the email invite and the link to this project. */
  projectId?: string;
  projectName?: string;
}

interface InviteLinkResult {
  url: string;
  maxUses: number | null;
  expiresAt: string | null;
}

export function InviteModal({ open, onClose, onInvited, projectId, projectName }: InviteModalProps) {
  const [tab, setTab] = useState<InviteTab>("email");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [projectRole, setProjectRole] = useState<ProjectInviteRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState("");
  const [copied, setCopied] = useState(false);

  // Link tab state
  const [linkMaxUses, setLinkMaxUses] = useState<string>("");
  const [linkExpiresDays, setLinkExpiresDays] = useState<string>("14");
  const [linkResult, setLinkResult] = useState<InviteLinkResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  // Reset form state on every open so a re-open feels fresh.
  useEffect(() => {
    if (!open) return;
    setTab("email");
    setEmail("");
    setDisplayName("");
    setRole("member");
    setProjectRole("editor");
    setBusy(false);
    setError("");
    setSuccessUrl(null);
    setCopied(false);
    setLinkMaxUses("");
    setLinkExpiresDays("14");
    setLinkResult(null);
    setLinkCopied(false);
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
            ...(projectId ? { projectId, projectRole } : {}),
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
    [email, role, displayName, projectId, projectRole, onInvited],
  );

  const generateLink = useCallback(async () => {
    setBusy(true);
    setError("");
    setLinkResult(null);
    try {
      const maxUses = linkMaxUses.trim() === "" ? undefined : Math.max(1, Number(linkMaxUses));
      const expiresInDays =
        linkExpiresDays.trim() === "" ? undefined : Math.max(1, Number(linkExpiresDays));
      if (
        (maxUses !== undefined && Number.isNaN(maxUses)) ||
        (expiresInDays !== undefined && Number.isNaN(expiresInDays))
      ) {
        setError("Max uses and expiry must be numbers.");
        return;
      }
      const res = await fetch("/api/workspace/invite-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultRole: role,
          ...(projectId ? { defaultProjectId: projectId, defaultProjectRole: projectRole } : {}),
          ...(maxUses !== undefined ? { maxUses } : {}),
          ...(expiresInDays !== undefined ? { expiresInDays } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Failed to create link.");
        return;
      }
      setLinkResult({
        url: typeof data?.url === "string" ? data.url : "",
        maxUses: data?.link?.maxUses ?? null,
        expiresAt: data?.link?.expiresAt ?? null,
      });
      onInvited();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [linkMaxUses, linkExpiresDays, role, projectId, projectRole, onInvited]);

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

  const copyShareLink = useCallback(async () => {
    if (!linkResult?.url) return;
    try {
      await navigator.clipboard.writeText(linkResult.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [linkResult]);

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
          <div>
            <h2
              id="invite-modal-title"
              className="text-[18px] font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              {successUrl
                ? "Invitation sent"
                : linkResult
                  ? "Link ready"
                  : projectName
                    ? `Invite to ${projectName}`
                    : "Invite a team member"}
            </h2>
            {projectName && !successUrl && !linkResult && (
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                They'll be added to this project as soon as they accept.
              </p>
            )}
          </div>
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

        {!successUrl && !linkResult && (
          <div
            role="tablist"
            className="mb-4 flex items-center gap-1 rounded-lg border p-0.5"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "email"}
              onClick={() => {
                setTab("email");
                setError("");
              }}
              className="flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: tab === "email" ? "var(--surface-2)" : "transparent",
                color: tab === "email" ? "var(--text-1)" : "var(--text-muted)",
              }}
            >
              <Mail size={12} className="mr-1 inline -mt-0.5" />
              Email invite
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "link"}
              onClick={() => {
                setTab("link");
                setError("");
              }}
              className="flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: tab === "link" ? "var(--surface-2)" : "transparent",
                color: tab === "link" ? "var(--text-1)" : "var(--text-muted)",
              }}
            >
              <LinkIcon size={12} className="mr-1 inline -mt-0.5" />
              Shareable link
            </button>
          </div>
        )}

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
        ) : linkResult ? (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
              Share this link{projectName ? ` to invite teammates to ${projectName}` : ""}.
              {linkResult.maxUses !== null ? ` Usable ${linkResult.maxUses} time${linkResult.maxUses === 1 ? "" : "s"}.` : " Unlimited uses."}
              {linkResult.expiresAt ? ` Expires ${new Date(linkResult.expiresAt).toLocaleDateString()}.` : " No expiry."}
            </p>
            <div
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <code
                className="flex-1 truncate text-[12px]"
                style={{ color: "var(--text-1)" }}
                title={linkResult.url}
              >
                {linkResult.url}
              </code>
              <button
                type="button"
                onClick={() => void copyShareLink()}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold"
                style={{
                  background: linkCopied ? "#dcfce7" : "#f5f3ff",
                  color: linkCopied ? "#15803d" : "#6c44f6",
                }}
              >
                {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                {linkCopied ? "Copied" : "Copy link"}
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
        ) : tab === "link" ? (
          <div className="space-y-4">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Generate a link you can paste into Slack or a group chat. Each redemption creates an account and lands the user in this workspace
              {projectName ? ` and ${projectName}` : ""}.
            </p>
            <fieldset>
              <legend
                className="block text-[12px] font-medium mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Workspace role
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
                        <Icon size={14} style={{ color: selected ? "#6c44f6" : "var(--text-muted)" }} />
                        <span className="text-[12px] font-semibold" style={{ color: selected ? "#6c44f6" : "var(--text-1)" }}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {projectId && (
              <fieldset>
                <legend className="block text-[12px] font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                  Project access {projectName ? `(${projectName})` : ""}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_ROLE_OPTIONS.map((opt) => {
                    const selected = projectRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setProjectRole(opt.value)}
                        className="rounded-lg border p-3 text-left transition-all"
                        style={{
                          borderColor: selected ? "#6c44f6" : "var(--border)",
                          background: selected ? "rgba(108,68,246,0.05)" : "var(--surface)",
                        }}
                      >
                        <span className="text-[12px] font-semibold" style={{ color: selected ? "#6c44f6" : "var(--text-1)" }}>
                          {opt.label}
                        </span>
                        <p className="mt-1 text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="link-max-uses"
                  className="block text-[12px] font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Max uses <span style={{ color: "var(--text-disabled)" }}>(blank = unlimited)</span>
                </label>
                <input
                  id="link-max-uses"
                  type="number"
                  min={1}
                  max={10000}
                  value={linkMaxUses}
                  onChange={(e) => setLinkMaxUses(e.target.value)}
                  placeholder="e.g. 25"
                  className="h-10 w-full rounded-lg border px-3 text-[13px]"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-1)",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="link-expires-days"
                  className="block text-[12px] font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Expires in (days)
                </label>
                <input
                  id="link-expires-days"
                  type="number"
                  min={1}
                  max={365}
                  value={linkExpiresDays}
                  onChange={(e) => setLinkExpiresDays(e.target.value)}
                  placeholder="14"
                  className="h-10 w-full rounded-lg border px-3 text-[13px]"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-1)",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {error && (
              <div
                aria-live="polite"
                className="rounded-lg border px-3 py-2 text-[12px]"
                style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
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
                type="button"
                onClick={() => void generateLink()}
                disabled={busy}
                className="h-9 rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Generating…" : "Generate link"}
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
                Workspace role
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

            {projectId && (
              <fieldset>
                <legend
                  className="block text-[12px] font-medium mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Project access {projectName ? `(${projectName})` : ""}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_ROLE_OPTIONS.map((opt) => {
                    const selected = projectRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setProjectRole(opt.value)}
                        className="rounded-lg border p-3 text-left transition-all"
                        style={{
                          borderColor: selected ? "#6c44f6" : "var(--border)",
                          background: selected ? "rgba(108,68,246,0.05)" : "var(--surface)",
                        }}
                      >
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: selected ? "#6c44f6" : "var(--text-1)" }}
                        >
                          {opt.label}
                        </span>
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
            )}

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
