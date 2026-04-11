# Project Overview Tab — Redesign Spec

**Date:** 2026-04-04
**Scope:** Overview tab only (`apps/web` — project workspace view)
**Status:** Approved

---

## Summary

Redesign the Overview tab of the project workspace to match the founders' vision (PDF spec). The Overview becomes a fixed, curated project snapshot with five sections: project description, tabbed info card (AI Summary / Recent Activity / My Tasks), progress + action boxes, and status breakdown with donut chart. The header gains a Larry chat icon and an action center bell with badge count.

---

## Design Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Scope | Overview tab only |
| AI Summary format | 3-tab card: AI Summary \| Recent Activity \| My Tasks |
| Messages box | Skip for now (no messaging system yet) |
| Status colours | Semantic with Larry accent (green/grey/purple/amber/red, CTAs #6c44f6) |
| Risk box | Skip — action box sits beside the progress box |
| Area filtering | Use task groups from timeline data |
| Header changes | Keep current header, add bell icon + Larry chat icon |
| Bell dropdown | Simple headline list; click to jump to Action Center tab |
| Overview vs Dashboard | Overview = fixed summary; Dashboard = customisable analytics (separate concern) |

---

## Architecture

### Layout Structure (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Project Name | Status Badge | [Larry Chat] [Bell🔔] │
├─────────────────────────────────────────────────────────────┤
│ TABS: Overview* | Timeline | Task center | Action center |  │
│       Calendar | Dashboard | Files | Team | ⚙                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PROJECT DESCRIPTION                                   │  │
│  │ Short description text from project creation          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [AI Summary] [Recent Activity] [My Tasks]  ← tabs     │  │
│  │─────────────────────────────────────────────────────── │  │
│  │ Active tab content (see details below)                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────┐ ┌───────────────────────┐ │
│  │ PROGRESS BOX                 │ │ ACTION BOX            │ │
│  │ 53% ████████░░░░░            │ │        5              │ │
│  │ 12 of 23 tasks    Target Jun │ │  Actions Pending      │ │
│  │ [Area ▾] [Employee ▾]       │ │  Go to Action Center →│ │
│  └──────────────────────────────┘ └───────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────┐ ┌──────────────┐  │
│  │ STATUS CARDS (5 across)              │ │  DONUT CHART │  │
│  │ [4 Done][6 NS][8 IP][3 AR][2 Del]   │ │    (23)      │  │
│  └──────────────────────────────────────┘ └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Header Additions

**File:** `ProjectWorkspaceView.tsx` (header section)

Add two icon buttons to the existing header, right-aligned:

- **Larry Chat Icon** — Purple chat bubble (`MessageSquare` from lucide-react). Click dispatches a `larry:open` window event scoped to the current project. Uses existing project-scoped Larry chat infrastructure.
- **Action Bell Icon** — Bell icon with a red badge showing `pendingCount` (number of suggested events with status `pending_review`). Click toggles a dropdown overlay.

**Bell Dropdown:**
- Positioned absolutely below the bell icon, max-height 320px, scrollable.
- Lists pending action headlines (from `useLarryActionCentre().suggested`).
- Each item shows: action type pill + truncated `displayText` + relative timestamp.
- Click any item → sets `activeTab` to `"Action center"` and scrolls to that action.
- Empty state: "No pending actions" text.

#### 2. Project Description Card

**New component:** `ProjectDescriptionCard`

- Receives `project.description` as prop.
- Light purple-tinted card (`rgba(108,68,246,0.06)` background, `rgba(108,68,246,0.15)` border).
- Read-only. "PROJECT DESCRIPTION" label in `#6c44f6` uppercase.
- Fallback text if description is null/empty: "No description set. Add one in project settings."

#### 3. Tabbed Info Card

**New component:** `ProjectInfoTabs`

Three tabs in a single card component with local `activeInfoTab` state:

**Tab 1 — AI Summary:**
- Displays `outcomes.narrative` from the existing `useProjectData` hook.
- If narrative is null, show "Larry hasn't generated a summary yet."
- Read-only text block, styled with `line-height: 1.7`.

**Tab 2 — Recent Activity:**
- Scrollable list, max 20 items, max-height ~300px.
- Data source: `useLarryActionCentre().activity` (existing hook). This already contains Larry events like task completions, assignments, deadline changes, and auto-executed actions. No additional data source needed.
- Each row: activity description (left) + relative timestamp (right).
- Rows separated by subtle borders.
- Empty state: "No recent activity."

**Tab 3 — My Tasks:**
- Filters `tasks` array from `useProjectData` where `assigneeUserId === currentUser.id`.
- Each row: status dot (colour by status) + task title + priority badge + due date.
- Click a task row → sets `activeTab` to `"Task center"` (navigates to Task Center tab).
- Empty state: "No tasks assigned to you in this project."
- Sorted by due date ascending (soonest first).

#### 4. Progress Box

**New component:** `ProgressBox`

- Large completion percentage (28px font weight 800, `#6c44f6`).
- Animated progress bar with gradient fill (`#6c44f6` → `#9b7aff`).
- Below bar: "X of Y tasks completed" (left) + "Target: {targetDate}" (right).
- **Area filter dropdown:** Populated from timeline groups. Multi-select. When active, recalculates completion % from only tasks in selected groups.
- **Employee filter dropdown:** Populated from project members. Multi-select. When active, recalculates completion % from only tasks assigned to selected users.
- Both filters can be active simultaneously (intersection).
- Box expands vertically if multiple filter comparisons are shown (one progress bar per selection when comparing).

**Data sources:**
- `tasks` from `useProjectData()` for counts.
- `project.targetDate` for target date display.
- Timeline groups: fetched from `/api/workspace/projects/{id}/overview` → `timeline` data, which contains group/sub-group structure.
- Members: from `useProjectData()` or existing members endpoint.

#### 5. Action Box

**New component:** `ActionBox`

- Large number (36px font weight 800, `#f59e0b` amber).
- "Actions Pending" label.
- "Go to Action Center →" link in `#6c44f6`. Click sets `activeTab` to `"Action center"`.
- Data: `suggested.length` from `useLarryActionCentre()`.
- If count is 0, number shows "0" in green (`#22c55e`) and label changes to "All Clear".

#### 6. Status Cards

**New component:** `StatusCards`

Five cards in a row, each showing:
- Large task count number (24px weight 800).
- Status label below.
- Subtle tinted background matching the semantic colour.

Status mapping from data model:
| Display Label | Data Status | Colour |
|---------------|-------------|--------|
| Completed | `completed` | `#22c55e` (green) |
| Not Started | `not_started` | `#9ca3af` (grey) |
| In Progress | `on_track` | `#6c44f6` (purple) |
| At Risk | `at_risk` | `#f59e0b` (amber) |
| Delayed | `overdue` | `#ef4444` (red) |

Counts derived from `tasks` array by filtering on `status`.

#### 7. Donut Chart

**Reuse existing:** `DonutChart` component from `ProjectDashboard.tsx`.

- Positioned to the right of status cards.
- Segments coloured with the same semantic colours as the status cards.
- Centre shows total task count + "total" label.
- Data passed as array of `{ label, count, colour }`.

---

## Data Flow

All data comes from existing hooks — no new API endpoints needed:

| Component | Data Source | Hook |
|-----------|-----------|------|
| Project Description | `project.description` | `useProjectData()` |
| AI Summary | `outcomes.narrative` | `useProjectData()` |
| Recent Activity | `activity` array | `useLarryActionCentre()` |
| My Tasks | `tasks` filtered by `assigneeUserId` | `useProjectData()` |
| Progress Box | `tasks` + `project.targetDate` + `timeline` groups | `useProjectData()` |
| Action Box | `suggested.length` | `useLarryActionCentre()` |
| Status Cards | `tasks` grouped by `status` | `useProjectData()` |
| Donut Chart | same as Status Cards | `useProjectData()` |
| Bell Badge | `suggested.length` | `useLarryActionCentre()` |

---

## Status Colours (Semantic Palette)

```
Completed:   #22c55e  bg: rgba(34,197,94,0.08)   border: rgba(34,197,94,0.2)
Not Started: #9ca3af  bg: rgba(156,163,175,0.08)  border: rgba(156,163,175,0.2)
In Progress: #6c44f6  bg: rgba(108,68,246,0.08)   border: rgba(108,68,246,0.2)
At Risk:     #f59e0b  bg: rgba(245,158,11,0.08)   border: rgba(245,158,11,0.2)
Delayed:     #ef4444  bg: rgba(239,68,68,0.08)    border: rgba(239,68,68,0.2)
```

These are used for status cards, donut segments, priority badges, and status dots.

---

## Responsive Behaviour

- **Desktop (>1024px):** Full layout as described. Status cards 5-across, donut beside them.
- **Tablet (768–1024px):** Progress + Action boxes stack vertically. Status cards wrap to 3+2 or 2+3. Donut moves below status cards.
- **Mobile (<768px):** All sections stack vertically. Status cards become 2-across grid. Tabbed info card tabs become scrollable.

---

## File Changes

| File | Change |
|------|--------|
| `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` | Refactor Overview tab section. Add bell icon + dropdown + Larry chat icon to header. Extract overview into new component. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ProjectOverviewTab.tsx` | **New.** Orchestrates all overview sections. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ProjectDescriptionCard.tsx` | **New.** Static description card. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ProjectInfoTabs.tsx` | **New.** Tabbed card with AI Summary, Recent Activity, My Tasks. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ProgressBox.tsx` | **New.** Progress bar with area/employee filtering. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ActionBox.tsx` | **New.** Pending action count + link. |
| `apps/web/src/app/workspace/projects/[projectId]/components/StatusCards.tsx` | **New.** 5 status count cards. |
| `apps/web/src/app/workspace/projects/[projectId]/components/ActionBellDropdown.tsx` | **New.** Bell dropdown overlay. |

---

## Out of Scope

- Dashboard tab changes (separate spec)
- Other tabs (Timeline, Task Center, Action Center, Calendar, Files, Team, Settings)
- New API endpoints
- Database schema changes
- Messages/messaging system
- Risk box (explicitly excluded)
