"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RedeemFormProps {
  token: string;
}

export function RedeemForm({ token }: RedeemFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invite-links/${encodeURIComponent(token)}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "We couldn't redeem this link.");
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

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div>
        <label
          htmlFor="redeem-email"
          className="block text-[12px] font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Work email <span style={{ color: "#b91c1c" }}>*</span>
        </label>
        <input
          id="redeem-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
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

      <div>
        <label
          htmlFor="redeem-name"
          className="block text-[12px] font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Your name <span style={{ color: "var(--text-disabled)" }}>(optional, new accounts)</span>
        </label>
        <input
          id="redeem-name"
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
          htmlFor="redeem-password"
          className="block text-[12px] font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Password <span style={{ color: "#b91c1c" }}>*</span>
        </label>
        <input
          id="redeem-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 12 characters (for new accounts)"
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
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          If you already have a Larry account with this email, use that password.
        </p>
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

      <button
        type="submit"
        disabled={busy || password.length < 12 || email.trim().length === 0}
        className="h-10 w-full rounded-full text-[13px] font-semibold text-white"
        style={{ background: "#6c44f6", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Joining…" : "Join workspace"}
      </button>
    </form>
  );
}
