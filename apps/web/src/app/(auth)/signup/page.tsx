"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SHOW_DEV_LOGIN = process.env.NEXT_PUBLIC_SHOW_DEV_LOGIN === "true";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, confirmPassword }),
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

  async function handleDevBypass() {
    setError("");
    setDevLoading(true);
    try {
      const res = await fetch("/api/auth/dev-login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Dev bypass failed.");
        return;
      }
      router.push("/workspace");
    } catch {
      setError("Dev bypass failed. Please try again.");
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-3xl border border-neutral-200/80 bg-white p-8"
        style={{
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
            Get started
          </p>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">Create your account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-neutral-600">
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
              className="min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors duration-150 focus:border-neutral-400 focus:bg-white"
              style={{ fontSize: "1rem" }}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-neutral-600">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors duration-150 focus:border-neutral-400 focus:bg-white"
              style={{ fontSize: "1rem" }}
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-neutral-600">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors duration-150 focus:border-neutral-400 focus:bg-white"
              style={{ fontSize: "1rem" }}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="mt-1 inline-flex h-[2.75rem] w-full items-center justify-center rounded-full border border-neutral-900 bg-transparent px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-neutral-900 transition-colors duration-200 hover:bg-neutral-900 hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          {SHOW_DEV_LOGIN && (
            <button
              type="button"
              onClick={handleDevBypass}
              disabled={devLoading}
              className="inline-flex h-[2.5rem] w-full items-center justify-center rounded-full border border-neutral-300 bg-white px-6 text-sm font-medium text-neutral-700 transition-colors duration-200 hover:border-neutral-900 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-50"
            >
              {devLoading ? "Opening dashboard…" : "Enter Dashboard (Dev)"}
            </button>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-neutral-900 underline underline-offset-2 transition-colors hover:text-neutral-600"
          >
            Log in
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-neutral-400">
        <Link href="/" className="transition-colors hover:text-neutral-600">
          {"<-"} Back to Larry
        </Link>
      </p>
    </div>
  );
}
