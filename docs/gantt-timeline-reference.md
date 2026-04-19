# Gantt Timeline — Technical & UI Reference

Last updated: 2026-04-19 (post-Slice 5 polish).

This document explains exactly how Larry's Gantt timeline works end-to-end —
from the database row all the way to the pixels on screen. It's a field
manual for both engineers modifying the code and non-engineers trying to
understand a behaviour.

---

## 1. What it is

Larry has **two Gantt surfaces**:

1. **Org timeline** — `/workspace/timeline`.
   A portfolio-wide view of every category → project → task → subtask in the
   tenant. Top-level categories across the workspace appear as uppercase
   section headers; projects nest under their category; tasks nest under
   their project; subtasks indent once more.
   Rendered by `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`.

2. **Project timeline** — `/workspace/projects/:id?tab=timeline`.
   A single-project view. Renders the project's own project-scoped
   categories (if any) plus its tasks and subtasks.
   Rendered by `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`.

Both surfaces share the same sub-components (`GanttContainer`,
`GanttOutline`, `GanttOutlineRow`, `GanttGrid`, `GanttRow`, `GanttBar`,
`GanttDateHeader`, `GanttStatusChip`, `GanttContextMenu`, `GanttToolbar`,
`CategoryDot`). They differ only in **data source** and the **wrapper's
mutation handlers**.

---

## 2. File map

```
apps/web/src/
├── app/
│   └── workspace/
│       ├── timeline/
│       │   └── PortfolioGanttClient.tsx   ← org timeline wrapper
│       └── projects/[projectId]/
│           └── ProjectWorkspaceView.tsx   ← renders <ProjectGanttClient> inside the project tab
├── components/workspace/gantt/
│   ├── GanttContainer.tsx                 ← layout shell + toolbar + outline + grid + menu
│   ├── GanttToolbar.tsx                   ← zoom W/M/Q, Today, search, Categories drawer, add button
│   ├── GanttOutline.tsx                   ← left-side outline column (sticky), indent guides, resize handle
│   ├── GanttOutlineRow.tsx                ← single row renderer — dot, label, chevron, dnd wiring
│   ├── GanttGrid.tsx                      ← right-side bar canvas — date-header sticky, gridlines, today line
│   ├── GanttRow.tsx                       ← one row inside the grid (places the bar)
│   ├── GanttBar.tsx                       ← the coloured bar primitive (roll-up vs leaf variants)
│   ├── GanttDateHeader.tsx                ← months + day ticks + today pill
│   ├── GanttStatusChip.tsx                ← "NS / AR / OD / ✓" chip
│   ├── GanttContextMenu.tsx               ← right-click menu + submenu
│   ├── CategoryDot.tsx                    ← solid colour dot (with tier-specific size)
│   ├── CategoryColourPopover.tsx          ← modal swatch picker
│   ├── CategorySwatchPicker.tsx           ← 8-colour palette
│   ├── CategoryManagerPanel.tsx           ← org-level "Categories" drawer
│   ├── AddNodeModal.tsx                   ← shared create-row modal (category / project / task / subtask)
│   ├── GanttEmptyState.tsx                ← empty-workspace splash (no categories yet)
│   ├── gantt-types.ts                     ← shared type + colour constants
│   └── gantt-utils.ts                     ← pure helpers: trees, flatten, colour, dnd validation, search
apps/api/src/routes/v1/
│   ├── timeline.ts                        ← GET /v1/timeline (org payload)
│   ├── projects.ts                        ← GET /v1/projects/:id/timeline + POST /:id/move
│   ├── categories.ts                      ← GET/POST/PATCH/DELETE /v1/categories + POST /:id/move
│   └── tasks.ts                           ← GET/POST/PATCH tasks + POST /:id/move
packages/db/src/
│   ├── migrations/024_portfolio_gantt_v4.sql  ← subcategories + project-scoped + sort_order
│   └── schema.sql                         ← canonical schema
```

---

## 3. Data flow

```
 Postgres ──► Fastify route ──► Next.js proxy ──► React Query ──► tree builder ──► flattenVisible ──► GanttOutlineRow / GanttRow
  (tables)     /v1/timeline      /api/workspace/     ['timeline','org']  buildPortfolioTree    FlatRow[]       (inline styles)
                                 timeline             ['categories']      buildProjectTree
                                                      ['projects']
```

1. **Postgres** holds three tables: `project_categories`, `projects`, `tasks`.
   v4 added `project_categories.parent_category_id` and
   `project_categories.project_id` (the CHECK constraint enforces exactly one
   of those, or both null for a top-level org category).

2. **Fastify API** exposes:
   - `GET /v1/timeline` — assembles the whole tenant payload for the org
     view. Filters tasks whose `start_date IS NULL OR due_date IS NULL` so
     the Gantt never renders dateless bars.
   - `GET /v1/projects/:id/timeline` — single-project payload for the
     project tab; also filters null-date tasks.
   - `POST /v1/categories/:id/move` — reparent a category (DnD commit path).
   - `POST /v1/projects/:id/move` — reparent a project.
   - `POST /v1/tasks/:id/move` — reparent/cross-project move a task.
   - `POST /v1/categories`, `PATCH /v1/categories/:id`,
     `DELETE /v1/categories/:id` — CRUD.

3. **Next.js proxies** under `apps/web/src/app/api/workspace/**` forward each
   endpoint with session-cookie auth and emit the cross-tenant rewrite. They
   are thin passthroughs — no business logic.

4. **React Query** caches the payloads with a shared set of query keys:
   - `['timeline', 'org']` — the portfolio payload.
   - `['categories']` — flat list of all tenant categories.
   - `['projects']` — flat list of all tenant projects.
   - `['tasks']` — flat list of all tasks (consumed by Task Center).
   Mutations invalidate the relevant keys on settle; both Gantt surfaces
   share `['categories']` / `['projects']`, so navigating from the org
   timeline to a project timeline is synchronous from cache (no colour
   flash — see `NEUTRAL_ROW_COLOUR` in `gantt-types.ts`).

5. **Tree builders** (in `gantt-utils.ts`):
   - `buildPortfolioTree(resp)` produces a synthetic `__root__` category
     node whose children are the org-level categories, each nesting its
     subcategories then its projects then its tasks → subtasks.
   - `buildProjectTree(project, tasks, categories?)` produces a `project`
     node whose children are the project's project-scoped categories first,
     then its tasks.

6. **`flattenVisible(root, expanded, options)`** walks the tree in depth-first
   pre-order and emits `FlatRow[]` — one entry per visible row, with
   resolved `categoryColor`, `depth`, `hasChildren`, `height`, and
   (v4 Slice 5) an `emptyNote` suffix for empty containers.

7. **`GanttOutlineRow`** + **`GanttRow`** render each FlatRow: outline on
   the left (sticky column with dot / label / chevron / right-click
   handlers / dnd attributes); bar canvas on the right (`GanttBar` placed
   by `dateToPct`).

---

## 4. Data types (see `gantt-types.ts` + `packages/shared/src/index.ts`)

```ts
// Server payload
interface PortfolioTimelineResponse {
  categories: PortfolioTimelineCategory[];
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>;
}

interface PortfolioTimelineCategory {
  id: string | null;           // null = synthetic "Uncategorised" bucket
  name: string;
  colour: string | null;       // hex (e.g. "#ef4444"); null = Larry purple fallback
  sortOrder: number;
  parentCategoryId?: string | null;   // v4: subcategory under another category
  projectId?: string | null;          // v4: category scoped to a project (hidden from org view)
  projects: PortfolioTimelineProject[];
}

// Client tree (after buildPortfolioTree / buildProjectTree)
type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] }
  | { kind: "subtask";  id: string; task: GanttTask };

// Flat list emitted for rendering
type FlatRow = {
  kind: "node";
  key: string;            // "cat:<id>" | "cat:uncat" | "proj:<id>" | "task:<id>" | "sub:<id>"
  depth: number;          // 0 category, 1 project, 2 task, 3 subtask
  node: GanttNode;
  hasChildren: boolean;
  categoryColor: string;  // cascaded from the nearest ancestor colour
  dimmed?: boolean;       // search filter sets this
  height: number;         // 32 for cat/proj, 28 for task/subtask
  emptyNote?: string;     // "no scheduled tasks" / "no projects yet"
};
```

Colour constants (`gantt-types.ts`):

- `DEFAULT_CATEGORY_COLOUR = "#6c44f6"` — Larry purple; used when a real
  category has no colour set.
- `NEUTRAL_ROW_COLOUR = "#bdb7d0"` — cool grey; used when a project-timeline
  row's category colour hasn't loaded yet. **Never Larry purple**, because
  Larry purple reads as "meaningful default" (the brand colour) and users
  mistake it for a choice.

---

## 5. Row kinds & their shape

| Kind      | Key format      | Rendered by         | Has children?          | Draggable |
|-----------|-----------------|---------------------|------------------------|-----------|
| category  | `cat:<uuid>` or `cat:uncat` | `GanttOutlineRow` + tier-specific typography | Nested subcategories + projects | Yes, except `uncat` and `__root__` |
| project   | `proj:<uuid>`   | `GanttOutlineRow` + `tier=project` | Tasks (dateless filtered out by server) | Yes |
| task      | `task:<uuid>`   | `GanttOutlineRow` + `tier=task` | Subtasks | Yes |
| subtask   | `sub:<uuid>`    | `GanttOutlineRow` + `tier=subtask` | Never (depth-1 cap) | Yes |

**Synthetic rows** (not draggable, not right-clickable):
- `__root__` category — the tree wrapper; always hidden.
- `uncat` bucket — the synthetic "Uncategorised" grouping for projects
  with `categoryId = null`.

---

## 6. Visual system

### Typography (`GanttOutlineRow.TYPOGRAPHY_BY_TIER`)

| Tier      | Font size | Weight | Letter spacing | Transform | Colour          |
|-----------|-----------|--------|----------------|-----------|------------------|
| category  | 13 px     | 600    | 0.03 em        | uppercase | `--text-1`       |
| project   | 14 px     | 500    | —              | —         | `--text-1`       |
| task      | 14 px     | 400    | —              | —         | `--text-1`       |
| subtask   | 13 px     | 400    | —              | —         | `--text-2`       |

Uncategorised rows render in italic to signal "synthetic bucket".

### Row heights (`gantt-types.ts`)

- `ROW_HEIGHT = 32` — category + project rows.
- `ROW_HEIGHT_TASK = 28` — task + subtask rows.

### Bar variants (`GanttBar.tsx`)

| Variant    | Height | Fill                         | Outline          | Progress overlay |
|------------|--------|------------------------------|------------------|------------------|
| category   | 8 px   | `rgba(…, 0.35)` translucent  | 1.5 px solid     | —                |
| project    | 10 px  | `rgba(…, 0.35)` translucent  | 1.5 px solid     | —                |
| task       | 14 px  | Solid `categoryColor`        | none             | Darker fill up to `progressPercent%` |
| subtask    | 10 px  | Solid `categoryColor`        | none             | Same as task     |

The intent is a top-down visual hierarchy: translucent/outlined summaries
above, solid concrete work below. Matches Asana / Monday.com.

Roll-ups **skip the progress overlay** because aggregating progress across
heterogeneous children is misleading; the union-of-dates span is the useful
signal, not a fake %.

### Status chip (`GanttStatusChip.tsx`)

Appears only on **leaf rows** (task / subtask) to the right of the bar.

| Status       | Label | Foreground | Background            | Border            |
|--------------|-------|------------|-----------------------|-------------------|
| on_track     | —     | (no chip — solid bar is the signal) |       |                   |
| not_started  | NS    | `--text-muted` | transparent        | `--border`        |
| at_risk      | AR    | white      | `--tl-at-risk` (amber) | none             |
| overdue      | OD    | white      | `--tl-overdue` (red)   | none             |
| completed    | ✓     | white      | `--tl-completed` (green) | none           |

### Colour dot (`CategoryDot.tsx`)

The leftmost glyph on every outline row. Size varies by tier (category dot
is 6 px, project 6 px, task 4 px, subtask 3 px) so the eye can scan the
hierarchy at a glance. Uncategorised renders `--text-muted` instead of a
real colour.

### Colour cascade

A task's bar takes the colour of the nearest ancestor category (walked upward
through `parentCategoryId`). If a subcategory has `colour: null`, it
inherits the parent category's colour. If the project has no category at
all, the bar renders in `NEUTRAL_ROW_COLOUR` (project-scoped timeline) or
`DEFAULT_CATEGORY_COLOUR` (Uncategorised bucket on the org timeline).
Resolution lives in `buildCategoryColorMap()` + `flattenVisible.colourFor()`.

---

## 7. Interactions

### 7.1 Click-to-select
Clicking a row sets `selectedKey` on the container and emits
`onSelectionChange(key)`. The toolbar's add button uses this key to
contextualise its label (e.g. "+ Task in Modify Test 2026-04-18" when a
project is selected).

Selection is visualised with a 2 px left border in the brand colour + a
`--surface-2` background.

**Slice 5 guard**: click events that fire within 200 ms of a drag end are
suppressed so a successful drop doesn't also select the drop target.

### 7.2 Expand / collapse
Each category / project / task row has a chevron button on its left. Click
toggles expansion (updates `expanded: Set<string>` on the container).
Subtasks never expand — they're leaves.

The initial `expanded` set is populated in a `useEffect` to include every
key in the tree by default; collapsing is per-user, per-session (not
persisted to localStorage yet — Slice 1 D7 removed the global "Collapse
all" button in favour of this per-row control).

### 7.3 Right-click context menu
Right-clicking a row opens `GanttContextMenu` anchored at the pointer. The
menu items come from `contextMenuItemsFor({ rowKind, isUncategorised })`:

| Row kind                 | Items (top → bottom)                                                                                       |
|--------------------------|------------------------------------------------------------------------------------------------------------|
| category                 | Add subcategory • Rename • Change colour • Delete                                                          |
| category (Uncategorised) | No menu opens at all (Slice 5 #7)                                                                          |
| project                  | Open project • Move to category… (submenu) • Add task • Add category in this project • Delete              |
| task / subtask           | Open task • Change project's category… (submenu) • Remove from timeline • Delete                           |

Selecting "Move to category…" or "Change project's category…" opens a
submenu listing every real category plus the "Uncategorised" fallback.

Handlers for each action live in the Gantt wrapper
(`PortfolioGanttClient.handleContextMenuAction` or
`ProjectGanttClient.handleContextMenuAction`). They fire the matching API
mutation and invalidate the React Query cache.

### 7.4 Drag and drop
Powered by `@dnd-kit/core`. The outer Gantt wrapper installs a
`DndContext` with a `PointerSensor` at `{ distance: 5 }` so a 5-pixel
pointer move is required before a drag activates (ordinary clicks pass
through).

Every row except synthetic ones (`uncat`, `__root__`) wraps its div with
`useDraggable` + `useDroppable` using the row's DnD id:
- `dnd-cat:<id>` for a category
- `dnd-proj:<id>` for a project
- `dnd-task:<id>` for a task
- `dnd-sub:<id>` for a subtask

On drop, the wrapper builds a `DropContext` from the React Query payload
and calls `validateDrop(sourceKey, targetKey, ctx)` (pure function in
`gantt-utils.ts`). The result is either `{ ok: false, reason }` → shown as
a toast, or `{ ok: true, effect }` → dispatched to one of three mutations:

| effect.kind   | Server endpoint                    | Optimistic update?                          |
|---------------|------------------------------------|---------------------------------------------|
| moveCategory  | `POST /v1/categories/:id/move`     | Yes — flips `parentCategoryId` / `projectId` on the cached flat array |
| moveProject   | `POST /v1/projects/:id/move`       | Yes — plucks the project out of its current `projects[]` bucket and pushes into the target's |
| moveTask      | `POST /v1/tasks/:id/move`          | No — tasks are too deeply nested; relies on `onSettled` refetch (< 200 ms on Vercel) |

If the mutation fails, `onError` restores the snapshot from `onMutate` and
surfaces an error banner.

### 7.5 Supported DnD matrix (Slice 4 + Slice 4.5)

| Source ↓ \ Target → | category       | project                  | task                   | subtask        |
|---------------------|----------------|--------------------------|------------------------|----------------|
| category            | reparent (nest) | scope-to-project          | ✗                      | ✗              |
| project             | reparent        | ✗                         | ✗                      | ✗              |
| task                | ✗              | move (clears parent)      | make subtask of target | become sibling |
| subtask             | ✗              | move (clears parent)      | make subtask of target | become sibling |

Cells marked ✗ reject with a toast ("That move isn't supported — use the
right-click menu."). Users can always fall back to "Move to category…"
from the right-click submenu.

Validation rules enforced by `validateDrop()`:
- Self-drop → reject silently.
- Source or target is a synthetic bucket (`uncat`, `__root__`) → reject.
- Category onto its own descendant (cycle) → reject with "Can't move a
  category under its own descendant."
- Task onto its own subtask (self-parent) → reject.
- All other validation (project archived, RBAC) enforced server-side.

---

## 8. Toolbar (`GanttToolbar.tsx`)

Top strip, left to right:

1. **Zoom toggle** — W / M / Q (week, month, quarter). Changes
   `PX_PER_DAY_BY_ZOOM` and regenerates `TimelineRange` via `computeRange()`.
2. **Today** — scrolls the grid horizontally so today's vertical line is
   centred.
3. **Categories** — opens `CategoryManagerPanel` (org timeline only). The
   drawer lets users CRUD + reorder categories without going through
   context menus.
4. **Search** — case-insensitive substring match. Uses the v4 Slice 5
   `searchUnDimmedKeys()` so ancestors + descendants of hits stay visible.
5. **Add button** (right side) — label is contextual: `+ Category` when
   nothing is selected, `+ Project in <category>` when a category row is
   selected, `+ Task in <project>` when a project row, etc.

---

## 9. Date axis (`GanttDateHeader.tsx`)

Sticky-top header inside the grid canvas. Structure:

```
┌───────────────────────────────────────────────┐
│  [Today 19 Apr] (pill, 16 px band)            │
├───────────────────────────────────────────────┤
│  APR 2026    │ MAY 2026    │ JUN 2026   … (24 px, month band)
├──────────────┼─────────────┼──────────────────┤
│  16  17  18  │  20  27     │  …      (24 px, day-tick band)
└───────────────────────────────────────────────┘
Total: 64 px
```

Per-zoom pixel density (`PX_PER_DAY_BY_ZOOM`):
- **Week**: 48 px per day — ticks every day with weekday prefix ("Mon 16").
- **Month**: 14 px per day — ticks weekly (Mondays); label = day number only.
- **Quarter**: 8 px per day — ticks bi-weekly; label = day number.

Today marker:
- Vertical brand line runs through the Gantt canvas (`GanttGrid.tsx` line 59).
- "Today 19 Apr" pill pinned at the top of the axis band (Slice 5 #9).

---

## 10. Search dimming (`searchUnDimmedKeys` in `gantt-utils.ts`)

Rules:
- Query is case-insensitive + trimmed.
- Empty query → returns empty set → no dimming anywhere.
- Otherwise walks the tree and marks keys as "un-dimmed" when:
  1. The node itself matches (self-match), **and** its whole subtree stays
     un-dimmed (useful context), **and** every ancestor gets added too.
  2. Or a descendant matches — the node stays un-dimmed as context but
     siblings of the match that don't match stay dimmed.

So searching "design":
- Matching tasks stay crisp.
- Their project / category ancestors stay crisp (so users know *where* the
  match is).
- Sibling tasks under the same parent that don't match → dimmed (opacity 0.35).

---

## 11. Empty states

Three flavours:

1. **Whole workspace empty** (no categories anywhere) → `GanttEmptyState`
   takes over the whole Gantt area: "Let's organise your work" with a
   Create Category CTA.

2. **Empty project / empty category** (Slice 5 #1) → the row renders
   normally but its label gets a muted italic suffix:
   - Project with no children (server filtered null-date tasks out) →
     `Modify Test 2026-04-18 · no scheduled tasks`
   - Real category with no projects/subcategories → `Marketing · no projects yet`

3. **Dateless tasks** are filtered out of the Gantt at the API SQL layer
   (`start_date IS NOT NULL AND due_date IS NOT NULL`). They remain fully
   visible in Task Center. The rationale: a Gantt bar needs two anchors; a
   half-anchored task would render ambiguously.

---

## 12. Accessibility

- Every draggable row keeps `role="row"` (Slice 5 #3 — `role` attribute
  overrides dnd-kit's `role="button"` default). Screen readers announce
  the Gantt as a grid instead of a collection of buttons.
- Chevrons have `aria-label` that toggles between "Expand" and "Collapse".
- Context menu has `role="menu"` + `role="menuitem"`.
- Outline resize handle is `aria-hidden` (purely visual).
- Today pill is a static text element inside a sticky header — it
  announces naturally with the axis.

Known a11y gaps:
- Keyboard DnD is not wired yet (dnd-kit supports it via
  `KeyboardSensor` — future slice).
- Search does not currently announce match count to screen readers.

---

## 13. API endpoints in detail

### `GET /v1/timeline`
Returns `PortfolioTimelineResponse`. Joins `project_categories` →
`projects` → `tasks`. Filters `tasks.start_date IS NOT NULL AND
tasks.due_date IS NOT NULL`. Response shape is nested:
`{ categories: [ { …, projects: [ { …, tasks: [ … ] } ] } ] }`.

### `GET /v1/projects/:id/timeline`
Single-project Gantt payload. Same filter. Also returns a kanban summary
used elsewhere. The Gantt renderer only consumes `.gantt`.

### `POST /v1/categories`  /  `PATCH /v1/categories/:id`  /  `DELETE /v1/categories/:id`
Category CRUD. The POST schema accepts `parentCategoryId?` and
`projectId?`; exactly one may be set (CHECK constraint + Zod refine
enforce this).

### `POST /v1/categories/:id/move`
Payload: `{ parentCategoryId, projectId, sortOrder }`. Single-parent
invariant enforced. Cycle detection at DB layer via `moveCategory()` in
`lib/categories.ts`.

### `POST /v1/projects/:id/move`
Payload: `{ categoryId, sortOrder }`. Archived-project writes are
explicitly allowed here (rebucketing isn't a write in the usual sense).

### `POST /v1/tasks/:id/move`
Payload: `{ projectId?, parentTaskId? }`. Cross-project moves clear
`parentTaskId` unless a new same-project parent is supplied. Both source
and target projects checked for the archived-write lock.

All proxies live under `apps/web/src/app/api/workspace/**` and are thin
passthroughs using `proxyApiRequest` with `getSession()`.

---

## 14. Known limitations (documented, not bugs)

- **No reorder-within-parent drag**. Tasks lack a `sort_order` column, so
  dragging a task onto its sibling makes it a child instead. Will land
  with a schema migration in a later slice.
- **No drag-to-reschedule** on the bar itself. Bar clicks open the detail
  drawer; dragging the bar's edges to change dates is out of spec.
- **Task.category_id is not a column**. Tasks inherit their category from
  their parent project. Right-clicking a task → "Change project's
  category…" rewrites the whole project's category, not the task's
  (Slice 5 #2 relabel made this explicit).
- **No dependency arrows**. Server returns `dependencies` but the renderer
  ignores them. Would need an SVG overlay over the grid.
- **No baseline / critical path** features.
- **Mobile/tablet** layouts not implemented — desktop only.
- **Keyboard DnD** not wired (see §12).
- **Custom drag ghost** (a floating card that follows the cursor) not yet
  done — dnd-kit's default row-at-40%-opacity is used.

---

## 15. Extending the Gantt — common changes

### Adding a new row kind
1. Extend `GanttNode` union in `gantt-types.ts`.
2. Update `buildPortfolioTree` / `buildProjectTree` to emit it.
3. Add it to `flattenVisible` walker (key format + height + category color).
4. Render it in `GanttOutlineRow` (typography tier) and `GanttRow` /
   `GanttBar` (bar variant).
5. Add DnD id prefix in `GanttOutlineRow` + parser in `gantt-utils.parseDndKey`.
6. Add its rows to the matrix in `validateDrop()`.

### Adding a context menu action
1. Add the action id to `ContextMenuAction` union in `gantt-types.ts`.
2. Add the menu item to the per-kind branch in
   `contextMenuItemsFor()` in `gantt-utils.ts`.
3. Wire the handler in `PortfolioGanttClient.handleContextMenuAction`
   and `ProjectGanttClient.handleContextMenuAction`.

### Adding a new zoom level
1. Extend `ZoomLevel` union in `gantt-types.ts`.
2. Add a px-per-day entry to `PX_PER_DAY_BY_ZOOM` in `GanttDateHeader.tsx`.
3. Add a generator branch to `generateDateAxis()` in `gantt-utils.ts`.
4. Add a toolbar button in `GanttToolbar.tsx`.

### Changing a colour token
- Category colour palette lives in `CategorySwatchPicker.tsx` — 8 fixed
  hex colours users can choose from.
- `DEFAULT_CATEGORY_COLOUR` / `NEUTRAL_ROW_COLOUR` live in
  `gantt-types.ts`.
- Status chip colours reference CSS variables (`--tl-at-risk` etc.)
  defined in the global theme.

---

## 16. Test surface

- Unit tests: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts`
  (72 tests covering tree builders, flattenVisible, search dimming, DnD
  validation, date axis, colour helpers).
- API integration tests: `apps/api/src/lib/categories.test.ts`,
  `apps/api/src/routes/v1/categories.test.ts`,
  `apps/api/src/routes/v1/timeline.test.ts`,
  `apps/api/src/routes/v1/projects.test.ts`.
- Run web unit tests: `cd apps/web && npm test`.
- Run API tests: `cd apps/api && npm test`.

No Gantt-specific Playwright E2E suite yet — UI regressions are caught by
live QA against the Vercel preview.

---

## 17. Migration history

| Slice | Date       | Scope                                                           |
|-------|------------|-----------------------------------------------------------------|
| v3    | 2026-04-17 | Category → Project → Task → Subtask visual language baseline    |
| v4 S1 | 2026-04-18 | Schema migration 024 — subcategories + project-scoped + sort_order; null-date task filter; toolbar polish |
| v4 S2A | 2026-04-18 | Subcategory UI + project-scoped categories + inline colour + rename |
| v4 S2B | 2026-04-18 | Required start/due dates in Timeline task modal                 |
| v4 S2C | 2026-04-18 | Subtask parity in Task Center                                   |
| v4 S3A | 2026-04-18 | TanStack Query for org timeline (read side)                     |
| v4 S3B | 2026-04-18 | useProjectData on React Query                                   |
| v4 S3C-1 | 2026-04-18 | `/v1/categories/:id/move` + `/v1/projects/:id/move`           |
| v4 S3C-2 | 2026-04-18 | Nested category rendering in portfolio timeline               |
| v4 S3C-3 | 2026-04-18 | @dnd-kit drag-to-reparent for categories                      |
| v4 S4  | 2026-04-18 | Project-timeline category rows + colour-flash fix + full DnD matrix (PR #119 + #120 + #122) |
| v4 S4.5| 2026-04-18 | "Add category in this project" on project rows (PR #122) + DndContext on project timeline (PR #123) |
| v4 S5  | 2026-04-19 | Polish: a11y role=row, drag-select guard, search ancestor dim, empty-row suffix, roll-up bar hierarchy, today pill, week labels, icon-only outline add, resize handle (PR #125) |

---

Questions? Start at the file map (§2) and follow the data flow (§3). Every
behaviour described here has a matching comment block in the code
referencing its slice number.
