"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

interface ReferralModalProps {
  onClose: () => void;
}

export function ReferralModal({ onClose }: ReferralModalProps) {
  const [copied, setCopied] = useState(false);
  const [signupUrl, setSignupUrl] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSignupUrl(`${window.location.origin}/signup`);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(signupUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AnimatePresence>
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

          {/* Body */}
          <p className="mb-4 text-sm text-neutral-500">
            Share this link with anyone you'd like to invite.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <span className="flex-1 truncate font-mono text-xs text-neutral-500">
              {signupUrl}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
