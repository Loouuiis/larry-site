"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  BARS,
  LANES,
  LOOP_SECONDS,
  NOTIFICATIONS,
  type BarState,
  type Notification,
  type TaskBar,
} from "./ExecutionTimeline.data";

const BAR_COLOR: Record<BarState, string> = {
  "in-progress": "#f59e0b",
  complete: "#10b981",
  overdue: "#ef4444",
  escalated: "#f59e0b",
};

const DOT_COLOR = {
  brand: "#6c44f6",
  amber: "#f59e0b",
  red: "#ef4444",
} as const;

function currentBarState(bar: TaskBar, t: number): BarState {
  if (!bar.transitions) return bar.state;
  let s = bar.state;
  for (const tr of bar.transitions) {
    if (t >= tr.at) s = tr.to;
  }
  return s;
}

export function ExecutionTimeline() {
  const reducedMotion = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const elapsed = ((now - start) / 1000) % LOOP_SECONDS;
      setTick(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  // For reduced motion: freeze at t=10s (steady-state frame).
  const t = reducedMotion ? 10 : tick;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.92, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-5xl mx-auto rounded-2xl border border-[var(--border)] bg-[rgba(248,247,255,0.8)] backdrop-blur-sm overflow-hidden"
      role="img"
      aria-label="Larry execution activity — animated timeline"
    >
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div
            className="h-3.5 w-3.5 rounded-sm bg-[#6c44f6] grid place-items-center text-white text-[9px] font-bold"
            aria-hidden="true"
          >
            L
          </div>
          <span className="text-[10px] font-semibold tracking-[0.16em] text-[var(--text-disabled)]">
            LARRY — LIVE
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-disabled)]">3 projects active</span>
      </div>

      <div className="absolute top-12 right-4 sm:right-6 z-10 flex flex-col items-end gap-2 pointer-events-none">
        {NOTIFICATIONS.map((n) => {
          const visible = t >= n.tShow && t < n.tHide;
          return <NotificationBubble key={n.id} n={n} visible={visible} />;
        })}
      </div>

      <div className="divide-y divide-[var(--border)]">
        {LANES.map((lane) => (
          <div
            key={lane.id}
            className="relative flex items-center gap-4 px-4 sm:px-6 py-3 min-h-[48px]"
          >
            <span className="text-[9px] font-semibold tracking-[0.14em] text-[var(--text-disabled)] w-[120px] shrink-0">
              {lane.label}
            </span>
            <div className="relative flex-1 h-5">
              {BARS.filter((b) => b.lane === lane.id).map((bar) => (
                <Bar key={bar.id} bar={bar} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Bar({ bar, t }: { bar: TaskBar; t: number }) {
  const visible = t >= bar.tAppear;
  if (!visible) return null;
  const growT = Math.min(1, (t - bar.tAppear) / bar.tGrow);
  const widthPct = bar.width * growT;
  const state = currentBarState(bar, t);
  const color = BAR_COLOR[state];
  const pulsing = state === "overdue";

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.5 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "absolute",
        left: `${bar.left}%`,
        width: `${widthPct}%`,
        height: "100%",
        backgroundColor: color,
        borderRadius: 4,
        transformOrigin: "left center",
      }}
      className={pulsing ? "live-pulse" : ""}
    >
      {state === "complete" && (
        <svg
          viewBox="0 0 24 24"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </motion.div>
  );
}

function NotificationBubble({ n, visible }: { n: Notification; visible: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : -8,
      }}
      transition={{ duration: reducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-lg px-3 py-1.5 shadow-sm text-[10px] sm:text-xs text-[var(--text-2)] max-w-[300px]"
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: DOT_COLOR[n.dot] }}
      />
      {n.text}
    </motion.div>
  );
}
