# Timeline View — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Location:** `apps/web` — Project workspace timeline tab

---

## Overview

A group-level timeline view inside each project's workspace, replacing the current placeholder. Tasks are grouped by phase/category (collapsible), with individual task bars revealed on expand. Built with existing tools (custom positioning, framer-motion, lucide-react) — no new npm dependencies.

The design follows Linear's philosophy: enforce hierarchy, show less at rest, reveal more on demand. No AI health indicators — the timeline is pure tasks-and-dates.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ Toolbar                                                             │
│ [W][M][Q] zoom │ Today │ Colour by ▾ │ Group by ▾ │ 🔍 │ ⊟ All    │
├──────────────┬──────────────────────────────────────────────────────┤
│  Sticky left │  Time axis header (week/month labels)               │
│  label panel │  ┃ today line                                       │
├──────────────┼──────────────────────────────────────────────────────┤
│ ▼ Group name │  ████████████████░░░░  (group summary bar)          │
│   Task A     │    ████████                                         │
│   Task B     │        ██████████                                   │
├──────────────┼──────────────────────────────────────────────────────┤
│ ► Group name │  ██████████████◆░░░   (collapsed, diamond=milestone)│
├──────────────┼──────────────────────────────────────────────────────┤
│ ── Unscheduled (N tasks) ──────────────────────────── expand ▾     │
└─────────────────────────────────────────────────────────────────────┘
```

### Regions

1. **Toolbar** — fixed at top of the timeline tab area
2. **Sticky left panel** — 200–320px, position:sticky on horizontal scroll, user-resizable via drag divider. Shows group name, chevron, task count.
3. **Time axis** — horizontal scrollable area with gridlines and date headers
4. **Swimlane rows** — one per group, expandable to show individual task bars
5. **Unscheduled panel** — collapsible section pinned to the bottom

---

## Toolbar Controls

| Control | Behaviour |
|---|---|
| **Zoom buttons** `[W] [M] [Q]` | Switch between Week / Month / Quarter. Active button highlighted with brand colour. |
| **Today button** | Scrolls viewport to centre the today line. Keyboard shortcut: `T`. |
| **Colour by** dropdown | Status (default) / Assignee / Priority. Changes bar fill colour semantic. |
| **Group by** dropdown | Phase (default) / Assignee / Status. Reorganises swimlanes. |
| **Search** | Filters visible tasks by name match. Highlights matching bars, dims non-matching. |
| **Collapse all / Expand all** | Toggles all groups collapsed or expanded. |

---

## Status Colours (Bar Fills)

All derived from the Larry palette. Used when "Colour by: Status" is active (the default).

| Status | Hex | CSS Variable | Usage |
|---|---|---|---|
| Not started | `#e8e0ff` | `--tl-not-started` | Very light purple, waiting state |
| In progress | `#6c44f6` | `--tl-in-progress` | Larry brand, active work |
| At risk | `#b29cf8` | `--tl-at-risk` | Mid purple, attention needed |
| Overdue | `#e84c6f` | `--tl-overdue` | Warm pink-red, urgency signal |
| Completed | `#3ecf8e` | `--tl-completed` | Teal-green, resolved/settled |

Each bar also carries a text label for accessibility (not colour-only encoding). ARIA attributes on bars encode status for screen readers.

---

## Bar Design

### At rest (visible on the bar)
- **Task/group name** — truncated at ~30 characters. Rendered inside bar if bar is wide enough (>120px), outside to the right if narrow.
- **Status colour fill** — full bar background per status table above.
- **Progress fill** — subtle darker shade within the bar, filling left-to-right proportionally. E.g., a 60% complete in-progress task shows 60% of the bar in a slightly darker `#5b38d4` over the `#6c44f6` base.
- **Milestone diamonds** `◆` — small 8px diamonds positioned at milestone dates on the bar. When two milestones are within 5% viewport width of each other, they cluster into a count badge ("3") that expands on hover.

### Bar dimensions
- Height: 28px for task bars, 32px for group summary bars
- Border radius: 6px
- Min width: 4px (for very short duration tasks — renders as a dot/pill)
- Gap between rows: 4px within a group, 12px between groups

---

## Interactions

### Hover (tooltip)
Appears after 200ms delay, positioned above the bar:
- Full task name (untruncated)
- Assignee avatar (16px circle) + name
- Date range in plain language: "Apr 5 – Apr 22 (17 days)"
- Progress: "65% complete"
- Status label pill (coloured)

### Hover — dependency lines
When hovering a task that has dependencies:
- Lines appear between connected tasks
- Style: 1px curved bezier lines, `#6c44f6` at 30% opacity at rest, **full opacity + arrowhead** on the hovered pair
- Lines connect from the right edge of the predecessor bar to the left edge of the dependent bar
- Both connected bars get a subtle highlight ring (`box-shadow: 0 0 0 2px #6c44f6` at 30%)

### Click (side panel)
Clicking a bar opens a right-side drawer panel:
- Width: 30% viewport, max 480px
- Slides in from right with framer-motion (200ms ease-out)
- Timeline remains visible and interactive behind it
- Panel contents (reusing `TaskDetailPanel` patterns):
  - Task name, status, priority, assignee
  - Date range with inline edit (click date to change)
  - Progress bar
  - Subtasks list with checkboxes
  - Dependencies (blocking / blocked by)
  - Recent activity feed
  - Quick actions: reassign, reschedule, mark complete

### Collapse/expand groups
- Chevron icon (`ChevronRight` / `ChevronDown`) on group header row
- framer-motion `AnimatePresence` for expand/collapse (height animation, 250ms, ease `[0.22, 1, 0.36, 1]`)
- Collapsed groups show as a thin 24px stripe with: group name, task count badge, and a miniature summary bar showing the group's date range

---

## Grouping & Swimlanes

### Default: Group by Phase
Tasks are grouped by their phase/category field (e.g., "Discovery", "Design", "Development", "Testing", "Launch"). Each group is a swimlane.

### Toggleable via toolbar
- **Phase** (default) — by task category/phase
- **Assignee** — one swimlane per person, reveals workload distribution
- **Status** — groups by not started / in progress / at risk / overdue / completed

### Swimlane rules
- Left panel labels are sticky (position: sticky, left: 0, z-index: 10)
- Maximum ~7 groups visible without scroll; groups beyond that require vertical scrolling
- Collapsed groups preserve their temporal position on the axis as a thin stripe
- Group header shows: chevron + group name + task count ("Design (4 tasks)")

---

## Zoom Levels

| Level | Column width | Header labels | Grid lines | Best for |
|---|---|---|---|---|
| **Week** | ~120px per day | "Mon Apr 6" (day+date) | Daily vertical lines | Execution tracking |
| **Month** (default) | ~30px per day | Week numbers or "Apr 7–13" ranges | Weekly vertical lines | Sprint planning |
| **Quarter** | ~4px per day | Month names ("April", "May") | Monthly vertical lines | Roadmap view |

### Zoom behaviour
- Smooth zoom transition (framer-motion scale, 200ms)
- Zoom centres on the current viewport midpoint (not on the left edge)
- Keyboard shortcuts: `W` (week), `M` (month), `Q` (quarter), `T` (today)
- Auto-fit: on first render, zoom level and scroll position are calculated to show all active tasks with the today line visible in the first 30% of the viewport

---

## Today Line

- Thin 1px vertical line spanning the full height of the timeline area
- Colour: `#6c44f6` at 40% opacity
- Date label at the top of the time axis header: "Today, Apr 4" in a small pill badge with `bg-[#6c44f6]/10` background and `#6c44f6` text
- The line renders above gridlines but below task bars (z-index ordering)

---

## Unscheduled Tasks Panel

A collapsible section pinned to the bottom of the timeline area, below all swimlanes.

### Collapsed state (default)
- Thin 36px bar: "Unscheduled (N tasks)" label + expand chevron
- Subtle dashed top border (`var(--border-2)`)

### Expanded state
- Shows unscheduled tasks as compact rows: task name, status pill, priority pill, assignee avatar
- Each row has a drag handle on the left
- **Drag-to-schedule**: drag a task from this panel onto the timeline area. On drop:
  - Task start date = the date column where dropped
  - Task end date = start date + 7 days (sensible default, editable)
  - Optimistic UI update: bar appears immediately
  - API call: PATCH task with new `startDate` and `endDate`
  - Task disappears from the unscheduled panel
  - If the API call fails, the bar is removed and the task returns to the unscheduled panel with an error toast

---

## Time Axis Header

- Sticky at the top of the scrollable timeline area (position: sticky, top: 0)
- Background: `var(--surface)` with subtle bottom border
- Date labels at each gridline
- Today pill badge positioned at the today line's x-coordinate
- Hover: cursor position shows a thin crosshair line with date tooltip for precise reading

---

## Mobile / Narrow Viewport (< 1024px)

The timeline view is a desktop planning surface. Below 1024px viewport width:

- The entire timeline is replaced with a **deadline-sorted task list**
- Each row: task name, status colour chip, priority badge, assignee avatar, due date
- Milestone tasks marked with a small `◆` icon
- Filterable by status and assignee
- No horizontal scrolling, no bars, no drag interactions

---

## Data Model Changes

The existing `WorkspaceTimelineTask` type needs extending:

```typescript
export interface WorkspaceTimelineTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number;
  startDate: string | null;    // NEW — ISO date
  endDate: string | null;      // NEW — ISO date (was dueDate)
  dueDate: string | null;      // kept for backwards compat
  category: string | null;     // NEW — phase/category for grouping
  assigneeUserId?: string | null;
  assigneeName?: string | null; // NEW — for display
  riskLevel: string;
  milestones?: Array<{         // NEW
    id: string;
    title: string;
    date: string;              // ISO date
  }>;
}
```

The `WorkspaceTimeline.dependencies` type is already correct:
```typescript
dependencies?: Array<{
  taskId: string;
  dependsOnTaskId: string;
  relation: string;
}>;
```

---

## Component Structure

```
ProjectWorkspaceView.tsx
  └── ProjectTimeline.tsx              (new — main container)
        ├── TimelineToolbar.tsx         (new — zoom, group by, colour by, search)
        ├── TimelineGrid.tsx            (new — time axis, gridlines, today line)
        ├── TimelineSwimlane.tsx        (new — one per group, expandable)
        │     └── TimelineBar.tsx       (new — individual task bar)
        ├── TimelineTooltip.tsx         (new — hover tooltip)
        ├── TimelineDependencyLines.tsx (new — SVG overlay for dep arrows)
        ├── UnscheduledPanel.tsx        (new — bottom collapsible panel)
        └── TaskDetailPanel.tsx         (existing — reused for click side panel)
```

All new components go in `apps/web/src/components/workspace/timeline/`.

---

## Animations

All using framer-motion with the existing project easing `[0.22, 1, 0.36, 1]`:

| Animation | Duration | Type |
|---|---|---|
| Group expand/collapse | 250ms | Height + opacity |
| Side panel slide-in | 200ms | translateX |
| Tooltip appear | 150ms | Opacity + scale(0.95→1) |
| Dependency line appear | 150ms | Opacity |
| Zoom level transition | 200ms | Scale |
| Bar appear (on schedule) | 200ms | Scale(0→1) + opacity |
| Unscheduled panel expand | 200ms | Height |

---

## Accessibility

- All bars have `role="button"`, `aria-label` describing task name + status + date range
- Status is never colour-only: text labels present in tooltips and side panel
- Keyboard navigation: Tab moves between bars, Enter opens side panel, Escape closes it
- Focus ring on bars: 2px `#6c44f6` outline
- Contrast: all status colours pass AA contrast with their respective text colours
- Touch targets: minimum 28px height on all interactive elements (bars, chevrons, buttons)
- `prefers-reduced-motion`: disables all framer-motion animations

---

## Dependencies

No new npm packages. Built with:
- Custom CSS positioning for bars (percentage-based within the grid, same approach as `GanttPage.tsx`)
- `framer-motion` — animations
- `lucide-react` — icons (ChevronDown, ChevronRight, Diamond, Search, etc.)
- CSS variables from `globals.css` for all theme tokens
