"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type ConfirmState = "loading" | "success" | "error";

function ConfirmEmailChangeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<ConfirmState>(token ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Invalid confirmation link. No token provided."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function confirm() {
      try {
        const res = await fetch("/api/auth/confirm-email-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setState("success");
          setTimeout(() => {
            router.push("/workspace/settings/account");
          }, 2000);
        } else {
          const data = await res.json();
          setState("error");
          setErrorMessage(
            data.error ?? data.message ?? "Invalid or expired confirmation link."
          );
        }
      } catch {
        if (cancelled) return;
        setState("error");
        setErrorMessage("Network error. Please check your connection.");
      }
    }

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--text-disabled)" }}
        />
        <p className="mt-4 text-sm text-[var(--text-2)]">
          Confirming your new email...
        </p>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
          <p className="text-sm font-medium text-[var(--text-1)]">
            Email changed!
          </p>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Your email has been updated successfully. Redirecting to account
            settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
        <p className="text-sm font-medium text-[var(--text-1)]">
          Confirmation failed
        </p>
        <p className="mt-1 text-sm text-[var(--text-2)]">{errorMessage}</p>
      </div>

      <Link
        href="/workspace/settings/account"
        className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-lg border-none bg-[var(--cta)] px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-white transition-colors duration-200 hover:bg-[var(--cta-hover)]"
      >
        Back to account settings
      </Link>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <div className="mb-7">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
            Account settings
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-1)]">
            Confirm email change
          </h1>
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
          <ConfirmEmailChangeForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          <Link
            href="/workspace/settings/account"
            className="font-medium text-[var(--brand)] underline underline-offset-2 transition-colors hover:text-[var(--brand-hover)]"
          >
            Back to settings
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        <Link
          href="/"
          className="transition-colors hover:text-[var(--text-2)]"
        >
          {"<-"} Back to Larry
        </Link>
      </p>
    </div>
  );
}
