"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;
const SIGNUP_URL = `${typeof window !== "undefined" ? window.location.origin : "https://larry-site.vercel.app"}/signup`;

type Tab = "link" | "email";

interface ReferralModalProps {
  onClose: () => void;
}

export function ReferralModal({ onClose }: ReferralModalProps) {
  const [tab, setTab] = useState<Tab>("link");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(SIGNUP_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setSent(true);
      setEmail("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        ref={overlayRef}
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.18)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        {/* Panel */}
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="w-full max-w-md rounded-3xl border border-neutral-200/80 bg-white p-7"
          style={{
            boxShadow: "0 32px 80px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.05)",
          }}
        >
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                Invite
              </p>
              <h2 className="text-lg font-bold tracking-tight text-neutral-900">
                Refer a Friend
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-5 flex gap-1 rounded-xl bg-neutral-100 p-1">
            {(["link", "email"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSent(false); setError(""); }}
                className={[
                  "flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200",
                  tab === t
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700",
                ].join(" ")}
              >
                {t === "link" ? "Copy Link" : "Send by Email"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "link" && (
            <div>
              <p className="mb-3 text-sm text-neutral-500">
                Share this link with anyone you'd like to invite.
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <span className="flex-1 truncate text-xs text-neutral-500 font-mono">
                  {SIGNUP_URL}
                </span>
                <button
                  onClick={handleCopy}
                  className={[
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    copied
                      ? "bg-[#8b5cf6] text-white"
                      : "bg-neutral-900 text-white hover:bg-neutral-700",
                  ].join(" ")}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {tab === "email" && (
            <div>
              <p className="mb-3 text-sm text-neutral-500">
                We'll send them an invite with a link to create their account.
              </p>
              {sent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex flex-col items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 py-7 text-center"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8b5cf6]/10">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M3.5 9.5L7 13L14.5 5" stroke="#8b5cf6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-neutral-900">Invite sent!</p>
                  <button
                    onClick={() => setSent(false)}
                    className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-600"
                  >
                    Send another
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSend} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@company.com"
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors focus:border-neutral-400 focus:bg-white min-h-[44px]"
                    style={{ fontSize: "1rem" }}
                  />
                  {error && (
                    <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex h-[2.75rem] w-full items-center justify-center rounded-full border border-neutral-900 bg-transparent px-7 text-[0.9375rem] font-medium tracking-[-0.01em] text-neutral-900 transition-colors duration-200 hover:bg-neutral-900 hover:text-white disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {sending ? "Sending…" : "Send Invite"}
                  </button>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
