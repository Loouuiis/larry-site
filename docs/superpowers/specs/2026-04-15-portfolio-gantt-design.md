# Portfolio & Project Gantt — Design Spec

**Date:** 2026-04-15
**Status:** Approved (brainstorming complete, autonomy granted to proceed)
**Supersedes:** `2026-04-04-timeline-view-design.md` (project-scoped swimlane timeline)
**Location:** `apps/web`, `apps/api`, `packages/db`

---

## 1. Problem

The current timeline (`apps/web/src/components/workspace/timeline/ProjectTimeline.tsx`) is:

1. **Project-scoped only.** There is no portfolio-wide view across all projects.
2. **Not a Gantt.** It renders flat swimlanes grouped by phase/assignee/status — no left-side outline, no hierarchy, no parent-rollup bars.
3. **No subtasks.** `tasks` has no `parent_task_id`; there is no way to break a task into children.
4. **No project grouping.** There is no concept of categories/folders for organising projects at the portfolio level.

User quote: *"there should be a sidebar on the left where you can collapse everything … and then you should also be able to see this group of projects or tasks and then this group of projects."*

## 2. Goal

Ship a proper Gantt chart with two entry points that share one component:

- **Portfolio Gantt** at `/workspace/timeline` — everything the tenant owns, grouped into categories.
- **Project Gantt** at `/workspace/projects/[projectId]` (Timeline tab) — replaces the existing `ProjectTimeline` component.

Both render a **4-level collapsible tree** on the left (Category → Project → Task → Subtask in portfolio mode; Project → Task → Subtask in project mode) with horizontally-scrollable time-bars on the right.

## 3. Non-Goals (v1)

- Drag rows to reorder the sidebar tree
- Drag a task to change its parent or category (use dropdown/modal instead)
- Baseline vs actual comparison
- Critical-path highlighting
- Resource levelling / auto-scheduling
- Mobile Gantt (keep the existing `TimelineMobileList` fallback on `< 1024px`)

## 4. Data Model

### 4.1 New table: `project_categories`

```sql
CREATE TABLE IF NOT EXISTS project_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT,                         -- nullable; null = neutral
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_categories_tenant_sort
  ON project_categories (tenant_id, sort_order, created_at);
```

### 4.2 `projects.category_id`

```sql
ALTER TABLE projects
  ADD COLUMN category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_tenant_category
  ON projects (tenant_id, category_id);
```

Projects without a category render under a synthetic **"Uncategorised"** group in the tree (not a real row in the DB — computed client-side).

### 4.3 `tasks.parent_task_id`

```sql
ALTER TABLE tasks
  ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX idx_tasks_parent ON tasks (tenant_id, parent_task_id);
```

- Same-tenant, same-project constraint enforced at the API layer (Fastify) with `CHECK`-style guard in the service.
- Depth limit: **1** (a subtask cannot have its own subtask in v1) — enforced at API validation.
- Deleting a parent cascades to its subtasks.
- A task with subtasks rolls up: its bar in the grid spans `min(children.start) … max(children.end)`; its progress is the weighted average of children progress.

## 5. API Changes

### 5.1 New: `GET /v1/timeline` (tenant-wide)

Returns the portfolio tree plus all scheduled tasks/subtasks + cross-project dependencies:

```ts
type PortfolioTimelineResponse = {
  categories: Array<{
    id: string | null;         // null = "Uncategorised"
    name: string;
    colour: string | null;
    sortOrder: number;
    projects: Array<{
      id: string;
      name: string;
      status: "active" | "archived";
      startDate: string | null;
      targetDate: string | null;
      tasks: GanttTask[];      // flat; tree re-built from parent_task_id client-side
    }>;
  }>;
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>;
};

type GanttTask = {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId: string | null;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;         // = due_date when end not tracked separately
  dueDate: string | null;
  progressPercent: number;
};
```

Proxy route on web: `apps/web/src/app/api/workspace/timeline/route.ts` (mirrors the existing project-timeline proxy pattern).

### 5.2 Extended: `GET /v1/projects/:id/timeline`

Already exists (see `apps/web/src/app/api/workspace/projects/[id]/timeline/route.ts`). Extend the Fastify handler to include `parentTaskId` on each task.

### 5.3 New: Category CRUD

```
GET    /v1/categories                  → list tenant's categories (sorted)
POST   /v1/categories                  → { name, colour?, sortOrder? }
PATCH  /v1/categories/:id              → { name?, colour?, sortOrder? }
DELETE /v1/categories/:id              → projects are re-parented to null
POST   /v1/categories/reorder          → { ids: string[] } (persists sort_order)
```

### 5.4 Extended: task creation accepts `parentTaskId`

`POST /v1/tasks` body gains an optional `parentTaskId`. Server validates:

- Parent exists, same tenant, same project
- Parent itself has `parent_task_id = NULL` (depth limit)

### 5.5 Extended: task PATCH accepts `parentTaskId` (re-parenting)

`PATCH /v1/tasks/:id` accepts `parentTaskId: string | null`. Same validation rules.

### 5.6 Extended: project PATCH accepts `categoryId`

`PATCH /v1/projects/:id` accepts `categoryId: string | null`.

## 6. Component Architecture (`apps/web/src/components/workspace/gantt/`)

New directory, cleanly renamed from `timeline/`. Existing `timeline/` primitives are refactored/moved; the old folder is retired.

| File | Responsibility |
|---|---|
| `GanttContainer.tsx` | Top-level orchestrator. Takes a `root: GanttNode` tree and renders `<GanttOutline>` + `<GanttGrid>` side-by-side. Drives zoom, selection, expand/collapse state. |
| `GanttOutline.tsx` | Left sidebar. Renders the tree as a list of `<GanttOutlineRow>`s with depth-based indent + chevron. Resizable width (280–480px). Sticky on horizontal scroll. |
| `GanttOutlineRow.tsx` | One row in the outline: chevron, type badge (C/P/T/·), title, status dot, due date, assignee avatar. Hover syncs with its bar in the grid. |
| `GanttGrid.tsx` | Right grid. Renamed from `TimelineGrid.tsx`. Same zoom/gridlines/today-line behaviour. Adds drag-to-resize and drag-to-move bars. |
| `GanttRow.tsx` | One row in the grid. Renders `<GanttBar>` for leaf nodes, rollup parent-bar for container nodes. Height must match outline row for alignment. |
| `GanttBar.tsx` | Renamed from `TimelineBar.tsx`. Gains variants: `category` (tall, muted band), `project` (primary purple), `task` (status colour), `subtask` (status colour 60% opacity, narrower). |
| `GanttToolbar.tsx` | Renamed from `TimelineToolbar.tsx`. Controls: zoom W/M/Q, search, expand-all / collapse-all, "Today" jump, filters (status / assignee), "+ Add" (context-aware: category vs project vs task). |
| `GanttDependencyLines.tsx` | Renamed from `TimelineDependencyLines.tsx`. Supports cross-project dependency lines in portfolio mode. |
| `GanttTooltip.tsx` | Renamed from `TimelineTooltip.tsx`. |
| `UnscheduledPanel.tsx` | Kept. Shown only in project mode (portfolio mode has too many to be useful). |
| `TimelineMobileList.tsx` | Kept as-is for the mobile fallback. |
| `gantt-utils.ts` | Renamed from `timeline-utils.ts`. Adds `buildTree`, `rollUpBar`, `flattenVisible` helpers. |

### 6.1 Data shape

```ts
type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] /* subtasks */ }
  | { kind: "subtask";  id: string; task: GanttTask };
```

Tree is built once per render from the flat API response.

### 6.2 Row alignment invariant

Each visible row has a fixed height (`ROW_HEIGHT = 36px`). Outline and grid render from the same `flattenVisible(tree, expandedSet)` array so row `i` is always at `y = i * 36`. This replaces the current `taskPositions` Map-based positioning in `ProjectTimeline.tsx`.

### 6.3 Rollup math (`rollUpBar`)

For a container node with visible children:

- `start = min(children.start)`
- `end   = max(children.end)`
- `progress = Σ(childProgress × childDurationDays) / Σ(childDurationDays)`

When **collapsed**, the container row's bar is rendered at full width. When **expanded**, the container shows a thinner "summary band" on top and individual children render below it.

## 7. Routes

### 7.1 `apps/web/src/app/workspace/timeline/page.tsx` (new)

Server component that fetches the portfolio tree via the proxy and passes to `<PortfolioGanttClient />`.

### 7.2 `apps/web/src/app/workspace/projects/[projectId]/`

The existing `ProjectWorkspaceView.tsx` renders `<ProjectTimeline />` in its Timeline tab. Replace with `<ProjectGanttClient />`, which wraps `<GanttContainer>` with the project subtree as root.

### 7.3 Workspace nav

Add to `WORKSPACE_NAV` in `apps/web/src/components/dashboard/Sidebar.tsx`:

```ts
{ id: "timeline", label: "Timeline", icon: GanttChartSquare, href: "/workspace/timeline" }
```

Extend the `WorkspaceSidebarNav` union type. Place the item between "My tasks" and "Actions".

## 8. Visual Design

### 8.1 Colours (existing Larry palette — no new tokens)

| Element | Token / value |
|---|---|
| Category row band | `var(--surface-2)` background, `var(--text-1)` bold text |
| Project bar | `#6c44f6` (brand) at 85% opacity, progress fill full opacity |
| Task bar | `var(--tl-*)` per status (existing) |
| Subtask bar | same colour, 60% opacity, `height: 10px` (vs 16px for tasks) |
| Rollup summary band | `rgba(108, 68, 246, 0.15)` fill with solid bottom border |
| Today line | `rgba(108, 68, 246, 0.4)` (existing) |
| Dependency lines | existing SVG lines (unchanged) |
| Tree chevrons | `var(--text-muted)` rotating 90° on expand |

### 8.2 Typography

- Outline row title: 13px/500
- Category label: 12px/700 uppercase
- Project label: 13px/600
- Task label: 13px/500
- Subtask label: 12px/400, `var(--text-2)`

### 8.3 Spacing

- `ROW_HEIGHT = 36px` for all visible rows
- Outline depth indent: `12px` per level (max 48px at depth 4)
- Outline default width: `320px`, min `220px`, max `520px`, drag-resizable

### 8.4 Interaction states

| Hover row | Outline + bar both tinted `var(--surface-2)`, dependency lines for that task brighten |
| Selected row | Left border indicator `3px solid var(--brand)` |
| Dimmed (search miss) | opacity 0.35 |
| Drag bar | cursor `ew-resize` on edges, `grab` on body; live ghost of new dates |

## 9. Add-Task / Add-Subtask / Add-Project / Add-Category Flow

Single "+" button in the toolbar opens a **context-aware popover** whose content depends on the currently-selected outline row:

| Selected | Popover offers |
|---|---|
| nothing (portfolio) | New category · New project |
| category | New project (pre-filled category) |
| project | New task (pre-filled project) |
| task | New subtask (pre-filled parent) |
| subtask | — (v1 depth limit) |

Reuses `AddTaskModal` (already in `ProjectTimeline.tsx`) with new fields for `parentTaskId` / `projectId`.

## 10. Empty States

- **No categories & no projects (portfolio):** centred CTA "Create your first project" → opens `ProjectCreateSheet`.
- **Category with no projects:** inline "+ Add project to this category" row.
- **Project with no tasks:** inline "+ Add task" row.
- **Task with no subtasks:** no child rows shown; "Add subtask" is a menu item on the task's context menu.

## 11. Performance

- The portfolio view may render hundreds of rows. Use `react-window` or manual virtualisation if `flattenVisible().length > 100`.
- Dependency lines draw only for currently-visible tasks (cull by `expandedSet`).
- Tree rebuild memoised on `[apiResponse, expandedSet]`.

## 12. Testing

### 12.1 API tests (`apps/api`)

- `GET /v1/timeline` returns nested structure, respects tenant isolation
- Task create/patch rejects depth-2 subtasks
- Task create/patch rejects cross-project parents
- Category delete re-parents projects to NULL
- Category reorder persists `sort_order`

### 12.2 Unit tests (`apps/web`)

- `buildTree` given flat tasks + parent ids
- `rollUpBar` math (progress-weighted, missing-dates edge cases)
- `flattenVisible` respects expandedSet

### 12.3 Component tests (Vitest + Testing Library)

- `<GanttOutline>` expand / collapse toggles visible rows
- `<GanttRow>` rollup bar position matches `rollUpBar` output
- Clicking a leaf row opens `TaskDetailPanel`

### 12.4 E2E (Playwright, existing harness)

- Create category → assign project → verify portfolio tree
- Create subtask → verify parent rollup spans its range
- Reorder categories via API, reload portfolio, verify order

## 13. Migration Plan

Single SQL migration file `packages/db/src/migrations/NNNN_portfolio_gantt.sql`:

1. `CREATE TABLE project_categories`
2. `ALTER TABLE projects ADD COLUMN category_id`
3. `ALTER TABLE tasks ADD COLUMN parent_task_id`
4. Indices from §4

Schema file `packages/db/src/schema.sql` is updated to match (idempotent `IF NOT EXISTS` clauses).

No data backfill needed — `category_id` and `parent_task_id` default to NULL, which renders as "Uncategorised" / flat tasks.

## 14. Rollout

1. Ship DB migration + API + web behind the existing deployment pipeline (Railway → Vercel).
2. The `/workspace/timeline` nav link is added immediately (no feature flag — same release cadence as other recent Larry nav additions).
3. The project Timeline tab switches to the new component on the same deploy. The old `timeline/` folder is deleted after smoke-test on production.

## 15. File Inventory (what changes)

**New:**
- `packages/db/src/migrations/NNNN_portfolio_gantt.sql`
- `apps/api/src/routes/timeline.ts` (or extend existing)
- `apps/api/src/routes/categories.ts`
- `apps/api/src/services/gantt.ts` (tree assembly, rollup helpers shared server-side if needed)
- `apps/web/src/app/workspace/timeline/page.tsx`
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`
- `apps/web/src/app/api/workspace/timeline/route.ts`
- `apps/web/src/app/api/workspace/categories/route.ts` (+ `[id]/route.ts` + `reorder/route.ts`)
- `apps/web/src/components/workspace/gantt/` (full new folder per §6)

**Modified:**
- `packages/db/src/schema.sql` — add new columns/table
- `packages/shared/src/types.ts` — add `ProjectCategory`, `GanttTask`, `GanttNode`
- `apps/api/src/routes/tasks.ts` — accept `parentTaskId`
- `apps/api/src/routes/projects.ts` — accept `categoryId`, include category_id in lists
- `apps/api/src/routes/projects/timeline.ts` (or wherever `GET /v1/projects/:id/timeline` lives) — include `parentTaskId`
- `apps/web/src/components/dashboard/Sidebar.tsx` — add Timeline nav item, extend `WorkspaceSidebarNav` union
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx` — swap `<ProjectTimeline>` → `<ProjectGanttClient>`
- `apps/web/src/app/dashboard/types.ts` — add `parentTaskId` to `WorkspaceTimelineTask`

**Deleted (after cutover):**
- `apps/web/src/components/workspace/timeline/` (whole folder, replaced by `gantt/`)

## 16. Open Risks

- **Schema.sql re-apply on boot:** Larry's schema file is applied as `CREATE TABLE IF NOT EXISTS` on every API start. The new `ALTER TABLE … ADD COLUMN` statements must be wrapped in `DO $$ … EXCEPTION WHEN duplicate_column THEN null END $$` blocks (existing pattern in `schema.sql`) to remain idempotent.
- **Depth limit enforcement:** the API must reject a PATCH that would move a parent task under another task. Validation is only half the story — an integration test must assert this.
- **Cross-project dependencies in portfolio view:** existing `task_dependencies` table is already tenant-scoped, not project-scoped, so no schema change needed; but the UI must handle the case where dependent tasks are in different projects.
- **Memory-index decision divergence:** the 2026-04-02 note said "Linear-style simpler timeline preferred over full Gantt." This spec supersedes that decision; memory entry must be updated on completion.
