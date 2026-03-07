"use client";

import { useState, useEffect, useRef, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Drafted email content ────────────────────────────────────────────────────
// Tone: professional, concise, confident — written as if Larry drafted it
// on behalf of the visitor. Reveals at ~240 chars/sec (4 chars / 16ms frame).

const SUBJECT = "Introduction — exploring Larry for your team";

const EMAIL_BODY = `Hi,

I'm reaching out because someone from your team is interested in exploring what Larry can do for them.

They're dealing with the same coordination overhead that slows most project and operations teams — actions scattered across Slack and tickets, ownership gaps, follow-ups that never happen. They think Larry might close that gap.

A 30-minute call would be enough to understand their setup and outline what a structured pilot would look like.

Are you available this week or next?

— Larry
(on behalf of your team)`;

const CHARS_PER_FRAME = 4; // ~240 chars/sec at 60fps — rapid but readable

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-12 shrink-0 text-neutral-400">{label}</span>
      <span className="text-neutral-600">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FounderContact() {
  const uid = useId();

  // Typing animation state
  const [visibleChars, setVisibleChars] = useState(0);
  const [typingDone, setTypingDone] = useState(false);

  // Contact form state
  const [email, setEmail] = useState("");
  const [body, setBody] = useState(EMAIL_BODY);
  const [emailError, setEmailError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start typing animation on mount
  useEffect(() => {
    const total = EMAIL_BODY.length;
    intervalRef.current = setInterval(() => {
      setVisibleChars((prev) => {
        const next = Math.min(prev + CHARS_PER_FRAME, total);
        if (next >= total) {
          clearInterval(intervalRef.current!);
          setTypingDone(true);
        }
        return next;
      });
    }, 16);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    if (!email.trim()) {
      setEmailError("Required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Invalid email address");
      return;
    }
    setStatus("submitting");
    setServerError("");
    try {
      const res = await fetch("/api/founder-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message: body.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      setStatus("success");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-col items-center justify-center gap-6 py-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2e7d4f]/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 13L9 17L19 7" stroke="#2e7d4f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-neutral-900">Message sent.</p>
          <p className="mt-1.5 text-sm text-neutral-500">
            The founders will be in touch shortly.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Email input — shown immediately, feeds the From line */}
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-email`} className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Your email
        </label>
        <input
          id={`${uid}-email`}
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError("");
          }}
          inputMode="email"
          autoComplete="email"
          placeholder="you@yourcompany.com"
          className={[
            "w-full rounded-xl px-4 py-3 text-neutral-900 outline-none",
            "min-h-[44px]",
            "bg-white/30 backdrop-blur-sm",
            "border border-white/50",
            "placeholder:text-neutral-400 transition-all duration-200",
            "focus:bg-white/50 focus:border-white/70 focus:ring-1 focus:ring-white/40",
            emailError
              ? "border-red-300/60 focus:border-red-400/60 focus:ring-red-200/40"
              : "",
          ].join(" ")}
          // Explicit 16px prevents iOS Safari auto-zoom on focus
          style={{ fontSize: "1rem" }}
        />
        {emailError && (
          <p className="text-xs text-red-500">{emailError}</p>
        )}
      </div>

      {/* Drafted email panel */}
      <div
        className="rounded-2xl border border-white/50 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.35)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        {/* Email header — From line reflects typed email live */}
        <div className="border-b border-white/30 px-5 py-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2e7d4f] text-[8px] font-bold text-white select-none">
              L
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#2e7d4f]/70">
              Larry — Draft
            </span>
          </div>
          <EmailLine label="To" value="founders@larry.ai" />
          <EmailLine label="From" value={email.trim() || "you@yourcompany.com"} />
          <EmailLine label="Re" value={SUBJECT} />
        </div>

        {/* Body — animated pre during typing, editable textarea after */}
        <div className="px-5 py-4">
          {!typingDone ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-neutral-700 min-h-[140px] sm:min-h-[180px]">
              {EMAIL_BODY.slice(0, visibleChars)}
              <span
                aria-hidden="true"
                className="inline-block w-[2px] h-[1em] bg-neutral-400 align-[-0.05em] opacity-70"
                style={{ animation: "livePulse 1s ease-in-out infinite" }}
              />
            </pre>
          ) : (
            <motion.textarea
              key="editable-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={4000}
              className="w-full resize-none bg-transparent outline-none font-sans leading-relaxed text-neutral-700 placeholder:text-neutral-400"
              // Explicit 16px prevents iOS Safari auto-zoom on focus
              style={{ fontSize: "1rem" }}
            />
          )}
        </div>
      </div>

      {/* Actions — fade in after typing completes */}
      <AnimatePresence mode="wait">
        {typingDone && (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="space-y-3"
          >
            {serverError && (
              <p className="text-sm text-red-500">{serverError}</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={status === "submitting"}
                className={[
                  "flex-1 rounded-full border py-3 text-sm font-medium",
                  "min-h-[44px]",
                  "border-neutral-900 bg-transparent text-neutral-900",
                  "hover:bg-neutral-900 hover:text-white",
                  "transition-colors duration-200",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
                ].join(" ")}
              >
                {status === "submitting" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </span>
                ) : (
                  "Send to Founders"
                )}
              </button>

              <a
                href="https://calendly.com/larry-ai/intro"
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  "flex-1 rounded-full border py-3 text-center text-sm font-medium",
                  "min-h-[44px] flex items-center justify-center",
                  "border-white/50 bg-white/20 text-neutral-700",
                  "hover:bg-white/35 hover:border-white/60",
                  "transition-colors duration-200",
                ].join(" ")}
              >
                Book a call
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
