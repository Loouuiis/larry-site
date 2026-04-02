"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WaitlistForm } from "./WaitlistForm";
import { FounderContact } from "./FounderContact";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlayType = "waitlist" | "founders";

interface LiquidOverlayProps {
  type: OverlayType;
  /** Center of the triggering button, in viewport coordinates */
  origin: { x: number; y: number };
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;

// Clip-path origin as viewport-percentage strings
function toPercent(px: number, total: number) {
  return `${((px / total) * 100).toFixed(2)}%`;
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

function Overlay({ type, origin, onClose }: LiquidOverlayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Derived clip-path origins
  const ox = typeof window !== "undefined" ? toPercent(origin.x, window.innerWidth) : "50%";
  const oy = typeof window !== "undefined" ? toPercent(origin.y, window.innerHeight) : "50%";

  // Lock body scroll; restore on unmount
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Auto-focus the close button for keyboard accessibility
    firstFocusRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Click outside the panel closes (backdrop click)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isWaitlist = type === "waitlist";
  const title = isWaitlist ? "Join the Waitlist" : "Speak to the Founders";
  const subtitle = isWaitlist
    ? "Early access. Priority onboarding. Direct input into the roadmap."
    : "Tell us about your team. Larry will draft the introduction.";

  return (
    <motion.div
      // Bubble expansion — clip-path circle grows from the button origin.
      // 200vmax covers any screen diagonal; easing is physical, not springy.
      initial={{ clipPath: `circle(0px at ${ox} ${oy})` }}
      animate={{ clipPath: `circle(200vmax at 50% 50%)` }}
      exit={{ clipPath: `circle(0px at ${ox} ${oy})` }}
      transition={{ duration: 0.55, ease: EASE }}
      style={{
        position: "fixed",
        inset: 0,
        // Below cursor (10001) and WelcomeSplash (10000) stays beneath; sits above page content
        zIndex: 9999,
        // Very subtle dark tint — just enough to signal modal state without hiding the page
        background: "rgba(15, 15, 12, 0.08)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        willChange: "clip-path",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Content fades in slightly after the bubble expands */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
        className="flex min-h-full w-full items-start justify-center px-3 py-6 sm:items-center sm:px-4 sm:py-12"
        ref={scrollRef}
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Floating glass panel — click inside does not close */}
        <div
          className="w-full max-w-lg rounded-xl overflow-hidden max-h-[92vh] overflow-y-auto sm:max-h-[85vh]"
          style={{
            background: "rgba(247, 247, 244, 0.78)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
            // iOS Safari: enables momentum scrolling inside the panel
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            WebkitOverflowScrolling: "touch" as any,
            overscrollBehavior: "contain",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 sm:p-8">
            {/* Header row */}
            <div className="mb-6 flex items-center justify-between sm:mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-disabled)]">
                  {isWaitlist ? "Early access" : "Get in touch"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[var(--text-1)] sm:text-2xl">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
              </div>
              <button
                ref={firstFocusRef}
                onClick={onClose}
                className={[
                  "ml-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                  "border border-[var(--border)] bg-white/60 text-[var(--text-disabled)]",
                  "transition-colors duration-200 hover:border-[var(--border)] hover:text-[var(--text-2)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-1)] focus-visible:ring-offset-2",
                ].join(" ")}
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Form content */}
            {isWaitlist ? <WaitlistForm /> : <FounderContact />}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Manager — listens for global overlay:open events ────────────────────────

interface OverlayState {
  type: OverlayType;
  origin: { x: number; y: number };
}

export function OverlayManager() {
  const [state, setState] = useOverlayState();

  useEffect(() => {
    const handler = (e: Event) => {
      const { type, rect } = (e as CustomEvent<{ type: OverlayType; rect: DOMRect }>).detail;
      setState({
        type,
        origin: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      });
    };
    document.addEventListener("overlay:open", handler);
    return () => document.removeEventListener("overlay:open", handler);
  }, [setState]);

  return (
    <AnimatePresence mode="wait">
      {state && (
        <Overlay
          key={state.type}
          type={state.type}
          origin={state.origin}
          onClose={() => setState(null)}
        />
      )}
    </AnimatePresence>
  );
}

// ─── Minimal state hook (avoids external context) ────────────────────────────

import { useState, type Dispatch, type SetStateAction } from "react";

function useOverlayState(): [OverlayState | null, Dispatch<SetStateAction<OverlayState | null>>] {
  return useState<OverlayState | null>(null);
}

// ─── Trigger hook — used by buttons ──────────────────────────────────────────

export function useOverlayTrigger(type: OverlayType) {
  return (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    document.dispatchEvent(
      new CustomEvent("overlay:open", { detail: { type, rect } })
    );
  };
}
