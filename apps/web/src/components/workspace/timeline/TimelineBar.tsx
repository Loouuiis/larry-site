"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { WorkspaceTimelineTask, TimelineMilestone } from "@/app/dashboard/types";
import {
  EASE, STATUS_COLOURS, PRIORITY_COLOURS,
  type TimelineRange, type ColourBy,
  parseDate, dateToPct, daysBetween,
} from "./timeline-utils";

interface TimelineBarProps {
  task: WorkspaceTimelineTask;
  range: TimelineRange;
  colourBy: ColourBy;
  isGroup: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function assigneeHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

function getBarColour(
  task: WorkspaceTimelineTask,
  colourBy: ColourBy,
): { bg: string; bgDark: string } {
  if (colourBy === "status") {
    const cfg = STATUS_COLOURS[task.status];
    return { bg: cfg.bg, bgDark: cfg.bgDark };
  }
  if (colourBy === "priority") {
    const c = PRIORITY_COLOURS[task.priority];
    return { bg: c, bgDark: c };
  }
  const hue = assigneeHue(task.assigneeName ?? task.assigneeUserId ?? "?");
  return { bg: hue, bgDark: hue };
}

export function TimelineBar({
  task, range, colourBy, isGroup, isSelected,
  isHighlighted, isDimmed, onClick, onMouseEnter, onMouseLeave,
}: TimelineBarProps) {
  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate) ?? parseDate(task.dueDate);
  if (!start || !end) return null;

  const leftPct = dateToPct(start, range);
  const widthPct = Math.max(
    (daysBetween(start, end) / range.totalDays) * 100,
    0.3,
  );
  const { bg, bgDark } = getBarColour(task, colourBy);
  const barH = isGroup ? 32 : 28;
  const progress = task.progressPercent ?? 0;

  const approxBarPx = (widthPct / 100) * range.totalDays * 30;
  const labelInside = approxBarPx > 120;

  const milestones = useMemo(() => {
    if (!task.milestones?.length) return [];
    const items = task.milestones
      .map((m) => {
        const d = parseDate(m.date);
        if (!d) return null;
        const pct = ((dateToPct(d, range) - leftPct) / widthPct) * 100;
        return { ...m, pct };
      })
      .filter(Boolean) as (TimelineMilestone & { pct: number })[];

    const clusters: { items: typeof items; pct: number }[] = [];
    for (const m of items.sort((a, b) => a.pct - b.pct)) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(m.pct - last.pct) < 8) {
        last.items.push(m);
        last.pct = (last.pct + m.pct) / 2;
      } else {
        clusters.push({ items: [m], pct: m.pct });
      }
    }
    return clusters;
  }, [task.milestones, range, leftPct, widthPct]);

  return (
    <div className="relative" style={{ height: barH + 8 }}>
      <motion.button
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: 1, opacity: isDimmed ? 0.3 : 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.03 }}
        className="absolute cursor-pointer overflow-hidden"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          top: 4,
          height: barH,
          borderRadius: 6,
          boxShadow: isSelected
            ? `0 0 0 2px rgba(108, 68, 246, 0.4)`
            : isHighlighted
            ? `0 0 0 2px rgba(108, 68, 246, 0.3)`
            : "none",
        }}
        aria-label={`${task.title}, ${STATUS_COLOURS[task.status].label}, ${progress}% complete`}
        role="button"
      >
        <div
          className="absolute inset-0"
          style={{ background: bg, opacity: 0.85 }}
        />

        {progress > 0 && (
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ background: bgDark }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: EASE }}
          />
        )}

        {labelInside && (
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
            <span
              className="text-[10px] font-semibold truncate drop-shadow-sm"
              style={{ color: STATUS_COLOURS[task.status].text }}
            >
              {task.title.length > 30 ? task.title.slice(0, 29) + "…" : task.title}
            </span>
          </div>
        )}

        {milestones.map((cluster, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
            style={{ left: `${cluster.pct}%` }}
            title={cluster.items.map((m) => m.title).join(", ")}
          >
            {cluster.items.length === 1 ? (
              <div
                className="h-2 w-2 rotate-45"
                style={{ background: "#ffffff", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
              />
            ) : (
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                {cluster.items.length}
              </span>
            )}
          </div>
        ))}
      </motion.button>

      {!labelInside && (
        <span
          className="absolute text-[10px] font-medium text-[var(--text-2)] truncate"
          style={{
            left: `calc(${leftPct + widthPct}% + 6px)`,
            top: barH / 2 - 2,
            maxWidth: 150,
            opacity: isDimmed ? 0.3 : 1,
          }}
        >
          {task.title.length > 30 ? task.title.slice(0, 29) + "…" : task.title}
        </span>
      )}
    </div>
  );
}
