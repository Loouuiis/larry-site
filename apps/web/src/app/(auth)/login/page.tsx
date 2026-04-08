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
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
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
