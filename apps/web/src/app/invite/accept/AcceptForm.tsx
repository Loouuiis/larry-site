"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AcceptFormProps {
  token: string;
  email: string;
  currentUserEmail: string | null;
}

export function AcceptForm({ token, email, currentUserEmail }: AcceptFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mismatch =
    currentUserEmail !== null &&
    currentUserEmail.toLowerCase() !== email.toLowerCase();

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
            ? `Continue as ${currentUserEmail}`
            : "Create account and join"}
      </button>
    </form>
  );
}
