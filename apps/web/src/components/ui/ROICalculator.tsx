"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN = 0;
const MAX = 1000;
const DEFAULT = 200;
const STEP = 5;

// Larry takes over this fraction of coordination/admin work.
// Fixed assumption — not configurable by the user, stated once as a claim.
const AUTOMATION_RATE = 0.2;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ROICalculator
 *
 * Architecture decisions:
 *
 * STATE: A single useState for `hours`. `savedHours` is derived inline —
 *   no second state variable, no useReducer complexity. One source of truth.
 *
 * ANIMATION: Framer Motion's `animate` utility (not a component) writes
 *   directly to the DOM node via `node.textContent`. Zero React re-renders
 *   during the count animation. The slider triggers one re-render; after
 *   that, the RAF-driven animation runs entirely outside React's cycle.
 *
 * INITIAL VALUE: `useLayoutEffect` sets the span's text before first paint,
 *   matching the server-rendered empty span (suppressed via
 *   `suppressHydrationWarning`). No flash.
 *
 * SLIDER FILL: Inline style with a linear-gradient keyed to `fillPct`.
 *   Requires no JavaScript per frame — computed once on render, applied as
 *   a static CSS value until the next interaction.
 *
 * STEP=5: Reduces rapid-fire effect calls during fast drags while the
 *   animation covers intermediate values visually. Each step = 1 saved hour
 *   (5 × 0.20), so the output always increments in clean whole numbers.
 *
 * ACCESSIBILITY: Native <input type="range"> — keyboard arrow keys work
 *   out of the box. aria-* attributes mirror the visual state. The result
 *   span has aria-live="polite" so screen readers announce changes without
 *   interrupting ongoing speech.
 */
export function ROICalculator() {
  const [hours, setHours] = useState(DEFAULT);
  const savedHours = Math.round(hours * AUTOMATION_RATE);

  // DOM node that the animation writes to — never re-rendered by React
  const numRef = useRef<HTMLSpanElement>(null);

  // Tracks the last value the animation ended on, so the next animation
  // starts from the current visible number, not the stale React state.
  const prevSavedRef = useRef(Math.round(DEFAULT * AUTOMATION_RATE));
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);

  // Set initial DOM content before first paint.
  // useLayoutEffect is client-only — paired with suppressHydrationWarning
  // on the span to silence the server/client mismatch warning.
  useLayoutEffect(() => {
    if (numRef.current) {
      numRef.current.textContent = String(prevSavedRef.current);
    }
  }, []);

  // Animate to the new saved value whenever the slider changes.
  useEffect(() => {
    const node = numRef.current;
    if (!node) return;

    const from = prevSavedRef.current;
    const to = savedHours;
    prevSavedRef.current = to;

    // Cancel any in-flight animation — start from wherever it currently is
    if (animationRef.current) animationRef.current.stop();

    animationRef.current = animate(from, to, {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (node) node.textContent = String(Math.round(v));
      },
    });

    return () => {
      animationRef.current?.stop();
    };
  }, [savedHours]);

  // CSS gradient fill percentage for the slider track
  const fillPct = (hours / MAX) * 100;

  return (
    <div
      className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-8 lg:p-10"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 max-w-lg sm:mb-8">
        <h3 className="text-base font-semibold tracking-tight text-neutral-900 sm:text-xl">
          See how much time you can reclaim
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500 sm:mt-2 sm:text-sm">
          If Larry automates 20% of coordination and admin work, how much time
          does that free up across your project?
        </p>
      </div>

      {/* Slider ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 sm:mb-8">
        {/* Use flex-wrap to gracefully handle very narrow containers */}
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:mb-4">
          <label
            htmlFor="roi-hours"
            className="shrink-0 text-xs font-semibold uppercase tracking-widest text-neutral-400"
          >
            Project hours
          </label>
          <span className="text-sm font-semibold tabular-nums text-neutral-700">
            {hours === 0 ? "—" : `${hours.toLocaleString()} hrs`}
          </span>
        </div>

        <input
          id="roi-hours"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="roi-slider w-full"
          aria-label="Project hours"
          aria-valuenow={hours}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          style={{
            background: `linear-gradient(to right, #7C6BFF 0%, #7C6BFF ${fillPct}%, #e5e7eb ${fillPct}%, #e5e7eb 100%)`,
          }}
        />

        <div className="mt-2.5 flex justify-between">
          <span className="text-xs tabular-nums text-neutral-300">0</span>
          <span className="text-xs tabular-nums text-neutral-300">1,000 hrs</span>
        </div>
      </div>

      {/* Result ──────────────────────────────────────────────────────────── */}
      <div className="border-t border-neutral-100 pt-6 sm:pt-8">
        <p className="mb-2 text-xs text-neutral-400 sm:mb-3 sm:text-sm">Larry will save you</p>

        <div className="flex items-end gap-2 leading-none">
          {/*
           * suppressHydrationWarning: server renders an empty span;
           * useLayoutEffect sets the initial text client-side before paint.
           * aria-live="polite" announces changes to screen readers without
           * interrupting ongoing speech.
           */}
          <span
            ref={numRef}
            suppressHydrationWarning
            aria-live="polite"
            aria-atomic="true"
            className="text-[3.25rem] font-bold leading-none tracking-tight tabular-nums text-neutral-900"
          />
          <span className="mb-1.5 text-xl font-semibold text-neutral-400">
            hours.
          </span>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-neutral-500">
          That&apos;s time your team can spend delivering outcomes —{" "}
          not coordinating around them.
        </p>
      </div>
    </div>
  );
}
