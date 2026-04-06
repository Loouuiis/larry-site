"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";

export function VerificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setSent(true);
      }
    } catch {
      // Silently fail — user can try again
    } finally {
      setResending(false);
    }
  }, []);

  if (dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{ backgroundColor: "rgba(108, 68, 246, 0.1)" }}
    >
      <p className="min-w-0 text-[var(--text-2)]">
        {sent ? (
          "Verification email sent! Check your inbox."
        ) : (
          <>
            Verify your email to unlock all features.{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-medium text-[#6c44f6] underline underline-offset-2 transition-colors hover:text-[#5835d4] disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend verification email"}
            </button>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5"
        aria-label="Dismiss"
      >
        <X size={14} className="text-[var(--text-muted)]" />
      </button>
    </div>
  );
}
