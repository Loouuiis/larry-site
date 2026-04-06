"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setSent(true);
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Account recovery
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Forgot your password?</h1>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
              <p className="text-sm font-medium text-[var(--text-1)]">Check your inbox</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link.
                It expires in 1 hour.
              </p>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Didn&apos;t receive it? Check your spam folder or{" "}
              <button
                type="button"
                onClick={() => { setSent(false); setError(""); }}
                className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
              >
                try again
              </button>
            </p>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-[var(--text-2)]">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
                  style={{ fontSize: "1rem" }}
                />
              </div>

              {error && (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="mt-1 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)] disabled:pointer-events-none disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Log in
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        <Link href="/" className="transition-colors hover:text-[var(--text-2)]">
          {"<-"} Back to Larry
        </Link>
      </p>
    </div>
  );
}
