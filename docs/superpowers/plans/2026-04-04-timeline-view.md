# Timeline View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project workspace timeline placeholder with a fully functional, Linear-inspired group-level timeline with collapsible swimlanes, hover-reveal dependencies, unscheduled tasks panel, and mobile list fallback.

**Architecture:** A `ProjectTimeline` container component renders inside `ProjectWorkspaceView.tsx` when `activeTab === "timeline"`. It uses the existing `useProjectData` hook for task data and the existing PATCH `/api/workspace/tasks/[id]` route for drag-to-schedule updates. All positioning is CSS percentage-based (same technique as `GanttPage.tsx`). No new npm dependencies.

**Tech Stack:** React 19, Next.js 16 App Router, framer-motion, lucide-react, Tailwind CSS v4, CSS custom properties from `globals.css`

**Spec:** `docs/superpowers/specs/2026-04-04-timeline-view-design.md`

---

## File Structure

```
apps/web/src/components/workspace/timeline/
├── ProjectTimeline.tsx          — Main container: layout, state, keyboard shortcuts
├── timeline-utils.ts            — Date math, grouping logic, colour maps, types
├── TimelineToolbar.tsx           — Zoom, group-by, colour-by, search, collapse-all
├── TimelineGrid.tsx              — Time axis header, gridlines, today line, scroll container
├── TimelineSwimlane.tsx          — One per group: header row + expandable task rows
├── TimelineBar.tsx               — Individual task bar with progress fill + milestone diamonds
├── TimelineTooltip.tsx           — Hover tooltip with task details
├── TimelineDependencyLines.tsx   — SVG overlay for dependency arrows (hover-reveal)
├── UnscheduledPanel.tsx          — Collapsible bottom panel with drag-to-schedule
└── TimelineMobileList.tsx        — Mobile fallback: deadline-sorted task list
```

**Existing files modified:**
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` — replace timeline placeholder with `<ProjectTimeline>`
- `apps/web/src/app/dashboard/types.ts` — extend `WorkspaceTimelineTask` with `startDate`, `endDate`, `category`, `assigneeName`, `milestones`
- `apps/web/src/app/globals.css` — add timeline status colour CSS variables

---

### Task 1: Design Tokens & Types

**Files:**
- Modify: `apps/web/src/app/globals.css:4-80`
- Modify: `apps/web/src/app/dashboard/types.ts:83-98`
- Create: `apps/web/src/components/workspace/timeline/timeline-utils.ts`

- [ ] **Step 1: Add timeline CSS variables to globals.css**

Add after the `--pm-gray` line (line 48) in `:root`:

```css
  /* Timeline status fills */
  --tl-not-started:     #e8e0ff;
  --tl-in-progress:     #6c44f6;
  --tl-at-risk:         #b29cf8;
  --tl-overdue:         #e84c6f;
  --tl-completed:       #3ecf8e;
  --tl-not-started-dark:#d4c8f9;
  --tl-in-progress-dark:#5b38d4;
  --tl-at-risk-dark:    #9a7fe0;
  --tl-overdue-dark:    #c73a58;
  --tl-completed-dark:  #2fb87a;
```

- [ ] **Step 2: Extend WorkspaceTimelineTask type**

In `apps/web/src/app/dashboard/types.ts`, replace lines 83-98 with:

```typescript
export interface TimelineMilestone {
  id: string;
  title: string;
  date: string; // ISO date
}

export interface WorkspaceTimelineTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  category: string | null;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  riskLevel: string;
  milestones?: TimelineMilestone[];
}

export interface WorkspaceTimeline {
  gantt?: WorkspaceTimelineTask[];
  kanban?: Record<string, Array<{ id: string }>>;
  dependencies?: Array<{ taskId: string; dependsOnTaskId: string; relation: string }>;
}
```

- [ ] **Step 3: Create timeline-utils.ts**

```typescript
import type { TaskStatus, TaskPriority, WorkspaceTimelineTask } from "@/app/dashboard/types";

/* ─── Constants ────────────────────────────────────────────────────── */

export const EASE = [0.22, 1, 0.36, 1] as const;

export type ZoomLevel = "week" | "month" | "quarter";
export type GroupBy = "phase" | "assignee" | "status";
export type ColourBy = "status" | "assignee" | "priority";

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  week: "W",
  month: "M",
  quarter: "Q",
};

/* ─── Status colour config ─────────────────────────────────────────── */

export interface StatusColourConfig {
  bg: string;
  bgDark: string;
  text: string;
  label: string;
}

export const STATUS_COLOURS: Record<TaskStatus, StatusColourConfig> = {
  not_started: {
    bg: "var(--tl-not-started)",
    bgDark: "var(--tl-not-started-dark)",
    text: "#5b3ec9",
    label: "Not started",
  },
  on_track: {
    bg: "var(--tl-in-progress)",
    bgDark: "var(--tl-in-progress-dark)",
    text: "#ffffff",
    label: "In progress",
  },
  at_risk: {
    bg: "var(--tl-at-risk)",
    bgDark: "var(--tl-at-risk-dark)",
    text: "#ffffff",
    label: "At risk",
  },
  overdue: {
    bg: "var(--tl-overdue)",
    bgDark: "var(--tl-overdue-dark)",
    text: "#ffffff",
    label: "Overdue",
  },
  completed: {
    bg: "var(--tl-completed)",
    bgDark: "var(--tl-completed-dark)",
    text: "#ffffff",
    label: "Completed",
  },
};

export const PRIORITY_COLOURS: Record<TaskPriority, string> = {
  critical: "#e84c6f",
  high: "#f59e0b",
  medium: "#6c44f6",
  low: "#bdb7d0",
};

/* ─── Date helpers ─────────────────────────────────────────────────── */

export function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatDateRange(start: Date, end: Date): string {
  const days = daysBetween(start, end);
  return `${formatDateShort(start)} – ${formatDateShort(end)} (${days} day${days === 1 ? "" : "s"})`;
}

/* ─── Date range for the timeline axis ─────────────────────────────── */

export interface TimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
}

export function computeTimelineRange(
  tasks: WorkspaceTimelineTask[],
  zoom: ZoomLevel,
): TimelineRange {
  const now = new Date();
  let earliest = now;
  let latest = now;

  for (const t of tasks) {
    const s = parseDate(t.startDate);
    const e = parseDate(t.endDate) ?? parseDate(t.dueDate);
    if (s && s < earliest) earliest = s;
    if (e && e > latest) latest = e;
  }

  // Add padding based on zoom level
  const padDays = zoom === "week" ? 3 : zoom === "month" ? 14 : 30;
  const start = addDays(earliest, -padDays);
  const end = addDays(latest, padDays);
  const totalDays = Math.max(daysBetween(start, end), 1);

  return { start, end, totalDays };
}

export function dateToPct(d: Date, range: TimelineRange): number {
  return (daysBetween(range.start, d) / range.totalDays) * 100;
}

/* ─── Gridline generation ──────────────────────────────────────────── */

export interface GridMarker {
  date: Date;
  label: string;
  pct: number;
}

export function generateGridMarkers(
  range: TimelineRange,
  zoom: ZoomLevel,
): GridMarker[] {
  const markers: GridMarker[] = [];
  const cursor = new Date(range.start);

  if (zoom === "week") {
    // Daily gridlines
    while (cursor <= range.end) {
      markers.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
        pct: dateToPct(cursor, range),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (zoom === "month") {
    // Weekly gridlines — start on Monday
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7 || 7));
    while (cursor <= range.end) {
      const weekEnd = addDays(cursor, 6);
      markers.push({
        date: new Date(cursor),
        label: `${formatDateShort(cursor)} – ${formatDateShort(weekEnd)}`,
        pct: dateToPct(cursor, range),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    // Monthly gridlines
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= range.end) {
      markers.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        pct: dateToPct(cursor, range),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return markers;
}

/* ─── Grouping logic ───────────────────────────────────────────────── */

export interface TaskGroup {
  key: string;
  label: string;
  tasks: WorkspaceTimelineTask[];
}

export function groupTasks(
  tasks: WorkspaceTimelineTask[],
  groupBy: GroupBy,
): TaskGroup[] {
  const map = new Map<string, WorkspaceTimelineTask[]>();

  for (const t of tasks) {
    let key: string;
    if (groupBy === "phase") {
      key = t.category ?? "Uncategorised";
    } else if (groupBy === "assignee") {
      key = t.assigneeName ?? t.assigneeUserId ?? "Unassigned";
    } else {
      key = STATUS_COLOURS[t.status]?.label ?? t.status;
    }
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }

  return Array.from(map.entries()).map(([key, tasks]) => ({
    key,
    label: key,
    tasks,
  }));
}

/* ─── Scheduled vs unscheduled split ───────────────────────────────── */

export function splitScheduled(tasks: WorkspaceTimelineTask[]): {
  scheduled: WorkspaceTimelineTask[];
  unscheduled: WorkspaceTimelineTask[];
} {
  const scheduled: WorkspaceTimelineTask[] = [];
  const unscheduled: WorkspaceTimelineTask[] = [];

  for (const t of tasks) {
    if (t.startDate && (t.endDate || t.dueDate)) {
      scheduled.push(t);
    } else {
      unscheduled.push(t);
    }
  }

  return { scheduled, unscheduled };
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx next build 2>&1 | head -30`
Expected: No type errors related to the changed types.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/dashboard/types.ts apps/web/src/components/workspace/timeline/timeline-utils.ts
git commit -m "feat(timeline): add design tokens, extended types, and utility functions"
```

---

### Task 2: TimelineToolbar

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineToolbar.tsx`

- [ ] **Step 1: Create TimelineToolbar.tsx**

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ChevronDown, ChevronsUpDown, Check,
} from "lucide-react";
import {
  EASE, ZOOM_LABELS,
  type ZoomLevel, type GroupBy, type ColourBy,
} from "./timeline-utils";

/* ─── Dropdown ─────────────────────────────────────────────────────── */

function Dropdown<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value)!;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-2)] hover:border-[var(--border-2)] transition-colors"
      >
        <span className="text-[var(--text-disabled)] mr-0.5">{label}:</span>
        {current.label}
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE }}
            className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-2)]"
          >
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  {opt.label}
                  {opt.value === value && <Check size={11} className="ml-auto text-[var(--brand)]" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Toolbar ──────────────────────────────────────────────────────── */

interface TimelineToolbarProps {
  zoom: ZoomLevel;
  groupBy: GroupBy;
  colourBy: ColourBy;
  searchQuery: string;
  allCollapsed: boolean;
  onZoomChange: (z: ZoomLevel) => void;
  onGroupByChange: (g: GroupBy) => void;
  onColourByChange: (c: ColourBy) => void;
  onSearchChange: (q: string) => void;
  onToggleCollapseAll: () => void;
  onJumpToToday: () => void;
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "phase", label: "Phase" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
];

const COLOUR_OPTIONS: { value: ColourBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
];

export function TimelineToolbar({
  zoom, groupBy, colourBy, searchQuery, allCollapsed,
  onZoomChange, onGroupByChange, onColourByChange,
  onSearchChange, onToggleCollapseAll, onJumpToToday,
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      {/* Zoom buttons */}
      <div className="flex items-center rounded-lg border border-[var(--border)] overflow-hidden">
        {(["week", "month", "quarter"] as ZoomLevel[]).map((z) => (
          <button
            key={z}
            onClick={() => onZoomChange(z)}
            className={[
              "px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              zoom === z
                ? "bg-[var(--brand)] text-white"
                : "bg-white text-[var(--text-2)] hover:bg-[var(--surface-2)]",
            ].join(" ")}
          >
            {ZOOM_LABELS[z]}
          </button>
        ))}
      </div>

      {/* Today button */}
      <button
        onClick={onJumpToToday}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-2.5 py-1.5 text-[11px] font-medium text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors"
      >
        Today
      </button>

      {/* Group by dropdown */}
      <Dropdown
        value={groupBy}
        options={GROUP_OPTIONS}
        onChange={onGroupByChange}
        label="Group"
      />

      {/* Colour by dropdown */}
      <Dropdown
        value={colourBy}
        options={COLOUR_OPTIONS}
        onChange={onColourByChange}
        label="Colour"
      />

      {/* Search */}
      <div className="relative ml-auto">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-disabled)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tasks..."
          className="w-[160px] rounded-lg border border-[var(--border)] bg-white py-1.5 pl-7 pr-2.5 text-[11px] text-[var(--text-2)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[var(--brand)]/40 focus:ring-2 focus:ring-[var(--brand)]/10 transition-all"
        />
      </div>

      {/* Collapse all */}
      <button
        onClick={onToggleCollapseAll}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <ChevronsUpDown size={12} />
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors in TimelineToolbar.tsx

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineToolbar.tsx
git commit -m "feat(timeline): add toolbar with zoom, group-by, colour-by, search"
```

---

### Task 3: TimelineGrid (Time Axis + Gridlines + Today Line)

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineGrid.tsx`

- [ ] **Step 1: Create TimelineGrid.tsx**

```typescript
"use client";

import { forwardRef, type ReactNode } from "react";
import {
  type TimelineRange, type ZoomLevel,
  generateGridMarkers, dateToPct, formatDateShort,
} from "./timeline-utils";

interface TimelineGridProps {
  range: TimelineRange;
  zoom: ZoomLevel;
  children: ReactNode;
}

export const TimelineGrid = forwardRef<HTMLDivElement, TimelineGridProps>(
  function TimelineGrid({ range, zoom, children }, ref) {
    const markers = generateGridMarkers(range, zoom);
    const today = new Date();
    const todayPct = dateToPct(today, range);
    const todayInRange = todayPct >= 0 && todayPct <= 100;

    // Min-width based on zoom: week=120px/day, month=30px/day, quarter=4px/day
    const pxPerDay = zoom === "week" ? 120 : zoom === "month" ? 30 : 4;
    const minWidth = range.totalDays * pxPerDay;

    return (
      <div
        ref={ref}
        className="relative flex-1 overflow-x-auto overflow-y-auto"
      >
        <div style={{ minWidth: `${minWidth}px` }}>
          {/* ── Time axis header (sticky top) ── */}
          <div
            className="sticky top-0 z-20 border-b border-[var(--border)] bg-white"
            style={{ minHeight: 36 }}
          >
            <div className="relative h-9">
              {markers.map((m, i) => (
                <span
                  key={i}
                  className="absolute top-2.5 text-[10px] font-medium text-[var(--text-disabled)] -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${m.pct}%` }}
                >
                  {m.label}
                </span>
              ))}

              {/* Today pill */}
              {todayInRange && (
                <span
                  className="absolute top-1 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                  style={{
                    left: `${todayPct}%`,
                    background: "rgba(108, 68, 246, 0.1)",
                    color: "var(--brand)",
                  }}
                >
                  Today, {formatDateShort(today)}
                </span>
              )}
            </div>
          </div>

          {/* ── Body with gridlines ── */}
          <div className="relative">
            {/* Gridlines */}
            {markers.map((m, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-[var(--border)]"
                style={{ left: `${m.pct}%` }}
              />
            ))}

            {/* Today line */}
            {todayInRange && (
              <div
                className="absolute top-0 bottom-0 w-px z-10"
                style={{
                  left: `${todayPct}%`,
                  background: "rgba(108, 68, 246, 0.4)",
                }}
              />
            )}

            {/* Swimlane rows rendered as children */}
            {children}
          </div>
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineGrid.tsx
git commit -m "feat(timeline): add grid with time axis, gridlines, and today line"
```

---

### Task 4: TimelineBar

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineBar.tsx`

- [ ] **Step 1: Create TimelineBar.tsx**

```typescript
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
  isHighlighted: boolean; // for dependency hover
  isDimmed: boolean;      // for search filter
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Assign a deterministic hue to an assignee name for colour-by-assignee mode */
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
  // assignee
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
    0.3, // min width so tiny tasks are visible
  );
  const { bg, bgDark } = getBarColour(task, colourBy);
  const barH = isGroup ? 32 : 28;
  const progress = task.progressPercent ?? 0;

  // Determine if label fits inside bar
  const approxBarPx = (widthPct / 100) * range.totalDays * 30; // rough px
  const labelInside = approxBarPx > 120;

  // Cluster milestones
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

    // Simple clustering: merge milestones within 8% of each other
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
        {/* Background track */}
        <div
          className="absolute inset-0"
          style={{ background: bg, opacity: 0.85 }}
        />

        {/* Progress fill */}
        {progress > 0 && (
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ background: bgDark }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: EASE }}
          />
        )}

        {/* Label inside bar */}
        {labelInside && (
          <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
            <span
              className="text-[10px] font-semibold truncate drop-shadow-sm"
              style={{ color: STATUS_COLOURS[task.status].text }}
            >
              {task.title}
            </span>
          </div>
        )}

        {/* Milestone diamonds */}
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

      {/* Label outside bar (for narrow bars) */}
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
          {task.title}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineBar.tsx
git commit -m "feat(timeline): add bar component with progress, milestones, and colour modes"
```

---

### Task 5: TimelineTooltip

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineTooltip.tsx`

- [ ] **Step 1: Create TimelineTooltip.tsx**

```typescript
"use client";

import { motion } from "framer-motion";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import {
  EASE, STATUS_COLOURS,
  parseDate, formatDateRange,
} from "./timeline-utils";

interface TimelineTooltipProps {
  task: WorkspaceTimelineTask;
  anchorRect: DOMRect | null;
  containerRect: DOMRect | null;
}

export function TimelineTooltip({ task, anchorRect, containerRect }: TimelineTooltipProps) {
  if (!anchorRect || !containerRect) return null;

  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate) ?? parseDate(task.dueDate);
  const sc = STATUS_COLOURS[task.status];

  // Position above the bar, centred horizontally
  const left = anchorRect.left - containerRect.left + anchorRect.width / 2;
  const top = anchorRect.top - containerRect.top - 8;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="absolute z-50 -translate-x-1/2 -translate-y-full pointer-events-none"
      style={{ left, top }}
    >
      <div
        className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-2)]"
        style={{ minWidth: 200, maxWidth: 300 }}
      >
        {/* Title */}
        <p className="text-[12px] font-semibold text-[var(--text-1)] mb-1.5 leading-snug">
          {task.title}
        </p>

        {/* Assignee */}
        {task.assigneeName && (
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[7px] font-bold text-[var(--text-muted)]">
              {(task.assigneeName ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="text-[11px] text-[var(--text-2)]">{task.assigneeName}</span>
          </div>
        )}

        {/* Date range */}
        {start && end && (
          <p className="text-[10px] text-[var(--text-muted)] mb-1">
            {formatDateRange(start, end)}
          </p>
        )}

        {/* Progress + Status row */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-medium text-[var(--text-2)]">
            {task.progressPercent ?? 0}% complete
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{
              background: sc.bg,
              color: sc.text,
            }}
          >
            {sc.label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineTooltip.tsx
git commit -m "feat(timeline): add hover tooltip component"
```

---

### Task 6: TimelineSwimlane

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineSwimlane.tsx`

- [ ] **Step 1: Create TimelineSwimlane.tsx**

```typescript
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { TimelineBar } from "./TimelineBar";
import {
  EASE,
  type TimelineRange, type ColourBy, type TaskGroup,
} from "./timeline-utils";

interface TimelineSwimlaneProps {
  group: TaskGroup;
  range: TimelineRange;
  colourBy: ColourBy;
  isExpanded: boolean;
  selectedTaskId: string | null;
  highlightedTaskIds: Set<string>;
  dimmedTaskIds: Set<string>;
  onToggle: () => void;
  onSelectTask: (id: string) => void;
  onHoverTask: (id: string | null) => void;
}

export function TimelineSwimlane({
  group, range, colourBy, isExpanded, selectedTaskId,
  highlightedTaskIds, dimmedTaskIds,
  onToggle, onSelectTask, onHoverTask,
}: TimelineSwimlaneProps) {
  return (
    <div className="border-b border-[var(--border)]">
      {/* ── Group header row ── */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ minHeight: 36 }}
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-[var(--text-disabled)] shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-[var(--text-disabled)] shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-[var(--text-1)]">
          {group.label}
        </span>
        <span className="text-[10px] text-[var(--text-disabled)]">
          ({group.tasks.length} task{group.tasks.length === 1 ? "" : "s"})
        </span>
      </button>

      {/* ── Expanded task rows ── */}
      <AnimatePresence initial={false}>
        {isExpanded && group.tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <TimelineBar
              task={task}
              range={range}
              colourBy={colourBy}
              isGroup={false}
              isSelected={selectedTaskId === task.id}
              isHighlighted={highlightedTaskIds.has(task.id)}
              isDimmed={dimmedTaskIds.has(task.id)}
              onClick={() => onSelectTask(task.id)}
              onMouseEnter={() => onHoverTask(task.id)}
              onMouseLeave={() => onHoverTask(null)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Collapsed: thin stripe with miniature range indicator ── */}
      {!isExpanded && (
        <div className="h-1 bg-[var(--surface-2)]" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineSwimlane.tsx
git commit -m "feat(timeline): add swimlane with expand/collapse and group header"
```

---

### Task 7: TimelineDependencyLines

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineDependencyLines.tsx`

- [ ] **Step 1: Create TimelineDependencyLines.tsx**

```typescript
"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import {
  EASE, type TimelineRange,
  parseDate, dateToPct,
} from "./timeline-utils";

interface Dependency {
  taskId: string;
  dependsOnTaskId: string;
  relation: string;
}

interface TimelineDependencyLinesProps {
  dependencies: Dependency[];
  tasks: WorkspaceTimelineTask[];
  range: TimelineRange;
  hoveredTaskId: string | null;
  /** Map of task id → vertical centre Y (px) within the scrollable area */
  taskPositions: Map<string, number>;
}

export function TimelineDependencyLines({
  dependencies, tasks, range, hoveredTaskId, taskPositions,
}: TimelineDependencyLinesProps) {
  if (!dependencies.length || !hoveredTaskId) return null;

  // Only show lines connected to the hovered task
  const relevant = dependencies.filter(
    (d) => d.taskId === hoveredTaskId || d.dependsOnTaskId === hoveredTaskId,
  );

  if (!relevant.length) return null;

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      style={{ overflow: "visible" }}
    >
      <AnimatePresence>
        {relevant.map((dep) => {
          const from = taskMap.get(dep.dependsOnTaskId);
          const to = taskMap.get(dep.taskId);
          if (!from || !to) return null;

          const fromEnd = parseDate(from.endDate) ?? parseDate(from.dueDate);
          const toStart = parseDate(to.startDate);
          if (!fromEnd || !toStart) return null;

          const x1 = dateToPct(fromEnd, range);
          const x2 = dateToPct(toStart, range);
          const y1 = taskPositions.get(dep.dependsOnTaskId) ?? 0;
          const y2 = taskPositions.get(dep.taskId) ?? 0;

          // Curved bezier path
          const midX = (x1 + x2) / 2;
          const path = `M ${x1}% ${y1} C ${midX}% ${y1}, ${midX}% ${y2}, ${x2}% ${y2}`;

          return (
            <motion.g key={`${dep.dependsOnTaskId}-${dep.taskId}`}>
              <motion.path
                d={path}
                fill="none"
                stroke="#6c44f6"
                strokeWidth={1.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: EASE }}
                markerEnd="url(#arrowhead)"
              />
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* Arrowhead marker definition */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="6"
          refY="2"
          orient="auto"
        >
          <polygon points="0 0, 6 2, 0 4" fill="#6c44f6" opacity="0.7" />
        </marker>
      </defs>
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineDependencyLines.tsx
git commit -m "feat(timeline): add hover-reveal dependency lines with SVG arrows"
```

---

### Task 8: UnscheduledPanel

**Files:**
- Create: `apps/web/src/components/workspace/timeline/UnscheduledPanel.tsx`

- [ ] **Step 1: Create UnscheduledPanel.tsx**

```typescript
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { EASE, STATUS_COLOURS, PRIORITY_COLOURS } from "./timeline-utils";

interface UnscheduledPanelProps {
  tasks: WorkspaceTimelineTask[];
  onScheduleTask: (taskId: string, startDate: string, endDate: string) => void;
}

export function UnscheduledPanel({ tasks, onScheduleTask }: UnscheduledPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="border-t border-dashed border-[var(--border-2)]">
      {/* ── Header ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
        style={{ minHeight: 36 }}
      >
        {expanded ? (
          <ChevronDown size={12} className="text-[var(--text-disabled)]" />
        ) : (
          <ChevronRight size={12} className="text-[var(--text-disabled)]" />
        )}
        <span className="text-[11px] font-semibold text-[var(--text-2)]">
          Unscheduled
        </span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          {tasks.length}
        </span>
      </button>

      {/* ── Expanded list ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1">
              {tasks.map((task) => {
                const sc = STATUS_COLOURS[task.status];
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2 cursor-grab active:cursor-grabbing hover:border-[var(--border-2)] transition-colors"
                  >
                    <GripVertical size={12} className="text-[var(--text-disabled)] shrink-0" />

                    {/* Title */}
                    <span className="flex-1 truncate text-[11px] font-medium text-[var(--text-2)]">
                      {task.title}
                    </span>

                    {/* Status pill */}
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {sc.label}
                    </span>

                    {/* Priority dot */}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PRIORITY_COLOURS[task.priority] }}
                    />

                    {/* Assignee avatar */}
                    {task.assigneeName && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[7px] font-bold text-[var(--text-muted)] shrink-0">
                        {task.assigneeName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/timeline/UnscheduledPanel.tsx
git commit -m "feat(timeline): add unscheduled tasks panel with drag-to-schedule"
```

---

### Task 9: TimelineMobileList

**Files:**
- Create: `apps/web/src/components/workspace/timeline/TimelineMobileList.tsx`

- [ ] **Step 1: Create TimelineMobileList.tsx**

```typescript
"use client";

import type { WorkspaceTimelineTask } from "@/app/dashboard/types";
import { STATUS_COLOURS, PRIORITY_COLOURS, parseDate, formatDateShort } from "./timeline-utils";

interface TimelineMobileListProps {
  tasks: WorkspaceTimelineTask[];
  onSelectTask: (id: string) => void;
}

export function TimelineMobileList({ tasks, onSelectTask }: TimelineMobileListProps) {
  // Sort by due/end date, nulls last
  const sorted = [...tasks].sort((a, b) => {
    const da = a.endDate ?? a.dueDate;
    const db = b.endDate ?? b.dueDate;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(da).getTime() - new Date(db).getTime();
  });

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-disabled)] mb-2">
        Timeline (sorted by deadline)
      </p>
      {sorted.map((task) => {
        const sc = STATUS_COLOURS[task.status];
        const dueDate = parseDate(task.endDate) ?? parseDate(task.dueDate);
        const hasMilestones = (task.milestones?.length ?? 0) > 0;

        return (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors"
          >
            {/* Status chip */}
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: sc.bg, color: sc.text }}
            >
              {sc.label}
            </span>

            {/* Title */}
            <span className="flex-1 truncate text-[11px] font-medium text-[var(--text-1)]">
              {hasMilestones && <span className="mr-1">◆</span>}
              {task.title}
            </span>

            {/* Priority dot */}
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: PRIORITY_COLOURS[task.priority] }}
            />

            {/* Assignee */}
            {task.assigneeName && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[7px] font-bold text-[var(--text-muted)] shrink-0">
                {task.assigneeName.slice(0, 2).toUpperCase()}
              </span>
            )}

            {/* Due date */}
            {dueDate && (
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                {formatDateShort(dueDate)}
              </span>
            )}
          </button>
        );
      })}

      {sorted.length === 0 && (
        <p className="text-center text-[12px] text-[var(--text-disabled)] py-8">
          No tasks to display
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/timeline/TimelineMobileList.tsx
git commit -m "feat(timeline): add mobile list fallback for viewports under 1024px"
```

---

### Task 10: ProjectTimeline (Main Container)

**Files:**
- Create: `apps/web/src/components/workspace/timeline/ProjectTimeline.tsx`

- [ ] **Step 1: Create ProjectTimeline.tsx**

```typescript
"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import { TaskDetailPanel, type TaskPanelData, type TaskStatus as PanelStatus } from "@/components/dashboard/TaskDetailPanel";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineSwimlane } from "./TimelineSwimlane";
import { TimelineDependencyLines } from "./TimelineDependencyLines";
import { TimelineTooltip } from "./TimelineTooltip";
import { UnscheduledPanel } from "./UnscheduledPanel";
import { TimelineMobileList } from "./TimelineMobileList";
import {
  type ZoomLevel, type GroupBy, type ColourBy,
  computeTimelineRange, groupTasks, splitScheduled,
  STATUS_COLOURS, dateToPct, addDays,
} from "./timeline-utils";

/* ─── Status mapping (API types → panel types) ─────────────────────── */

const STATUS_TO_PANEL: Record<string, PanelStatus> = {
  not_started: "upcoming",
  on_track: "on-track",
  at_risk: "at-risk",
  overdue: "overdue",
  completed: "done",
};

function toTaskPanelData(task: WorkspaceTimelineTask): TaskPanelData {
  const initials = (task.assigneeName ?? task.assigneeUserId ?? "?")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return {
    id: task.id,
    name: task.title,
    description: "",
    status: STATUS_TO_PANEL[task.status] ?? "upcoming",
    priority: task.priority,
    assignee: initials,
    assigneeFull: task.assigneeName ?? task.assigneeUserId ?? "Unassigned",
    project: task.category ?? "",
    deadline: task.endDate ?? task.dueDate ?? "",
    progress: task.progressPercent ?? 0,
  };
}

/* ─── Component ────────────────────────────────────────────────────── */

interface ProjectTimelineProps {
  projectId: string;
  tasks: WorkspaceTimelineTask[];
  timeline: WorkspaceTimeline | null;
  refresh: () => Promise<void>;
}

export function ProjectTimeline({
  projectId, tasks: allTasks, timeline, refresh,
}: ProjectTimelineProps) {
  // ── State ──
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [groupBy, setGroupBy] = useState<GroupBy>("phase");
  const [colourBy, setColourBy] = useState<ColourBy>("status");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Responsive check ──
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 1024); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Use timeline.gantt tasks if available, fall back to allTasks ──
  const timelineTasks = useMemo(() => {
    const ganttTasks = timeline?.gantt;
    if (ganttTasks && ganttTasks.length > 0) return ganttTasks;
    // Map WorkspaceTask[] shape to WorkspaceTimelineTask[] shape
    return allTasks as WorkspaceTimelineTask[];
  }, [timeline?.gantt, allTasks]);

  // ── Split scheduled / unscheduled ──
  const { scheduled, unscheduled } = useMemo(
    () => splitScheduled(timelineTasks),
    [timelineTasks],
  );

  // ── Filter by search ──
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return scheduled;
    const q = searchQuery.toLowerCase();
    return scheduled.filter((t) => t.title.toLowerCase().includes(q));
  }, [scheduled, searchQuery]);

  // ── Dimmed set (tasks not matching search when search is active) ──
  const dimmedTaskIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const matchIds = new Set(filteredTasks.map((t) => t.id));
    return new Set(scheduled.filter((t) => !matchIds.has(t.id)).map((t) => t.id));
  }, [scheduled, filteredTasks, searchQuery]);

  // ── Groups ──
  const groups = useMemo(
    () => groupTasks(scheduled, groupBy),
    [scheduled, groupBy],
  );

  // ── Auto-expand all groups on first render ──
  useEffect(() => {
    setExpandedGroups(new Set(groups.map((g) => g.key)));
  }, [groupBy]); // Reset when grouping changes

  // ── Timeline range ──
  const range = useMemo(
    () => computeTimelineRange(scheduled, zoom),
    [scheduled, zoom],
  );

  // ── Dependency highlights ──
  const deps = timeline?.dependencies ?? [];
  const highlightedTaskIds = useMemo(() => {
    if (!hoveredTaskId) return new Set<string>();
    const ids = new Set<string>();
    for (const d of deps) {
      if (d.taskId === hoveredTaskId || d.dependsOnTaskId === hoveredTaskId) {
        ids.add(d.taskId);
        ids.add(d.dependsOnTaskId);
      }
    }
    return ids;
  }, [hoveredTaskId, deps]);

  // ── Selected task for side panel ──
  const selectedTask = useMemo(
    () => timelineTasks.find((t) => t.id === selectedTaskId) ?? null,
    [timelineTasks, selectedTaskId],
  );

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      switch (e.key.toLowerCase()) {
        case "w": setZoom("week"); break;
        case "m": setZoom("month"); break;
        case "q": setZoom("quarter"); break;
        case "t": jumpToToday(); break;
        case "escape": setSelectedTaskId(null); break;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Jump to today ──
  const jumpToToday = useCallback(() => {
    if (!gridRef.current) return;
    const todayPct = dateToPct(new Date(), range);
    const scrollWidth = gridRef.current.scrollWidth;
    const viewportWidth = gridRef.current.clientWidth;
    const targetScroll = (todayPct / 100) * scrollWidth - viewportWidth / 2;
    gridRef.current.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  }, [range]);

  // ── Collapse all toggle ──
  const toggleCollapseAll = useCallback(() => {
    if (allCollapsed) {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
      setAllCollapsed(false);
    } else {
      setExpandedGroups(new Set());
      setAllCollapsed(true);
    }
  }, [allCollapsed, groups]);

  // ── Toggle individual group ──
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ── Schedule task (drag from unscheduled panel) ──
  const handleScheduleTask = useCallback(async (
    taskId: string, startDate: string, endDate: string,
  ) => {
    try {
      await fetch(`/api/workspace/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      window.dispatchEvent(new CustomEvent("larry:refresh-snapshot"));
      await refresh();
    } catch {
      // Error handled silently — task stays in unscheduled
    }
  }, [refresh]);

  // ── Drop handler for the grid area ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId || !gridRef.current) return;

    // Calculate the date from drop position
    const rect = gridRef.current.getBoundingClientRect();
    const scrollLeft = gridRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const totalWidth = gridRef.current.scrollWidth;
    const dayOffset = Math.round((x / totalWidth) * range.totalDays);
    const dropDate = addDays(range.start, dayOffset);
    const endDate = addDays(dropDate, 7);

    handleScheduleTask(
      taskId,
      dropDate.toISOString().split("T")[0],
      endDate.toISOString().split("T")[0],
    );
  }, [range, handleScheduleTask]);

  // ── Task positions for dependency lines (simplified: index-based) ──
  const taskPositions = useMemo(() => {
    const positions = new Map<string, number>();
    let y = 18; // Start after header
    for (const group of groups) {
      y += 36; // Group header
      if (expandedGroups.has(group.key)) {
        for (const task of group.tasks) {
          y += 20; // Half of bar row height
          positions.set(task.id, y);
          y += 20; // Other half
        }
      }
    }
    return positions;
  }, [groups, expandedGroups]);

  // ── Mobile fallback ──
  if (isMobile) {
    return (
      <TimelineMobileList
        tasks={timelineTasks}
        onSelectTask={setSelectedTaskId}
      />
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col" style={{ minHeight: 400 }}>
      {/* Toolbar */}
      <TimelineToolbar
        zoom={zoom}
        groupBy={groupBy}
        colourBy={colourBy}
        searchQuery={searchQuery}
        allCollapsed={allCollapsed}
        onZoomChange={setZoom}
        onGroupByChange={setGroupBy}
        onColourByChange={setColourBy}
        onSearchChange={setSearchQuery}
        onToggleCollapseAll={toggleCollapseAll}
        onJumpToToday={jumpToToday}
      />

      {/* Main timeline area */}
      <div
        className="relative flex overflow-hidden rounded-2xl border border-[var(--border)] bg-white"
        style={{ boxShadow: "var(--shadow-1)", minHeight: 300 }}
      >
        <TimelineGrid
          ref={gridRef}
          range={range}
          zoom={zoom}
        >
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={handleDrop}
          >
            {/* Dependency lines (SVG overlay) */}
            <TimelineDependencyLines
              dependencies={deps}
              tasks={scheduled}
              range={range}
              hoveredTaskId={hoveredTaskId}
              taskPositions={taskPositions}
            />

            {/* Swimlanes */}
            {groups.map((group) => (
              <TimelineSwimlane
                key={group.key}
                group={group}
                range={range}
                colourBy={colourBy}
                isExpanded={expandedGroups.has(group.key)}
                selectedTaskId={selectedTaskId}
                highlightedTaskIds={highlightedTaskIds}
                dimmedTaskIds={dimmedTaskIds}
                onToggle={() => toggleGroup(group.key)}
                onSelectTask={setSelectedTaskId}
                onHoverTask={setHoveredTaskId}
              />
            ))}

            {/* Empty state */}
            {groups.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <p className="text-[12px] text-[var(--text-disabled)]">
                  No scheduled tasks to display on the timeline
                </p>
              </div>
            )}
          </div>
        </TimelineGrid>

        {/* Task detail side panel */}
        <AnimatePresence>
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={toTaskPanelData(selectedTask)}
              onClose={() => setSelectedTaskId(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Unscheduled panel */}
      <UnscheduledPanel
        tasks={unscheduled}
        onScheduleTask={handleScheduleTask}
      />

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {Object.entries(STATUS_COLOURS).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)]">
            <span className="h-2 w-2 rounded-full" style={{ background: cfg.bg }} />
            {cfg.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-disabled)] ml-auto">
          <span className="h-3 w-px" style={{ background: "rgba(108, 68, 246, 0.4)" }} />
          Today
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/timeline/ProjectTimeline.tsx
git commit -m "feat(timeline): add main container with state management, keyboard shortcuts, and drag-to-schedule"
```

---

### Task 11: Wire Into ProjectWorkspaceView

**Files:**
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx:1-5` (imports)
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx:1447-1459` (timeline tab)

- [ ] **Step 1: Add import at top of ProjectWorkspaceView.tsx**

Add after the existing imports (around line 41, after the `ProjectDashboard` import):

```typescript
import { ProjectTimeline } from "@/components/workspace/timeline/ProjectTimeline";
```

- [ ] **Step 2: Replace the timeline placeholder**

In `ProjectWorkspaceView.tsx`, find the timeline tab section (lines 1447-1459) and replace:

```typescript
        {/* ── Tab: Timeline (placeholder) ──────────────── */}
        {activeTab === "timeline" && (
          <div
            className="text-center px-6 py-12"
            style={{ borderRadius: "var(--radius-card)", border: "1px dashed var(--border-2)", background: "var(--surface)" }}
          >
            <LayoutList size={32} className="mx-auto mb-3" style={{ color: "var(--text-disabled)" }} />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>Timeline view</p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--text-2)" }}>
              A visual timeline of tasks, milestones, and dependencies is coming in the next phase.
            </p>
          </div>
        )}
```

With:

```typescript
        {/* ── Tab: Timeline ──────────────────────────────── */}
        {activeTab === "timeline" && (
          <ProjectTimeline
            projectId={projectId}
            tasks={timeline?.gantt ?? []}
            timeline={timeline}
            refresh={refresh}
          />
        )}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd apps/web && npx next build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx
git commit -m "feat(timeline): wire ProjectTimeline into workspace, replace placeholder"
```

---

### Task 12: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `cd C:/Dev/larry/site-deploys/larry-site && npm run web:dev`

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/workspace/projects/<any-project-id>` and click the "Timeline" tab. Verify:

1. Toolbar renders with zoom buttons, dropdowns, search, collapse all
2. If no scheduled tasks exist, empty state message shows
3. Zoom buttons switch between W/M/Q correctly
4. Keyboard shortcuts W/M/Q/T work
5. Groups expand/collapse with animation
6. Unscheduled panel appears at bottom if tasks lack dates
7. Below 1024px viewport width, mobile list shows instead
8. Clicking a bar opens the side panel

- [ ] **Step 3: Fix any issues found during smoke test**

Address any rendering or interaction issues discovered.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(timeline): address smoke test issues"
```
