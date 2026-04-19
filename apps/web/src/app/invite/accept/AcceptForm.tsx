"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AcceptFormProps {
  token: string;
  email: string;
  currentUserEmail: string | null;
  /** True when the signed-in email matches the invite but the active tenant differs. */
  willSwitchTenant?: boolean;
  targetTenantName?: string | null;
}

export function AcceptForm({
  token,
  email,
  currentUserEmail,
  willSwitchTenant = false,
  targetTenantName = null,
}: AcceptFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmedSwitch, setConfirmedSwitch] = useState(false);

  const mismatch =
    currentUserEmail !== null &&
    currentUserEmail.toLowerCase() !== email.toLowerCase();

  const needsSwitchConfirm = willSwitchTenant && !confirmedSwitch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            currentUserEmail
              ? {}
              : { password, displayName: displayName.trim() || undefined },
          ),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "We couldn't accept this invitation.");
        return;
      }
      router.replace("/workspace");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (mismatch) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
          This invitation was sent to <strong>{email}</strong>. You're signed in
          as <strong>{currentUserEmail}</strong>.
        </p>
        <a
          href={`/logout?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
          className="inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold text-white"
          style={{ background: "#6c44f6" }}
        >
          Sign out and accept as {email}
        </a>
      </div>
    );
  }

  if (needsSwitchConfirm) {
    return (
      <div className="space-y-3">
        <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
          Accepting will switch your active session to
          {" "}<strong>{targetTenantName ?? "the new workspace"}</strong>. Confirm to continue.
        </p>
        <div className="flex gap-2">
          <a
            href="/workspace"
            className="flex-1 h-10 inline-flex items-center justify-center rounded-full border text-[13px] font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--text-1)" }}
          >
            Cancel
          </a>
          <button
            type="button"
            onClick={() => setConfirmedSwitch(true)}
            className="flex-1 h-10 rounded-full text-[13px] font-semibold text-white"
            style={{ background: "#6c44f6" }}
          >
            Switch and accept
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      {!currentUserEmail && (
        <>
          <div>
            <label
              htmlFor="accept-name"
              className="block text-[12px] font-medium mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Your name <span style={{ color: "var(--text-disabled)" }}>(optional)</span>
            </label>
            <input
              id="accept-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jamie Smith"
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
              htmlFor="accept-password"
              className="block text-[12px] font-medium mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Create a password <span style={{ color: "#b91c1c" }}>*</span>
            </label>
            <input
              id="accept-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
              minLength={12}
              required
              className="h-10 w-full rounded-lg border px-3 text-[13px]"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text-1)",
                outline: "none",
              }}
            />
          </div>
        </>
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

      <button
        type="submit"
        disabled={busy || (!currentUserEmail && password.length < 12)}
        className="h-10 w-full rounded-full text-[13px] font-semibold text-white"
        style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
      >
        {busy
          ? "Accepting…"
          : currentUserEmail
            ? willSwitchTenant
              ? `Switch to ${targetTenantName ?? "this workspace"} as ${currentUserEmail}`
              : `Continue as ${currentUserEmail}`
            : "Create account and join"}
      </button>
    </form>
  );
}
