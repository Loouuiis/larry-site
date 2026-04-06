"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerifyState>(token ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Invalid verification link. No token provided."
  );
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function verify() {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setState("success");
          setTimeout(() => {
            router.push("/workspace");
          }, 2000);
        } else {
          const data = await res.json();
          setState("error");
          setErrorMessage(data.error ?? "Invalid or expired verification link.");
        }
      } catch {
        if (cancelled) return;
        setState("error");
        setErrorMessage("Network error. Please check your connection.");
      }
    }

    void verify();
    return () => { cancelled = true; };
  }, [token, router]);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        setResent(true);
      } else {
        const data = await res.json();
        setErrorMessage(data.error ?? "Failed to resend. Please try again.");
      }
    } catch {
      setErrorMessage("Network error. Please check your connection.");
    } finally {
      setResending(false);
    }
  }, []);

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--text-disabled)" }}
        />
        <p className="mt-4 text-sm text-[var(--text-2)]">Verifying your email...</p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
          <p className="text-sm font-medium text-[var(--text-1)]">Email verified!</p>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Your email has been verified successfully. Redirecting to your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
        <p className="text-sm font-medium text-[var(--text-1)]">Verification failed</p>
        <p className="mt-1 text-sm text-[var(--text-2)]">{errorMessage}</p>
      </div>

      {resent ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
          <p className="text-sm text-[var(--text-2)]">
            A new verification email has been sent. Please check your inbox.
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
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Email verification
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Verify your email</h1>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <div
                className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
                style={{ color: "var(--text-disabled)" }}
              />
            </div>
          }
        >
          <VerifyEmailForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          <Link
            href="/login"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Back to login
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
