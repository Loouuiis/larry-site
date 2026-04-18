# Gantt v4 — Subcategories, Sync Layer, Drag-and-Drop & Bug Cleanup

**Date:** 2026-04-18
**Status:** Draft — awaiting Fergus review
**Author:** Claude (Opus 4.7, 1M context)
**Builds on:** `2026-04-17-gantt-v3-ui-design.md` (visual language unchanged)
**Source:** `C:\Users\oreil\Downloads\larry-timeline-bugs.md` + brainstorming exchange 2026-04-18
**Scope type:** Multi-bug cleanup + feature additions + sync-layer refactor

---

## 0. Context

Gantt v3 (shipped 2026-04-17) established a clean visual language for the portfolio timeline — Category → Project → Task → Subtask, Linear-lite rows, drawer-based detail, toolbar `+` button, category drawer. Real-world use surfaced nine issues across two deployments (org-wide timeline and project-specific timelines) plus Task Center parity gaps and a blocking 409 error. This spec resolves them holistically.

### The nine inbound items (from `larry-timeline-bugs.md`)

1. Duplicate `+` icon on "Add Task" button
2. "Collapse all" button non-functional
3. Cannot add categories inside project-specific timelines
4. No way to add a subcategory to an existing category
5. No way to change a category's colour
6. HTTP 409 when creating an org-wide category with a colour selected
7. Tasks without start/end dates render on the Gantt
8. Subtasks not surfaced in Task Center (Timeline-only)
9. Task/category CRUD not reliably synced across views

### Scope note (self-check)

Expanding Gantt to a true tree (adding the Subcategory level and project-scoped categories) is a data-model change. v3 explicitly excluded schema work; this spec re-opens it because subcategories cannot be faked at the presentation layer. DnD is also reintroduced — v3 marked it out-of-scope but the product ask now requires it. Nothing else from v3's scope is touched.

### In scope

- `apps/api/src/**` — categories table migration, `parent_category_id`/`project_id` columns, projects table migration, category route extensions, new project-scoped category endpoints
- `apps/web/src/app/workspace/timeline/**` — org-wide Gantt client
- `apps/web/src/components/workspace/gantt/**` — all Gantt components
- `apps/web/src/app/workspace/projects/[projectId]/TaskCenter.tsx` — subtask parity
- `apps/web/src/app/api/workspace/**` — Next.js proxy routes
- `apps/web/src/lib/query-client.ts` — new TanStack Query provider
- Targeted refactor: extract `useCategoryTree` / `useTaskMoveMutation` hooks so Timeline, Task Center, project views share one cache

### Out of scope

- Any non-Timeline / non-Task-Center view (My Tasks, Dashboard, Calendar) beyond making them read from the shared Query cache
- Drag-to-reschedule task dates on the Gantt bar itself (reparenting only, dates change via modal/drawer)
- Dependency arrows, baseline bars, critical path
- Mobile/tablet layouts (desktop only, same as v3)
- Visual token changes — v3 language stands
- AI / auth / worker / rate-limiting code

---

## 1. Locked design decisions

Confirmed with Fergus during the 2026-04-18 brainstorming exchange.

| # | Decision | Source |
|---|---|---|
| D1 | Category node has a flexible parent — `null` (top-level), another Category, **or** a Project. Exactly one of `parent_category_id`/`project_id` may be non-null. | Fergus, option (ii) |
| D2 | Projects default to top-level in the org timeline; can be moved into an org-level Category. "Uncategorised" bucket = projects with null `parent_category_id`. | Fergus, 2026-04-18 |
| D3 | Drag-and-drop supported for tasks, categories, and projects. Reparenting + reorder. Right-click "Move to…" coexists. | Fergus, 2026-04-18 |
| D4 | Shared data layer: **TanStack Query (React Query v5)**. Optimistic updates + `invalidateQueries` on settle. | Fergus, approach A |
| D5 | Timeline `+ Task` modal makes `startDate` and `endDate` required fields. Submit disabled until both filled. | Fergus, option A |
| D6 | Tasks with `start_date IS NULL OR end_date IS NULL` are filtered out of Timeline queries server-side (not hidden client-side). Still fully visible in Task Center and wherever else they surface. | Fergus, 2026-04-18 |
| D7 | **Delete** the "Collapse all" button entirely (YAGNI). Individual category/project rows still collapse on chevron click; that state persists per-user per-view in localStorage. | Fergus, 2026-04-18 |
| D8 | Subtasks in Task Center: indented under parent task, chevron toggle, full CRUD. API already supports (`parent_task_id`, `/v1/tasks`). | Fergus, 2026-04-18 |
| D9 | Colour cascade: a Gantt bar's colour = its task's category's colour, walking up the tree until a non-null `colour` is found. Category colour override on a child wins over its parent. | Fergus, 2026-04-18 |
| D10 | Subcategory creation entry point = right-click on any Category row → "Add subcategory". Same menu also offers "Change colour", "Rename", "Delete". | Spec §4 + Fergus |

---

## 2. Data model changes

### 2.1 `project_categories` table

```sql
ALTER TABLE project_categories
  ADD COLUMN IF NOT EXISTS parent_category_id uuid NULL
    REFERENCES project_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id uuid NULL
    REFERENCES projects(id) ON DELETE CASCADE;

-- sort_order already exists (migration 021)

ALTER TABLE project_categories
  ADD CONSTRAINT project_categories_single_parent_chk
    CHECK (
      parent_category_id IS NULL
      OR project_id IS NULL
    );

CREATE INDEX IF NOT EXISTS idx_project_categories_parent_category
  ON project_categories(tenant_id, parent_category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_categories_project
  ON project_categories(tenant_id, project_id, sort_order);
```

- Existing rows have both new columns `NULL` → remain org-level top-level. No backfill needed.
- `colour` stays nullable on `project_categories`; `NULL` = inherit.
- `CASCADE` on delete: deleting an org Category wipes its descendant Category tree. Deleting a Project wipes its project-scoped Categories. Tasks under those categories retain their rows but have `category_id` nulled at the API layer.

### 2.2 `projects` table

Existing `projects.category_id` already references `project_categories(id) ON DELETE SET NULL` (migration 021) — this is our "project's parent category" column; no new FK needed. We only add sort-order for DnD reorder:

```sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_category_sort
  ON projects(tenant_id, category_id, sort_order);
```

- Existing `ON DELETE SET NULL` on `category_id` already guarantees deleting a Category dumps its child projects to "Uncategorised" — no schema change needed.

### 2.3 `tasks` table — no schema change

Existing columns sufficient. One trigger addition: when a Category is deleted and a child Category's tasks reference it, those tasks need `category_id` reset. Simpler alternative — enforce at API layer in `deleteCategory` by cascading to `tasks.category_id = null`. **Chosen approach: API layer** to keep triggers out of the migration surface area.

### 2.4 Unique-constraint audit (root-cause hypothesis for #6, the 409)

The current `project_categories` table likely has a `UNIQUE (tenant_id, name)` or `UNIQUE (tenant_id, sort_order)` constraint that fires 409 on retry/duplicate submission. This spec's migration introduces `parent_category_id` and `project_id` — any existing unique index must be updated to include them or be scoped explicitly. The plan will verify this during implementation by:

1. `\d categories` on prod to enumerate constraints
2. Dropping any legacy unique index that ignores the new parent columns
3. Replacing with `UNIQUE (tenant_id, COALESCE(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), name)` — unique name within a parent scope, not globally.

The 401/403 in the screenshot (on `/api/auth/login` and `/api/workspace/invit...`) are almost certainly unrelated — `login` 401 is the expected response when the session cookie is already set (the login endpoint rejects authenticated callers), and the invitations 403 is likely the member-role gate. Both will be re-verified during implementation; if unrelated, they are not in scope for this spec.

---

## 3. API surface

### 3.1 Extended: `GET /v1/categories`

Response shape becomes tree-aware:

```json
{
  "categories": [
    {
      "id": "…",
      "name": "Marketing",
      "colour": "#6c44f6",
      "parentCategoryId": null,
      "projectId": null,
      "sortOrder": 0,
      "children": [ /* recursive — nested Categories */ ]
    }
  ]
}
```

- Server composes the tree in a single recursive CTE, sorted by `sort_order`.
- Projects and their project-scoped categories fetched via existing project endpoints (unchanged shape, but now include `parentCategoryId` on the project row).

### 3.2 Extended: `POST /v1/categories`

Payload gains two optional fields:

```ts
{
  name: string,
  colour: string | null,
  parentCategoryId: string | null,  // NEW
  projectId: string | null,          // NEW
  sortOrder?: number,
}
```

- Validation: exactly one of `parentCategoryId`/`projectId` may be non-null (both null = top-level).
- If Plan Task 1 surfaces a unique constraint that could collide, return **422** with a clear message rather than letting the DB raise 409. Default (no constraint collision) → standard 201.

### 3.3 Extended: `PATCH /v1/categories/:id`

Adds `parentCategoryId` and `projectId` to the update schema → enables moving a category between parents (reparent for DnD).

### 3.4 New: `POST /v1/categories/move`

Bulk reparent + reorder in one transaction (DnD commit path):

```ts
{
  id: string,
  newParentCategoryId: string | null,
  newProjectId: string | null,
  newSortOrder: number,
}
```

Response: updated subtree for cache replacement.

### 3.5 New: `POST /v1/projects/:id/move`

```ts
{
  newParentCategoryId: string | null,
  newSortOrder: number,
}
```

### 3.6 Extended: Timeline queries filter null-date tasks

Both `/v1/timeline` (org) and `/v1/projects/:id/timeline` add `WHERE start_date IS NOT NULL AND due_date IS NOT NULL` to the tasks join. D6.

### 3.7 Proxy layer (Next.js)

- `apps/web/src/app/api/workspace/categories/route.ts` → passthrough, already exists
- `apps/web/src/app/api/workspace/categories/[id]/route.ts` → passthrough, already exists
- `apps/web/src/app/api/workspace/categories/move/route.ts` → **new**
- `apps/web/src/app/api/workspace/projects/[id]/move/route.ts` → **new**

All proxies reuse the existing `proxyApiRequest` helper — no new auth surface area.

---

## 4. Client architecture

### 4.1 TanStack Query setup

- Add `@tanstack/react-query` v5 to `apps/web/package.json`
- `apps/web/src/lib/query-client.ts` — exports a singleton QueryClient with sensible defaults (`staleTime: 30_000`, `refetchOnWindowFocus: false` in dev, `true` in prod)
- `apps/web/src/app/providers.tsx` (existing file extended) — wrap children in `QueryClientProvider` alongside existing providers

### 4.2 Query keys

```ts
['categories']                          // org-level + nested tree
['projects']                            // flat project list
['project', projectId]                  // single project detail
['timeline', 'org']                     // org Gantt payload
['timeline', 'project', projectId]      // project Gantt payload
['tasks', 'project', projectId]         // Task Center feed
['tasks', 'my']                         // My Tasks feed
```

Invalidation rules (defined once in `apps/web/src/lib/query-invalidation.ts`):

| Mutation | Invalidates |
|---|---|
| Create/update/delete category | `['categories']`, `['timeline', *]` |
| Move category | `['categories']`, `['timeline', *]` |
| Create/update/delete task | `['tasks', *]`, `['timeline', *]`, `['project', affectedProjectId]` |
| Move task (reparent) | Same as task update |
| Move project | `['projects']`, `['timeline', *]` |

Deliberately coarse — accurate enough to prevent staleness, cheap enough that we don't need to reason about fine-grained invalidation during feature work. Refinement is a follow-up.

### 4.3 Optimistic updates

Pattern for every mutation:

```ts
useMutation({
  mutationFn: api.moveTask,
  onMutate: async (vars) => {
    await qc.cancelQueries({ queryKey: affectedKey });
    const snapshot = qc.getQueryData(affectedKey);
    qc.setQueryData(affectedKey, applyMoveOptimistically(snapshot, vars));
    return { snapshot };
  },
  onError: (_err, _vars, ctx) => {
    qc.setQueryData(affectedKey, ctx.snapshot);
    toast.error("Move failed — reverted");
  },
  onSettled: () => { /* invalidations from table above */ },
});
```

This is the rollback path that makes DnD feel native without risking silent data loss.

### 4.4 Drag-and-drop — library choice

**`@dnd-kit/core`** + `@dnd-kit/sortable`. Reasons: accessible by default (ARIA live regions, keyboard support), works with virtualised lists (needed for large timelines), TypeScript-first, actively maintained, ~10kB gz. Alternatives rejected: `react-dnd` (legacy API, worse perf), `framer-motion`'s `reorder` (limited to flat lists).

### 4.5 DnD rules

| Drop source | Valid drop target | Effect |
|---|---|---|
| Task row | Another task row (same or different parent) | Reorder within parent or reparent to target's parent |
| Task row | A Category row | Reparent task to that category. If category is project-scoped and in a different project, also updates task's `project_id`. |
| Task row | A Project row | Reparent task to that project with `category_id = null` (dropped in the project's "no category" bucket). Updates `project_id` if different project. |
| Category row | Another Category row (org-level → org-level) | Reparent — nests |
| Category row | A Project row | Converts to project-scoped category under that project |
| Category row | Top of tree | Becomes top-level org category |
| Project row | A Category row (org-level) | Reparent project into that category |
| Project row | Top of tree | Project becomes top-level (Uncategorised) |

Invalid drops are: dragging a Category onto one of its own descendants (cycle), dragging any node onto itself, dropping a Subtask onto anything other than its parent Task's position (subtask reordering within a parent only). Cross-project task moves are **allowed** — files-like behaviour per Fergus's brief. Validation runs in `onDragOver` before commit; invalid drops show a red "no" cursor and cancel.

### 4.6 Shared hooks (consolidation refactor)

- `useCategoryTree()` — returns the tree, handles invalidations on mutation
- `useProjectCategories(projectId)` — subset query filtered to project-scoped categories for one project
- `useTimelineTasks({ scope: 'org' | { projectId } })` — null-date-filtered task list
- `useTaskMutations()` — create/update/delete/move as a grouped hook
- `useCategoryMutations()` — same

Replaces all ad-hoc `fetch()` calls currently scattered across `PortfolioGanttClient.tsx`, `ProjectGanttClient.tsx`, `TaskCenter.tsx`.

---

## 5. UI changes

### 5.1 Bug #1 — duplicate `+` icon on Add Task button

Root cause: `<Plus />` icon rendered next to label "`+ Task`". Fix: remove the literal "+" from the label, keep the icon only. One-line change in `GanttToolbar.tsx`.

### 5.2 Bug #2 — Collapse all button

Delete the button and its state/handler entirely (D7). Individual row chevrons keep working. `GanttToolbar.tsx` + any related handler in `GanttContainer.tsx`.

### 5.3 Bugs #3, #4, #5, #10 — Category context menu

Extend `GanttContextMenu.tsx` with a category-row variant. Right-click on any Category row (org timeline or project timeline) opens:

- **Add subcategory** — prompts inline for name, creates with `parentCategoryId = clicked.id`, inherits parent's colour by default
- **Change colour** — opens `CategorySwatchPicker` (existing component) inline; selection `PATCH`es the category
- **Rename** — inline input replaces the label
- **Delete** — confirms ("Delete X and its N tasks' category link?"), then `DELETE`s. Child categories cascade-delete (FK). Tasks under deleted categories have their `category_id` set to `NULL` by the API and are re-rendered under the parent project's "no category" bucket (same bucket empty-state as a brand-new project). Tasks are never deleted by category deletion.

On a project timeline, an additional toolbar action "`+ Category`" creates a project-scoped category (`projectId = currentProject`). Uses the same modal as the org category drawer.

### 5.4 Bug #6 — the 409

Root cause is unknown until Plan Task 1 reproduces live (§2.4). Frontend change regardless: replace the crash-page logic in `PortfolioGanttClient.tsx` (line 50: `if (error) return <div>Couldn't load timeline: {error}</div>`) with an inline toast-and-stay-on-page for any non-auth error, so a transient 409 never blanks the Timeline again.

### 5.5 Bug #7 — dateless tasks on Timeline

- Backend: §3.6 filter
- Frontend modal: `startDate` and `endDate` become required fields with red helper text when empty. Submit button `disabled={!startDate || !endDate}`. A secondary link "Create without dates in Task Center →" navigates to Task Center's quick-add.

### 5.6 Bug #8 — Task Center subtask parity

Modify `TaskCenter.tsx`:

- Each task row gets a chevron toggle (matches Timeline). Collapsed state persists per-user in localStorage keyed by task id.
- Expanded state reveals subtasks as indented rows (24px indent).
- Each subtask row has its own checkbox (status), inline rename, date picker, and delete.
- A "+ Subtask" action appears beneath the parent when expanded.
- Visual style: Plus Jakarta Sans, `#6c44f6` accent, same row heights as Timeline subtask rows (28px). Chevron uses the existing outline chevron component from `GanttOutlineRow.tsx` — extract to shared component if not already.

### 5.7 Bug #9 — sync layer

The TanStack Query setup (§4.1–4.3) is the fix. Every view that currently does ad-hoc `fetch()` is migrated. Optimistic updates keep perceived latency near-zero; `invalidateQueries` on settle keeps data honest.

### 5.8 Drag-and-drop UI polish

- Grab cursor on hover over a row's drag handle (not the whole row — avoids hijacking clicks)
- 60% opacity ghost of the dragged row follows the cursor
- Lavender wash on valid drop targets (matches v3 hover token)
- Drop indicator: 2px lavender line between rows for insertion point
- No drag-to-reschedule on bars (out of scope) — the bar ignores drag events

---

## 6. Error handling

| Failure mode | Behaviour |
|---|---|
| Network error on mutation | Optimistic state reverts, toast: "Couldn't save — try again". No retry loop. |
| 422 from category create | Inline field error on name: "A category with that name already exists in this location." |
| 403 on any Gantt mutation | Toast: "You don't have permission to do that." Cache not mutated. |
| Drop target invalid (cycle, self-drop, subtask misplacement) | Drag cancels silently (no toast); validated in `onDragOver` so drop is never attempted. |
| Timeline load fails entirely | Inline error in the Gantt canvas with retry button, not a full-page error. Replaces the current "Couldn't load timeline: HTTP 409" crash. |

---

## 7. Testing

### Unit

- `gantt-utils.test.ts` extended: tree-building from flat categories list, colour cascade resolution, null-date filtering, drop-target validation (cycle detection).
- `categories.test.ts` extended (API): create with parent, create with project, unique-in-scope constraint, cascade delete behaviour.

### Integration (Vitest + pg test DB)

- Full create→move→delete category tree lifecycle
- Project deletion leaves orphan categories deleted (cascade), tasks retained
- Category deletion nulls `tasks.category_id` (API-layer cascade)

### E2E (Playwright MCP against Vercel preview — matches v3 L11)

Scripted scenarios:

1. Org timeline: create category, add subcategory via right-click, change colour, create task with dates, verify bar renders in cascade colour
2. Project timeline: `+ Category` creates project-scoped category, visible here but not on org timeline top-level
3. Dateless task: attempt create from Timeline modal → submit blocked; create from Task Center → succeeds → verify NOT present in Timeline view
4. DnD: drag task between subcategories, drag subcategory between parents, drag project into category, verify all persist after refresh
5. Sync: open Timeline in tab A, Task Center in tab B; create task in A → appears in B within the next stale window
6. Subtasks in Task Center: create, expand, rename, check off, delete
7. The 409 regression: create category with colour → succeeds → immediately create another with the same name in the same scope → 422 inline error, no 409

---

## 8. Migration / rollout

1. DB migration behind a single transaction — columns + constraint + indexes + unique-index replacement
2. Backend deploy first; existing frontend continues to work (new fields are all nullable and default to existing behaviour)
3. Frontend deploy second — introduces React Query provider + new UI
4. No feature flag needed — backward-compatible at every hop

Rollback plan: revert the web deploy; leave DB migration in place (it's additive). If the migration itself needs rollback, a reverse SQL script drops the new columns/constraint (provided in `apps/api/migrations/`).

---

## 9. Known unknowns

- **Exact source of the 409** — will be discovered via live reproduction in Plan Task 1 before any fix is committed.
- **Whether the 401/403 errors seen alongside the 409** are coincidental or share a root cause — assumed coincidental until proven otherwise during implementation.
- **Whether any `PortfolioGanttClient.tsx` state we migrate to React Query has subtle ordering dependencies** — verified by running the full Playwright suite after refactor.

---

## 10. Suggested execution order

1. Reproduce the 409 live; land a targeted fix + the DB schema migration for subcategories/project-scoped categories
2. API extensions (categories + projects + moves + timeline filter) → no UI impact yet
3. React Query provider + hooks + migrate `PortfolioGanttClient` to use them → baseline for sync
4. Migrate `ProjectGanttClient` + `TaskCenter` to hooks → sync layer live
5. Context menu extension (subcategories, colour change, rename, delete)
6. Project-scoped category creation UI
7. DnD layer
8. Task Center subtask parity
9. Required-dates modal + filter polish
10. Small polish: duplicate `+`, delete Collapse-all button
11. Playwright E2E run

Steps 1–2 ship independently. Steps 3–4 are one PR (both or neither). Steps 5–6 are one PR (shared UI). Steps 7–8 separate. Step 9 is one small PR. Step 10 is a final polish PR.
