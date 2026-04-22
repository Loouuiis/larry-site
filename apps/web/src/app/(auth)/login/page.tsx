"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_missing_code: "Google sign-in failed: no authorisation code received.",
  google_invalid_code: "Google sign-in failed: token verification error. Please try again.",
  google_denied: "Google sign-in was cancelled.",
  google_missing_params: "Google sign-in failed: missing parameters from Google.",
  google_invalid_state: "Google sign-in failed: invalid state token. Please try again.",
  google_token_exchange: "Google sign-in failed: could not exchange token with Google.",
  google_userinfo: "Google sign-in failed: could not retrieve your Google profile.",
  google_no_email: "Google sign-in failed: no email address on your Google account.",
  config: "Google sign-in is temporarily unavailable (server configuration issue).",
  google_unexpected: "Google sign-in encountered an unexpected error. Please try again.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const googleError = searchParams.get("error");
  const [error, setError] = useState(
    googleError ? (GOOGLE_ERROR_MESSAGES[googleError] ?? `Google sign-in error: ${googleError}`) : ""
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Second-step MFA state. When the API responds with `code: "mfa_required"`,
  // we swap to a 6-digit code form without leaving the page — the user's
  // email and password are done with.
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [useScratchCode, setUseScratchCode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      // MFA enrolment required (admin in mfa-required tenant, not enrolled).
      if (res.status === 412 && data?.code === "mfa_enrollment_required" && data.mfaEnrolmentToken) {
        router.push(`/mfa/enrol?token=${encodeURIComponent(data.mfaEnrolmentToken)}`);
        return;
      }

      // MFA second-step required — swap to code form.
      if (res.ok && data?.code === "mfa_required" && data.mfaPendingToken) {
        setMfaPendingToken(data.mfaPendingToken);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push("/workspace");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaPendingToken) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mfaPendingToken,
          code: mfaCode.trim(),
          useScratchCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        return;
      }
      router.push("/workspace");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (mfaPendingToken) {
    return (
      <form onSubmit={handleMfaSubmit} className="space-y-3" noValidate>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Enter the {useScratchCode ? "backup code" : "6-digit code from your authenticator app"}.
        </p>
        <div>
          <label
            htmlFor="mfa-code"
            className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
          >
            {useScratchCode ? "Backup code" : "Authentication code"}
          </label>
          <input
            id="mfa-code"
            inputMode={useScratchCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            autoFocus
            value={mfaCode}
            onChange={(e) =>
              setMfaCode(
                useScratchCode
                  ? e.target.value.toUpperCase().slice(0, 11)
                  : e.target.value.replace(/\D/g, "").slice(0, 6),
              )
            }
            placeholder={useScratchCode ? "AB2-CD3-EF4" : "000000"}
            className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
            style={{ fontSize: "1rem", letterSpacing: "0.18em" }}
          />
        </div>
        {error && (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || mfaCode.length < (useScratchCode ? 9 : 6)}
          aria-busy={loading}
          className="mt-1 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium text-white transition-colors duration-200 hover:bg-[var(--cta-hover)] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "Verifying\u2026" : "Verify"}
        </button>
        <button
          type="button"
          onClick={() => {
            setUseScratchCode((v) => !v);
            setMfaCode("");
            setError("");
          }}
          className="mt-3 w-full text-center text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--brand)]"
        >
          {useScratchCode ? "Use authenticator code instead" : "Use a backup code"}
        </button>
      </form>
    );
  }

  return (
    <>
      <GoogleSignInButton />

      <div className="flex items-center gap-3 my-4">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="text-xs text-[var(--text-disabled)]">or</span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

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

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 pr-11 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
              style={{ fontSize: "1rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-[13px] transition-colors"
              style={{ color: "var(--text-disabled)" }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
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
          {loading ? "Logging in\u2026" : "Log in"}
        </button>

        <p className="mt-3 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--brand)]"
          >
            Forgot your password?
          </Link>
        </p>

      </form>

    </>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Welcome back
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Log in to Larry</h1>
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
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand)]"
          >
            Create account
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
