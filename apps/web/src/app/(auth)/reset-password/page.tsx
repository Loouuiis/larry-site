"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

function PasswordStrengthMeter({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Number", pass: /[0-9]/.test(password) },
    { label: "Special character", pass: /[^a-zA-Z0-9]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const strength = password.length === 0 ? 0 : passed;

  const barColor =
    strength <= 1 ? "var(--text-disabled)" :
    strength === 2 ? "#e5a100" :
    strength === 3 ? "#c78f00" :
    "#22c55e";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors duration-200"
            style={{
              backgroundColor: i <= strength ? barColor : "var(--border)",
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className="text-[11px] transition-colors duration-150"
            style={{ color: c.pass ? "#22c55e" : "var(--text-disabled)" }}
          >
            {c.pass ? "\u2713" : "\u2022"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
          <p className="text-sm font-medium text-[var(--text-1)]">Invalid reset link</p>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            This password reset link is invalid or missing. Please request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="mt-2 inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)]"
        >
          Request new reset link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push("/login?reset=success");
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
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
        <PasswordStrengthMeter password={password} />
      </div>

      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 pr-11 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
            style={{ fontSize: "1rem" }}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
            style={{ color: "var(--text-disabled)" }}
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
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
        {loading ? "Resetting..." : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">Set a new password</h1>
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
          <ResetPasswordForm />
        </Suspense>

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
