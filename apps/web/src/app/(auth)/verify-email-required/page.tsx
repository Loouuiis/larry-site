"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailRequiredPage() {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  const handleResend = useCallback(async () => {
    setResending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        setResent(true);
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to resend. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setResending(false);
    }
  }, []);

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Account verification
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Verify your email</h1>
        </div>

        <p className="mb-5 text-sm text-[var(--text-2)]">
          Your email verification grace period has expired. Please verify your email address to continue using Larry.
        </p>

        {resent ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-sm font-medium text-[var(--text-1)]">Check your inbox</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">
              We&apos;ve sent a new verification email. Please check your inbox and spam folder.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            aria-busy={resending}
            className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)] disabled:pointer-events-none disabled:opacity-50"
          >
            {resending ? "Sending..." : "Resend verification email"}
          </button>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Log out
          </button>
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
