"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Status = "idle" | "submitting" | "success" | "error";

const COUNTRIES = [
  { code: "+1", flag: "🇺🇸" },
  { code: "+44", flag: "🇬🇧" },
  { code: "+353", flag: "🇮🇪" },
  { code: "+46", flag: "🇸🇪" },
  { code: "+49", flag: "🇩🇪" },
  { code: "+33", flag: "🇫🇷" },
  { code: "+34", flag: "🇪🇸" },
  { code: "+39", flag: "🇮🇹" },
  { code: "+31", flag: "🇳🇱" },
  { code: "+47", flag: "🇳🇴" },
  { code: "+45", flag: "🇩🇰" },
  { code: "+358", flag: "🇫🇮" },
  { code: "+61", flag: "🇦🇺" },
  { code: "+91", flag: "🇮🇳" },
];

const REFERRALS = [
  "LinkedIn",
  "Friend or Colleague",
  "Press",
  "Event or Conference",
  "Podcast",
  "Social Media",
  "Search Engine",
  "Other",
];

export function BookDemoForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const params = useSearchParams();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const prefill = params.get("msg");
    if (prefill && messageRef.current) {
      messageRef.current.value = prefill;
      messageRef.current.focus();
    }
  }, [params]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "demo",
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: `${String(data.get("phone_cc") ?? "")} ${String(data.get("phone") ?? "")}`.trim(),
          company: String(data.get("company") ?? ""),
          role: String(data.get("role") ?? ""),
          referral: String(data.get("referral") ?? ""),
          message: String(data.get("message") ?? ""),
        }),
      });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }
      setStatus("success");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    }
  };

  if (status === "success") {
    return (
      <div className="form-thanks" style={{ display: "block" }}>
        <div className="check-big">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l5 5L20 7" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-1)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          Got it — thank you.
        </div>
        <div>We read every message and will be in touch shortly.</div>
      </div>
    );
  }

  return (
    <form autoComplete="off" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="field">
          <label>
            Name <span className="req">*</span>
          </label>
          <input name="name" type="text" placeholder="Your name" required />
        </div>
      </div>

      <div className="form-row form-row--2">
        <div className="field">
          <label>
            Email <span className="req">*</span>
          </label>
          <input name="email" type="email" placeholder="you@company.com" required />
        </div>
        <div className="field">
          <label>Phone</label>
          <div className="phone-input">
            <select name="phone_cc" aria-label="Country code" defaultValue="+353">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code}
                </option>
              ))}
            </select>
            <input name="phone" type="tel" placeholder="Phone number" />
          </div>
        </div>
      </div>

      <div className="form-row form-row--2">
        <div className="field">
          <label>
            Company name <span className="req">*</span>
          </label>
          <input name="company" type="text" placeholder="Company name" required />
        </div>
        <div className="field">
          <label>Your role</label>
          <input name="role" type="text" placeholder="e.g. Manager, Consultant, COO" />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>
            How did you hear about us? <span className="req">*</span>
          </label>
          <select name="referral" required defaultValue="">
            <option value="" disabled />
            {REFERRALS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label>Message (Optional)</label>
          <textarea
            ref={messageRef}
            name="message"
            placeholder="Share your needs or questions…"
          />
        </div>
      </div>

      {errorMsg ? (
        <div style={{ color: "var(--red-star)", fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>
      ) : null}

      <button type="submit" className="btn-send" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export function ReachOutForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "reach-out",
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          message: String(data.get("message") ?? ""),
        }),
      });
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }
      setStatus("success");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    }
  };

  if (status === "success") {
    return (
      <div className="form-thanks" style={{ display: "block" }}>
        <div className="check-big">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l5 5L20 7" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-1)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          Thanks — message received.
        </div>
        <div>We&apos;ll get back to you personally.</div>
      </div>
    );
  }

  return (
    <form autoComplete="off" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="field">
          <label>
            Name <span className="req">*</span>
          </label>
          <input name="name" type="text" placeholder="Your name" required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>
            Email <span className="req">*</span>
          </label>
          <input name="email" type="email" placeholder="you@email.com" required />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>
            Message <span className="req">*</span>
          </label>
          <textarea name="message" placeholder="Tell us about yourself…" required />
        </div>
      </div>

      {errorMsg ? (
        <div style={{ color: "var(--red-star)", fontSize: 13, marginBottom: 12 }}>{errorMsg}</div>
      ) : null}

      <button type="submit" className="btn-send" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
