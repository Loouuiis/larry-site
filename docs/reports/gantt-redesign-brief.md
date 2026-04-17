# Gantt Chart Redesign Brief

**For:** a reasoning agent tasked with proposing a restructure plan for Larry's Gantt chart.
**Date:** 2026-04-16
**Written by:** Claude (implementation agent, shipping the current Gantt)
**Status of current work:** Shipped to production at www.larry-pm.com (PRs #65 + #66 merged). User reviewed and rejected the current design — wants a full restructure.

---

## 1. Larry — What it is

Larry is an **AI-powered project management tool** aimed at small-to-mid-size teams that currently struggle with Monday.com / Asana / ClickUp — too many fields, not enough AI. The product bet: an AI "PM in a box" that watches Slack/email/calendar, proposes tasks and next actions, and handles most of the tracking work itself, so humans can just *run projects* instead of *maintaining project-tracking software*.

**Target user:** a project manager or team lead at a 5–50-person company running 3–30 concurrent projects. They want to see what's happening, what's blocked, and what Larry recommends — without data-entry chore.

**Key product surfaces (sidebar order today):**
- Home
- My tasks
- **Timeline** ← this doc
- Actions (AI-suggested next actions)
- Notifications
- Meetings (transcript ingest)
- Calendar (monthly calendar, Google/Outlook sync)
- Documents
- Mail (email drafts)
- Chats
- Larry (the AI chat panel)
- Settings

**Visual identity**
- Brand colour: **#6c44f6** (Larry purple). All CTAs, the brand mark, active nav states.
- Neutrals lean lavender-white: surfaces are `#FFFFFF` over `#f6f2fc`, borders `#f0edfa`.
- Text: `#11172c` (primary), `#4b556b` (secondary), `#bdb7d0` (muted).
- Status palette for task bars/dots (kept from before this redesign):
  - Not started: `#d0d0d0` / dark `#b0b0b0`
  - In progress: `#7ab0d8` / dark `#5a94be` (cool blue)
  - At risk: `#d4b84a` / dark `#b89e3a` (amber)
  - Overdue: `#e87878` / dark `#c75a5a` (coral)
  - Completed: `#6ab86a` / dark `#52a352` (green)
- Radii: card 12px, button 8px, input 8px, badge 20px, dropdown 10px.
- Design philosophy: soft, lavender-tinted, low-contrast, lots of whitespace. Clean and modern — **not** Monday-style loud traffic-light boards. Think Linear / Notion / Superhuman, *not* Jira.

All the above are defined as CSS custom properties in `apps/web/src/app/globals.css` — use the variable, not the literal colour, when styling.

---

## 2. Stack & repo layout

Monorepo at `C:\Dev\larry\site-deploys\larry-site` (npm workspaces).

| Workspace | What |
|---|---|
| `apps/web` | Next.js 16 App Router, React 19, TypeScript. Tailwind v4 exists but is barely used — most styling is **inline styles** via `style={{ ... }}` against the CSS variables. Deploy target: Vercel. |
| `apps/api` | Fastify 5 + Zod + Vitest. Deploys on Railway at `larry-site-production.up.railway.app`. Auth via `@fastify/jwt`. |
| `apps/worker` | BullMQ job consumer (not relevant to Gantt). |
| `packages/shared` | Cross-workspace TypeScript types (`GanttTask`, `ProjectCategory`, `PortfolioTimelineResponse`, etc.). |
| `packages/db` | Postgres client + migrations. Schema applied on every API boot via idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. |
| `packages/ai` | Vercel AI SDK + Gemini. Not touched by Gantt work. |

**Routing pattern:** Next.js (web) exposes `/api/workspace/*` proxy routes that forward to the Fastify API under `/v1/*`. The proxy (`apps/web/src/lib/workspace-proxy.ts`) handles token refresh and session rotation. Do NOT expose `larry-site-production.up.railway.app` directly to the browser.

---

## 3. Current Gantt — entry points

Two entry points, one shared component.

### 3.1 Portfolio view — `/workspace/timeline`
- **Page:** `apps/web/src/app/workspace/timeline/page.tsx` (server component — just renders client).
- **Client:** `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`.
- Fetches `/api/workspace/timeline` → `/v1/timeline` (tenant-wide tree).
- Tree root is synthetic `"__root__"` category; its children are real categories (including a synthetic "Uncategorised" bucket if any project has `category_id = null`).
- Nav link added to `WORKSPACE_NAV` in `apps/web/src/components/dashboard/Sidebar.tsx` between "My tasks" and "Actions", using `lucide-react` icon `GanttChartSquare`.

### 3.2 Per-project view — `/workspace/projects/[projectId]` → Timeline tab
- The project page `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` is a giant 1800-line client component with tabs (Overview / Timeline / Task center / Action center / Calendar / Dashboard / Files / Teams / Settings).
- When the Timeline tab is active, it renders `<ProjectGanttClient projectId={...} projectName={...} tasks={...} timeline={...} refresh={...} />` at line ~1797.
- `ProjectGanttClient` at `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx` builds a `project`-kind root (no Category level shown here) and renders the same `<GanttContainer>`.

---

## 4. Data model

### 4.1 `projects`
Already existed. New column added by this work:
```sql
category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL
```

### 4.2 `project_categories` (NEW)
```sql
id UUID PK,
tenant_id UUID NOT NULL (tenants FK, CASCADE),
name TEXT NOT NULL,
colour TEXT,                -- user-chosen hex, nullable
sort_order INT NOT NULL DEFAULT 0,
created_at / updated_at TIMESTAMPTZ
-- Row-level security enabled + tenant_isolation_project_categories policy
```

### 4.3 `tasks`
Already existed. New column:
```sql
parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE
```
**Depth limit: 1** — a task can have subtasks, but a subtask cannot have its own sub-subtask. Enforced at the API layer in `POST/PATCH /v1/tasks`.

### 4.4 `task_dependencies`
Already existed. Pre-existing table. `task_id` → `depends_on_task_id`, tenant-scoped. **Currently fetched by the timeline endpoints but NOT rendered anywhere in the UI** — known gap.

---

## 5. API endpoints

All under `/v1/*` in Fastify, proxied through `/api/workspace/*` in Next.js.

| Method + Path | Handler file | Purpose |
|---|---|---|
| `GET /v1/categories` | `apps/api/src/routes/v1/categories.ts` | List tenant's categories sorted by `sort_order`. |
| `POST /v1/categories` | same | Create — `{ name, colour?, sortOrder? }`. |
| `PATCH /v1/categories/:id` | same | Update. |
| `DELETE /v1/categories/:id` | same | Delete (projects re-parent to NULL via FK). |
| `POST /v1/categories/reorder` | same | `{ ids: [] }` — persists new `sort_order`. |
| `GET /v1/timeline` | `apps/api/src/routes/v1/timeline.ts` | **Portfolio tree.** Returns `{ categories: [...], dependencies: [...] }`. Synthetic "Uncategorised" bucket appended if needed. |
| `GET /v1/projects/:id/timeline` | `apps/api/src/routes/v1/projects.ts` | Per-project — returns `{ gantt: [tasks with parentTaskId], dependencies: [] }`. |
| `POST /v1/tasks` | `apps/api/src/routes/v1/tasks.ts` | Accepts `parentTaskId` with depth + same-project + same-tenant validation. |
| `PATCH /v1/tasks/:id` | same | Accepts `parentTaskId` for re-parenting. Rejects self-parent. |
| `POST /v1/projects` | `apps/api/src/routes/v1/projects.ts` | Accepts `categoryId`. |
| `PATCH /v1/projects/:id` | same | Accepts `categoryId` (including null to uncategorise). |

### API response shapes

```ts
// GET /v1/timeline
type PortfolioTimelineResponse = {
  categories: Array<{
    id: string | null;          // null = Uncategorised synthetic bucket
    name: string;
    colour: string | null;
    sortOrder: number;
    projects: Array<{
      id: string;
      name: string;
      status: "active" | "archived";
      startDate: string | null;
      targetDate: string | null;
      tasks: GanttTask[];       // flat; client re-builds parent/child tree
    }>;
  }>;
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>;
};

type GanttTask = {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: "not_started" | "on_track" | "at_risk" | "overdue" | "completed";
  priority: "low" | "medium" | "high" | "critical";
  assigneeUserId: string | null;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  progressPercent: number;
};
```

Types live in `packages/shared/src/index.ts` and are re-exported from `apps/web/src/components/workspace/gantt/gantt-types.ts`.

**Important data-quirk:** the DB `task_status` enum has more values than `GanttTask.status` (`backlog`, `in_progress`, `waiting`, `blocked`, `completed`). The per-project timeline route returns raw enum values. A helper `normalizeGanttStatus()` in `gantt-utils.ts` maps them to the 5-status Gantt palette:
- backlog / not_started → `not_started`
- in_progress / on_track → `on_track`
- waiting / at_risk → `at_risk`
- blocked / overdue → `overdue`
- completed / done → `completed`

---

## 6. Component architecture — `apps/web/src/components/workspace/gantt/`

One folder, all the Gantt pieces. **All styling is inline `style={{ ... }}` using CSS vars.** No Tailwind, no CSS modules.

| File | Role |
|---|---|
| `gantt-types.ts` | Re-exports shared types. Defines `GanttNode` discriminated union (category / project / task / subtask), `ZoomLevel` (`week` / `month` / `quarter`), `ROW_HEIGHT = 36`. |
| `gantt-utils.ts` | Pure functions: `buildPortfolioTree`, `buildProjectTree`, `buildTaskForest` (parent/child nesting), `flattenVisible` (returns `FlatRow[]` respecting expand set; skips the root node), `rollUpBar` (parent bar math — min start / max end / progress-weighted by duration), `computeRange` (W/M/Q axis padding), `dateToPct`, `addDays`, `daysBetween`, `normalizeGanttStatus`, `normalizePortfolioStatuses`. |
| `gantt-utils.test.ts` | Vitest tests for the above. 8 tests. |
| `GanttContainer.tsx` | Top-level orchestrator. Owns state: `zoom`, `search`, `outlineWidth` (resizable 220–520px, default 320), `hoveredKey`, `selectedKey`, `expanded: Set<string>`. Memo-builds `allTasks`, `range`, `rows`. Passes down to `<GanttToolbar>`, `<GanttOutline>`, `<GanttGrid>`. Exposes `onAdd`, `onOpenDetail` callbacks. |
| `GanttToolbar.tsx` | Top bar with `W` / `M` / `Q` zoom pills (active = filled purple), `Today` button, `Expand/Collapse all` button, 240px search input, and a trailing purple "+ Add" button (shown only when `canAdd`). |
| `GanttOutline.tsx` | Left sidebar. Sticky left, 320px default. Renders `<GanttOutlineRow>` per visible row. Has a drag handle on the right edge to resize. |
| `GanttOutlineRow.tsx` | Per-row outline item. Height 36px, indent `12 + depth*12`, chevron if hasChildren (rotates 90° on expand), 14px kind icon (`C` / `P` / `·` / `◦`), title. Selected row gets a 3px left purple border; hovered row gets `surface-2` bg. Label weight varies by kind — category 700 uppercase 12px, project 600 13px, task 500 13px, subtask 400 12px in `text-2`. |
| `GanttGrid.tsx` | Right time-axis pane. `forwardRef`d so parent can scroll-jump to today. Sticky header row (34px) with markers generated by `generateMarkers(range, zoom)` — days when zoom=week, weekly Monday labels when month, monthly labels when quarter. Single vertical **today line** at `rgba(108,68,246,0.4)`. Renders `<GanttRow>` per visible flat row. |
| `GanttRow.tsx` | Per-row bar area. If the node is a task/subtask and has dates, renders `<GanttBar>`. If a container node, gathers all descendant tasks, computes `rollUpBar` and renders a rollup `<GanttBar variant="category"|"project">`. 36px tall, bottom border, selected row has faint purple tint. |
| `GanttBar.tsx` | The bar itself. 5 variants with different heights/colours: `category` (20px, bold, surface-2 band), `project` (16px, Larry purple), `task` (16px, status-var), `subtask` (10px, status-var lower opacity), `rollup` (6px, thin purple). Progress fill is a solid inner div sized to `progressPercent`. Label rendered inside bar unless variant is `subtask` or `category` (categories show the name in the outline row instead). |
| `ProjectGanttClient.tsx` | Per-project wrapper. Maps `WorkspaceTimelineTask` → `GanttTask`. Uses `buildProjectTree`. `onAdd` opens the `AddNodeModal` in `task` or `subtask` mode depending on whether a task row is selected. |
| `PortfolioGanttClient.tsx` | Portfolio wrapper. Fetches, normalises statuses, builds tree. `onAdd` opens the modal in `category` or `project` mode depending on whether a category is selected. Error state = `"Couldn't load timeline: HTTP <code>"` text. Loading state = `"Loading…"` text. |
| `AddNodeModal.tsx` | Centred modal, 380px wide. 4 modes: `category` (name + colour picker), `project` (name + hidden categoryId), `task` (title + optional due date, project context), `subtask` (same + parent task context). Primary button is Larry purple. POSTs to the matching proxy, then calls `onCreated` to refetch. |

### Flow of a click on "+" in the portfolio view with "Client work" category selected:

1. User clicks `+` in `GanttToolbar`.
2. `GanttContainer` calls `onAdd({ selectedKey: "cat:<uuid>" })`.
3. `PortfolioGanttClient.handleAdd` sets local state `addCtx = { mode: "project", parentCategoryId: "<uuid>" }`.
4. `<AddNodeModal mode="project" parentCategoryId=... />` renders.
5. User types name, clicks "Create".
6. Modal POSTs to `/api/workspace/projects` with `{ name, categoryId }`.
7. Next.js proxy forwards to `/v1/projects` on Railway.
8. On success, modal calls `fetchTimeline()` on `PortfolioGanttClient`, closes itself.
9. `setData(...)` triggers a re-render → `buildPortfolioTree` → tree shows the new project under "Client work".

---

## 7. What the user sees today (screenshots reviewed this session)

Two production screenshots from the user on 2026-04-16:

### Screenshot 1: error state ("client-side exception")
Happened because the user clicked the Timeline nav before the merge had fully propagated on Vercel — stale JS bundle, module resolution for `@larry/shared` missed. **Fixed** by adding `@larry/shared` as a dep of `@larry/web` and building it in `vercel-build`. No longer reproduces.

### Screenshot 2: Nordvik Bank project — Timeline tab
Showed a toolbar with `W / M / Q | Today | Group: Phase ▾ | Colour: Status ▾ | Search | Collapse all | + Add task` and a single flat swimlane labelled "Uncategorised (22 tasks)" with green/grey bars on dates. **This was the OLD `ProjectTimeline` component** — the user's browser was showing a cached pre-merge bundle. The NEW toolbar (what's actually deployed now) is different:
- No "Group by" dropdown
- No "Colour by" dropdown
- "Expand all" / "Collapse all" toggle (not just "Collapse all")
- "+ Add" / "+ Task" / "+ Subtask" depending on context
- No swimlane header — instead, a collapsible tree in the **left sidebar** with chevrons

### What the live Gantt actually looks like now (verified on prod by Playwright):
- Left: tree with chevrons. Portfolio view shows `▾ C UNCATEGORISED → ▾ P QA Test — Customer Onboarding Re… → · task rows (indented)`.
- Right: sparse grid with month headers (`6 Apr | 13 Apr | 20 Apr | ...`) and a faint vertical purple today-line. Mostly empty because the seed data has `startDate: null` on most tasks (only `dueDate` is set).
- No bars were visible for most tasks until PR #66 (shipped minutes ago) added `startDate = today` synthesis when only `dueDate` exists.

---

## 8. The user's actual complaint

Direct quotes from the conversation:

> "the timeline loads now. But as you can see in this screenshot, there's no option to make subcategories like Gantt doesn't look very different. Can you investigate this?"

> "The gantt chart is really not what i want it to be, it is really far off."

Unpacking what this likely means:

1. **"No option to make subcategories"** — legitimate gap. The `AddNodeModal` was missing at the time of the screenshot. It was shipped in PR #66 minutes before the user declared the whole thing "really far off", so they may not have tested it. The modal works but is very minimal (modal + form + submit). There is no in-tree "+" on each row, no context-menu, no drag-to-reorder, no drag-to-reparent. Creating a subtask requires: click a task row in the outline → the `+` label changes to `+ Subtask` → click it → modal.

2. **"Gantt doesn't look very different"** — likely a mix of:
   - Empty grid (seed tasks have no start dates, so no bars; PR #66 fixed this but user may not have refreshed).
   - The overall **visual feels flat and minimal** compared to a "proper" Gantt. Earlier user framing in the brainstorm (quoting the original request verbatim):
     > *"there should be a sidebar on the left where you can collapse everything. And fold out everything. And then you should also be able to see, you know, like, this time or this group of projects or tasks and then this group of projects"*
   - User rejected a "Linear-style simpler timeline" earlier in this same session (their own prior decision from 2026-04-04, superseded on 2026-04-15). They want a **proper, dense, Gantt** — more like MS Project / Smartsheet / TeamGantt than Linear's roadmap view.
   - Possibly missing visual things that make a Gantt feel Gantt-y:
     - **Dependency arrows between bars** — data is fetched but not rendered
     - **Drag bars to move / drag edges to resize** — not implemented
     - **Milestone diamonds** — not implemented
     - **Critical path highlighting** — not implemented
     - **Unscheduled tasks panel** — was in the old component, removed, not replaced
     - **Assignee avatars on bars** — data available, not shown
     - **Progress fill inside bars** — implemented but subtle
     - **Weekend / non-working-day shading** — not implemented
     - **Sticky column headers that follow horizontal scroll** — partially (header is sticky top, not left)
     - **Inline "+ row" affordances** — no in-line "add task here" rows between bars like MS Project
     - **Column header sticky on scroll horizontally** — currently only vertically sticky
     - **Expand/collapse a group by clicking the summary bar itself** — only the outline chevron works
     - **The category/project rollup bar is thin (6–20px) and translucent** — may read as "nothing" rather than "parent span"
     - **Bars are labelled with task title, but truncated aggressively** — long titles become `[DM …]`-style ellipses because the bar is narrow

3. **Implicit gap — it doesn't tell a story**. A user opening the portfolio Gantt should immediately see *where the company is this quarter*. The current empty-grid-with-tiny-bars does not convey that. It needs more visual density, maybe status pills, risk indicators, assignee avatars, dependency arrows, today highlighting beyond one vertical line.

---

## 9. Known feature gaps documented at ship time (in PR #65 body)

These were explicitly deferred in the plan and listed as follow-ups:

1. **Dependency lines** — `task_dependencies` is fetched (both endpoints return it) but **no SVG overlay renders arrows** between dependent bars. A file `GanttDependencyLines.tsx` was specified in the spec but never written.
2. **Unscheduled panel** — old `ProjectTimeline` had an `<UnscheduledPanel>` at the bottom listing tasks with no dates. It was deleted with the rest of the `timeline/` folder and never re-added. Tasks without dates currently appear in the outline (left) but have no bar (right).
3. **Mobile fallback** — old `ProjectTimeline` swapped to `<TimelineMobileList>` on viewport < 1024px. Deleted. Current Gantt is not mobile-responsive; on a phone it just horizontally scrolls a tiny grid.
4. **Drag bars** — no drag-to-move, no drag-edge-to-resize. The old component supported drag-from-unscheduled-to-grid; this is also gone.
5. **In-bar labels are truncated aggressively** — long titles become `[...]`. No hover tooltip.
6. **Status pills on rows / assignee avatar strips** — not rendered, even though data is available.
7. **Milestones** — no diamond marker rendering.
8. **Baseline vs actual** — not implemented.
9. **Critical path** — not implemented.
10. **Reorder rows (drag in outline)** — not implemented.
11. **Re-parent a task by drag** — not implemented; has to be done by editing fields.
12. **Re-parent a project to a different category by drag** — not implemented.

---

## 10. What works well today (don't break these)

- The 4-level tree builds correctly from the flat API response.
- Expand/collapse is per-node via chevron; "Expand all" toggles the whole tree.
- The row-alignment invariant (outline and grid share the same `flattenVisible` array, both use `ROW_HEIGHT = 36`) means outline row N lines up with grid row N exactly. Any restructure should preserve this.
- Search dims non-matches (opacity 0.35) rather than removing them, so the hierarchy stays visible.
- Rollup math (weighted-average progress, min-start / max-end) is correct and tested.
- Status-normalisation handles the DB↔UI enum mismatch — the `normalizeGanttStatus` helper must remain.
- API layer has good tenant isolation and depth validation. Backend is solid.
- DB has RLS on `project_categories`.

---

## 11. Design-token + layout cheat sheet for a restructure

If you redesign, **use these tokens**, not literals:

```css
--brand: #6c44f6;             /* PRIMARY everything — CTAs, active states, accent */
--brand-hover: #5b38d4;
--cta: #6c44f6;
--surface: #FFFFFF;            /* card/panel bg */
--surface-2: #f6f2fc;          /* hover/zebra bg, lavender tint */
--border: #f0edfa;             /* default border */
--border-2: #bdb7d0;           /* emphasised border */
--text-1: #11172c;             /* primary text */
--text-2: #4b556b;             /* secondary text */
--text-muted: #bdb7d0;         /* disabled-ish, helper text */

--tl-not-started: #d0d0d0;     /* task bar fills (and their -dark variants) */
--tl-in-progress: #7ab0d8;
--tl-at-risk: #d4b84a;
--tl-overdue: #e87878;
--tl-completed: #6ab86a;

--radius-card: 12px;
--radius-btn: 8px;
--radius-input: 8px;
```

Typography: system sans stack (no custom font loaded). Text sizes in the Gantt currently: 10–13px (dense). Line-height default.

Dimensions in current Gantt:
- Row height: **36px** (all rows, all depths)
- Outline default width: 320px, min 220, max 520
- Depth indent: 12px + depth × 12px → depth 3 = 48px left padding
- Grid header height: 34px
- Today line: 1px `rgba(108, 68, 246, 0.4)`
- Bar heights: category 20, project 16, task 16, subtask 10, rollup 6

---

## 12. How to read the codebase quickly

Read in this order:

1. `docs/superpowers/specs/2026-04-15-portfolio-gantt-design.md` — the design spec this work was built against (370 lines).
2. `docs/superpowers/plans/2026-04-15-portfolio-gantt.md` — the implementation plan (2670 lines, fully annotated with exact file paths and code).
3. `apps/web/src/components/workspace/gantt/gantt-types.ts` (20 lines) then `gantt-utils.ts` (~180 lines) — the data layer.
4. `apps/web/src/components/workspace/gantt/GanttContainer.tsx` (~130 lines) — the orchestrator; start here to understand the state flow.
5. `GanttOutline.tsx`, `GanttGrid.tsx`, `GanttRow.tsx`, `GanttBar.tsx`, `GanttOutlineRow.tsx`, `GanttToolbar.tsx` — render layer.
6. `PortfolioGanttClient.tsx` + `ProjectGanttClient.tsx` + `AddNodeModal.tsx` — page wrappers.
7. `apps/api/src/routes/v1/timeline.ts`, `categories.ts`, `tasks.ts`, `projects.ts` — backend.
8. `packages/db/src/migrations/021_portfolio_gantt.sql` — DB migration.

Reference existing patterns (not Gantt-specific) that represent Larry's visual language:
- `apps/web/src/app/workspace/WorkspaceHome.tsx` — project-card grid on the home page
- `apps/web/src/app/workspace/projects/[projectId]/overview/` — the Project Overview tab, which the user has NOT complained about — this is a good template for the visual weight they expect.
- `apps/web/src/app/workspace/calendar/page.tsx` — the monthly calendar, also well-liked.

---

## 13. Constraints on any proposed restructure

1. **Don't touch the DB schema unless necessary.** The hierarchy (category → project → task → subtask) works; the depth-1 subtask limit is deliberate.
2. **Don't remove the portfolio-wide view.** It was the primary ask.
3. **Keep the shared-component pattern.** Portfolio and project views share one tree component.
4. **Keep the row-alignment invariant.** Outline row N must visually line up with grid row N.
5. **Use Larry palette variables.** No new brand colours.
6. **No external charting library.** Current implementation is hand-rolled inline styles; any replacement should not add dependencies (react-gantt, gantt-task-react, DHTMLX, etc.) unless strongly justified — Larry is sensitive to bundle size.
7. **Match Larry's visual tone.** Soft, lavender, low-contrast, Notion-ish. Not Microsoft Project's grey density. Not Jira's busy-ness.
8. **Must remain testable.** `gantt-utils.ts` has unit tests — pure-function helpers are preferred over in-component logic.
9. **Preserve existing API endpoints and types** in `packages/shared`. Backend is considered stable.
10. **Must work for an empty tenant** (zero categories, zero projects) — no crashes on `data.categories = []`.

---

## 14. What a good plan from you would contain

- A crisp articulation of **what aesthetic / interaction gap** the user is actually feeling (point 8 above is my best guess).
- A **new visual mock** — either an ASCII sketch or a reference to a named product ("like TeamGantt", "like ClickUp's Gantt", "like Airtable's timeline"). Include colours, row densities, which affordances live where.
- A **diff against the current implementation** — which components to keep, which to rewrite, which new ones to add.
- **File-level proposals** with exact paths under `apps/web/src/components/workspace/gantt/`.
- **State model** — what React state goes in which component. Stay under 10 useState in any one component.
- **Priority order** — what's MVP vs nice-to-have.
- A note on whether any of the known gaps (§9) are part of "making it feel like a proper Gantt" and therefore need to be in the first cut.
- An explicit **scope limit** — say what you're NOT proposing, to keep the plan shippable.

---

## 15. Relevant PR numbers and SHAs (for reference)

- **PR #65** (merged, initial Gantt): `d21a142`. Squashed into 29 commits on a feature branch.
- **PR #66** (merged, fixes): `3946ee9`. Added `AddNodeModal` + fixed empty-bar rendering + added `@larry/shared` to `@larry/web` deps for Vercel build.

Branch history lives in the repo at `C:\Dev\larry\site-deploys\larry-site`. Latest master SHA at time of writing: `3946ee9`.

---

*End of brief. Feel free to ask for more data — raw task samples, DB query results, additional screenshots — before drafting the plan.*
