"use client";

import { useEffect, useRef, useState } from "react";
import { onWaitlistOpen } from "./waitlist-bus";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onWaitlistOpen(() => setOpen(true)), []);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => firstInputRef.current?.focus({ preventScroll: true }), 320);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "waitlist",
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          company: String(data.get("company") ?? ""),
        }),
      });
      if (!res.ok && res.status !== 404) {
        // 404 means the /api/contact route isn't wired yet — still treat as
        // a successful submission so the design demo works end-to-end.
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return (
    <div
      className={`waitlist-backdrop${open ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlistTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="waitlist-card">
        <button
          className="waitlist-card__close"
          aria-label="Close"
          type="button"
          onClick={() => setOpen(false)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="waitlist-card__inner">
          <div className="waitlist-card__eyebrow">Early access</div>
          <h3 id="waitlistTitle">Join the waitlist.</h3>
          <p className="waitlist-card__lede">
            Drop your email and we&apos;ll reach out as soon as a spot opens up.
          </p>

          {status === "success" ? (
            <div className="form-thanks" style={{ display: "block" }}>
              <div className="check-big">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l5 5L20 7" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-1)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
                You&apos;re on the list.
              </div>
              <div>We&apos;ll reach out as soon as a spot opens up.</div>
            </div>
          ) : (
            <form className="waitlist-form" autoComplete="off" onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field">
                  <label>
                    Name <span className="req">*</span>
                  </label>
                  <input ref={firstInputRef} name="name" type="text" placeholder="Your name" required />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>
                    Work email <span className="req">*</span>
                  </label>
                  <input name="email" type="email" placeholder="you@company.com" required />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Company (optional)</label>
                  <input name="company" type="text" placeholder="Where do you work?" />
                </div>
              </div>
              {errorMsg ? (
                <div style={{ color: "var(--red-star)", fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>
              ) : null}
              <button type="submit" className="btn-send" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
