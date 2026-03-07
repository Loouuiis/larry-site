"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface FeedItem {
  id: number;
  type: "capture" | "extract" | "assign" | "remind" | "escalate" | "compile";
  message: string;
}

const FEED_SEQUENCE: Omit<FeedItem, "id">[] = [
  { type: "capture",  message: "Slack thread captured — #alpha-launch sync notes" },
  { type: "extract",  message: "Task extracted → Prepare stakeholder status update" },
  { type: "assign",   message: "Ownership assigned → @Morgan, due Friday" },
  { type: "remind",   message: "Reminder sent to 3 team members" },
  { type: "escalate", message: "Risk flagged — API handoff 2 days overdue" },
  { type: "compile",  message: "Executive summary ready for review" },
];

const TYPE_COLOR: Record<FeedItem["type"], string> = {
  capture:  "bg-neutral-400",
  extract:  "bg-[#2e7d4f]",
  assign:   "bg-blue-400",
  remind:   "bg-amber-400",
  escalate: "bg-red-400",
  compile:  "bg-[#2e7d4f]",
};

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Ambient execution feed — shows Larry working in the background.
 * A new action surfaces every 2.8 s; only the latest 3 are shown.
 * Motion is slow, deliberate, and elegant — not a demo.
 */
export function AmbientFeed() {
  const [items, setItems] = useState<FeedItem[]>([
    { ...FEED_SEQUENCE[0], id: 0 },
  ]);
  const [index, setIndex] = useState(1);
  const [uid, setUid] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setItems((prev) => {
        const next: FeedItem = {
          ...FEED_SEQUENCE[index % FEED_SEQUENCE.length],
          id: uid,
        };
        // Keep only the latest 3 entries
        const updated = [next, ...prev].slice(0, 3);
        return updated;
      });
      setIndex((i) => i + 1);
      setUid((u) => u + 1);
    }, 2800);

    return () => clearInterval(interval);
  }, [index, uid]);

  return (
    <div className="space-y-1.5 overflow-hidden" aria-live="polite" aria-label="Larry activity feed">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, i) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{
              opacity: i === 0 ? 1 : 0.45 - i * 0.1,
              y: 0,
              scale: 1,
            }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.25 } }}
            transition={{ duration: 0.5, ease: PREMIUM_EASE }}
            className="flex items-center gap-2.5"
          >
            {/* Type indicator dot */}
            <span
              className={`shrink-0 h-1.5 w-1.5 rounded-full ${TYPE_COLOR[item.type]} ${
                i === 0 ? "live-pulse" : ""
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-[11px] leading-tight truncate ${
                i === 0 ? "text-neutral-700 font-medium" : "text-neutral-400"
              }`}
            >
              {item.message}
            </span>
            {i === 0 && (
              <span className="ml-auto shrink-0 text-[10px] text-neutral-300 font-medium">
                now
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
