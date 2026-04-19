"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";

interface EnrolmentResponse {
  secret: string;
  otpauthUrl: string;
}

interface ConfirmResponse {
  success: boolean;
  scratchCodes: string[];
  signedIn: boolean;
}

function MfaSetupForm({ autoStart }: { autoStart: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The login page passes ?token=... when the user was sent here because
  // their tenant requires MFA for admins and they aren't enrolled yet.
  const enrolmentToken = searchParams.get("token") ?? undefined;

  const [phase, setPhase] = useState<"start" | "scan" | "codes">("start");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [scratchCodes, setScratchCodes] = useState<string[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const startEnrolment = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          enrolmentToken ? { mfaEnrolmentToken: enrolmentToken } : {},
        ),
      });
      const data = (await res.json()) as EnrolmentResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start enrolment.");
        return;
      }
      setSecret(data.secret);
      const qr = await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 240 });
      setQrDataUrl(qr);
      setPhase("scan");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [enrolmentToken]);

  useEffect(() => {
    if (autoStart && phase === "start" && !loading && !secret) {
      void startEnrolment();
    }
  }, [autoStart, phase, loading, secret, startEnrolment]);

  async function confirmEnrolment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/enrol/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          ...(enrolmentToken ? { mfaEnrolmentToken: enrolmentToken } : {}),
        }),
      });
      const data = (await res.json()) as ConfirmResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Invalid code.");
        return;
      }
      setScratchCodes(data.scratchCodes ?? []);
      setSignedIn(Boolean(data.signedIn));
      setPhase("codes");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (signedIn) {
      router.push("/workspace");
    } else {
      router.push("/workspace/settings");
    }
  }

  return (
    <div className="w-full max-w-md">
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
        style={{ boxShadow: "var(--shadow-2)" }}
      >
        <h1 className="mb-1 text-xl font-bold tracking-tight text-[var(--text-1)]">
          Two-factor authentication
        </h1>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          {phase === "start" &&
            "Protect your account with a 6-digit code from your authenticator app."}
          {phase === "scan" &&
            "Scan this QR code with Google Authenticator, 1Password, Authy, or similar."}
          {phase === "codes" &&
            "MFA is enabled. Save your backup codes somewhere safe — they let you sign in if you lose your device."}
        </p>

        {phase === "start" && (
          <button
            type="button"
            onClick={startEnrolment}
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--cta)] px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-[var(--cta-hover)] disabled:opacity-50"
          >
            {loading ? "Starting\u2026" : "Begin enrolment"}
          </button>
        )}

        {phase === "scan" && (
          <form onSubmit={confirmEnrolment} className="space-y-4">
            {qrDataUrl && (
              <div className="flex justify-center rounded-lg border border-[var(--border)] bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="TOTP QR code" width={240} height={240} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-2)]">
                Can&apos;t scan? Enter this key manually
              </label>
              <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-1)]">
                {secret}
              </code>
            </div>
            <div>
              <label
                htmlFor="mfa-code"
                className="mb-1.5 block text-xs font-medium text-[var(--text-2)]"
              >
                6-digit code
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-1)] placeholder:text-[var(--text-disabled)] outline-none transition-colors duration-150 focus:border-[var(--border-2)] focus:bg-[var(--surface)]"
                style={{ fontSize: "1rem", letterSpacing: "0.25em" }}
              />
            </div>
            {error && (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--cta)] px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-[var(--cta-hover)] disabled:opacity-50"
            >
              {loading ? "Verifying\u2026" : "Verify and enable"}
            </button>
          </form>
        )}

        {phase === "codes" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Backup codes
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm text-[var(--text-1)]">
                {scratchCodes.map((c) => (
                  <div key={c} className="rounded bg-[var(--surface)] px-2 py-1">
                    {c}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Each code works once. Store them in your password manager —
                you won&apos;t see this screen again.
              </p>
            </div>
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--cta)] px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-[var(--cta-hover)]"
            >
              I&apos;ve saved my codes
            </button>
          </div>
        )}

        {phase === "start" && error && (
          <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function MfaSetup({ autoStart = false }: { autoStart?: boolean }) {
  return (
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
      <MfaSetupForm autoStart={autoStart} />
    </Suspense>
  );
}
