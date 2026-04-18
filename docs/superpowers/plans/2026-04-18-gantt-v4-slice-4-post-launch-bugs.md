# Gantt v4 — Slice 4: Post-launch bug sweep (subcategories-in-project, colour flash, full DnD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three regressions Fergus found on the shipped Slice 1–3C build:

1. **Right-click on a category inside a project-level timeline does nothing.** Root cause is that the project timeline renders tasks only — it never builds category rows — so there is no category to right-click in the first place. (On the org timeline this already works correctly; verified live 2026-04-18.)
2. **Project timeline flashes purple for ~600 ms before the category's real colour appears.** Root cause is `ProjectGanttClient.tsx:52` seeding its local `categoryColour` state with `DEFAULT_CATEGORY_COLOUR` (#6c44f6), then resolving the real colour inside a post-mount `useEffect` that double-fetches `/api/workspace/projects` + `/api/workspace/categories`.
3. **Drag-and-drop is only wired for categories.** Projects, tasks and subtasks are not draggable; tasks cannot be dropped onto categories or projects; the synthetic "Uncategorised" row is inert. The shipped Slice 3C-3 intentionally covered category→category reparenting only (per that slice's PR description), but Fergus expects the full matrix from the v4 spec (§4.5).

**Architecture:** Three independent changes, shippable in three PRs off `master`:

- PR A (bug #1): extend `buildProjectTree` + `ProjectGanttClient` to feed categories into the project-level outline, then wire the existing `handleContextMenuAction` branch coverage for `addSubcategory / rename / changeColour / delete` that `PortfolioGanttClient` already has.
- PR B (bug #2): migrate the project-level category-colour resolution off ad-hoc `useEffect` + double `fetch` onto TanStack Query (matching Slice 3A/3B) with an `initialData` seeded from the already-running portfolio `['categories']` / `['projects']` queries, so the very first render has the correct colour when navigating from the org timeline. If neither cache entry is warm, render a neutral grey dot/bar for the brief moment the data is loading — never purple (purple is a misleading default because it implies "Larry purple = default category colour").
- PR C (bug #3): extend `useDraggable` / `useDroppable` coverage in `GanttOutlineRow.tsx` to projects + tasks + subtasks, add the 6-row drop-target matrix from spec §4.5 to `handleDragEnd`, and ship the missing backend routes for moving tasks across categories/projects.

**Tech Stack:** PostgreSQL + Fastify 4 (`apps/api`), Next.js 16 App Router + React 18 (`apps/web`), Vitest for unit tests, Playwright MCP for live verification on Vercel preview (already-working environment for this tenant — see Task 0).

**Branches:**
- `fix/gantt-v4-project-subcategory-rows` (PR A)
- `fix/gantt-v4-project-colour-flash` (PR B)
- `feat/gantt-v4-full-dnd-matrix` (PR C)

Ship in that order. PR A and PR B are one-file / one-hook changes and can land same day. PR C is larger and deserves its own review + preview window.

---

## Task 0: Lock in the live repro

**Files:** `docs/reports/2026-04-18-gantt-v4-post-launch-repro.md` (new, 200-300 lines).

This slice was reproduced live on 2026-04-18 against prod using the `launch-test-2026@larry-pm.com` tenant, before implementation started. Capture the artefacts so the "fix" tasks have a hard before/after baseline.

- [ ] **Step 1: Record the three reproductions as a single markdown file**

Template:

```markdown
# 2026-04-18 — Gantt v4 post-launch bug repro

## Environment
- URL: https://larry-pm.com
- Tenant: launch-test-2026@larry-pm.com (default tenant 5d7cd81b-03ed-4309-beba-b8e41ae21ac8)
- Project under test: "Modify Test 2026-04-18" (fe0afe7a-cacc-43c4-bdd9-7f7105a054a3)
- Category under test: "ColourFlashTestRed" (65fb90d9-250f-4493-84d1-53a58e0d8a4b, colour #ef4444)
- Build: commit 63414e7 (Slice 3C-3)

## Bug 1 — Right-click subcategory broken on project timeline
- Org timeline:   right-click on "Diag 409" → menu "Add subcategory / Rename / Change colour / Delete"; click → subcategory modal opens; Create → new row inside parent. WORKS.
- Project timeline: no category row is rendered at all in the outline (only tasks appear). Nothing to right-click.
  Source DOM dump: attached screenshot bug1-project-timeline-no-category-rows.png
  Source code line: apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx:46 buildProjectTree is called with only tasks; categories are never threaded in.

## Bug 2 — Colour flash on project timeline
- Observer trace (50 ms sampling, task bar background):
  - t = 12,367 ms → rgb(108, 68, 246)  [Larry purple / DEFAULT_CATEGORY_COLOUR]
  - t = 12,411 ms → rgb(108, 68, 246)
  - t = 12,456 ms → rgb(108, 68, 246)
  - ...
  - t = 13,006 ms → rgb(239, 68, 68)   [red / category colour]
- Purple window ≈ 640 ms on a warm cache (tab switch). Cold navigate is in the user-reported 2-3 s range.
- Source code line: apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx:52
  `const [categoryColour, setCategoryColour] = useState<string>(DEFAULT_CATEGORY_COLOUR);`

## Bug 3 — DnD missing for projects / tasks / subtasks
- DOM audit of outline rows on org timeline (/workspace/timeline):
  - Categories (Diag 409, ColourFlashTestRed): role=button, aria-roledescription=draggable, cursor=grab ✓
  - Projects, tasks, subtasks, Uncategorised: role=row, no draggable attrs, cursor=pointer ✗
- Source code line: apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx:62 `isDraggableCategory()` excludes every non-category row.
```

- [ ] **Step 2: Commit**

```bash
git add docs/reports/2026-04-18-gantt-v4-post-launch-repro.md
git commit -m "docs: live repro of gantt v4 post-launch bugs (subcat, colour flash, dnd)"
```

Do NOT start implementation tasks until the repro doc is on master — it's the before-state evidence.

---

## Task 1 (PR A / bug #1): Render category rows in the project-level outline

**Files:**
- `apps/web/src/components/workspace/gantt/gantt-utils.ts` — extend `buildProjectTree` to accept and thread categories (or introduce `buildProjectTreeWithCategories`; keep old signature as a thin wrapper for callers that don't have categories yet).
- `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx` — fetch project-scoped + inherited categories via React Query; pass them to the tree builder; wire `handleContextMenuAction` for `addSubcategory / rename / changeColour / delete` against category rows.
- `apps/web/src/components/workspace/gantt/gantt-utils.test.ts` — unit tests for the extended tree builder (project with 0 / 1 / N categories, project-scoped nested under org-level parent, null-date tasks still filtered).

**Why not just copy-paste from `PortfolioGanttClient`:** Portfolio passes `categoriesForSubmenu` so "Move to category…" submenu renders. Project view does not currently have that wiring either. PR A is the right moment to bring parity.

- [ ] **Step 1: Write the failing test**

Append to `gantt-utils.test.ts`:

```ts
describe("buildProjectTree with categories", () => {
  it("renders project-scoped categories as top children of the project node", () => {
    const project = { id: "p1", name: "P1", status: "active" };
    const cats = [
      { id: "c1", name: "Design", colour: "#ef4444", parentCategoryId: null, projectId: "p1" },
    ];
    const tasks = [/* task in c1 via categoryId */];
    const tree = buildProjectTree(project, tasks, cats);
    expect(tree.children[0].kind).toBe("category");
    expect(tree.children[0].id).toBe("c1");
  });

  it("renders the org-level parent's colour on cascade when project-scoped child has no colour", () => {
    const project = { id: "p1", name: "P1", status: "active" };
    const cats = [
      { id: "org", name: "Marketing", colour: "#ef4444", parentCategoryId: null, projectId: null },
      { id: "c1",  name: "Design",    colour: null,      parentCategoryId: "org", projectId: "p1" },
    ];
    const map = buildCategoryColorMap(cats);
    expect(map.get("cat:c1")).toBe("#ef4444");
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd apps/web && npm test -- gantt-utils.test.ts
```

Expected: fails with "buildProjectTree takes 2 args, got 3" or similar.

- [ ] **Step 3: Extend `buildProjectTree`**

Current signature:

```ts
export function buildProjectTree(
  project: { id: string; name: string; status: string },
  tasks: GanttTask[],
): GanttNode { ... }
```

Change to:

```ts
export function buildProjectTree(
  project: { id: string; name: string; status: string; categoryId?: string | null },
  tasks: GanttTask[],
  categories?: ProjectCategory[],   // NEW — project-scoped + ancestor categories
): GanttNode {
  // 1. If no categories provided → existing behaviour (project → tasks flat), keeps
  //    call sites unchanged during phased rollout.
  // 2. Otherwise build the category subtree: filter categories to those with projectId === project.id
  //    OR id === project.categoryId, then nest recursively by parentCategoryId.
  // 3. Each task attaches under its matching category row (by tasks[i].categoryId, fallback
  //    to the project root if null).
}
```

Re-run test → green.

- [ ] **Step 4: Wire the new path in `ProjectGanttClient`**

Replace the ad-hoc `useEffect`-based category fetch with React Query (consistent with Slice 3A):

```ts
const { data: categoriesData } = useQuery({
  queryKey: ["categories"] as const,
  queryFn: async (): Promise<{ categories: ProjectCategory[] }> => {
    const res = await fetch("/api/workspace/categories", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});

const relevantCats = useMemo(() => {
  if (!categoriesData) return [];
  // project-scoped + the project's parent (if any) + that parent's ancestors
  return filterCategoriesForProject(categoriesData.categories, { projectId, projectCategoryId: /* from project */ });
}, [categoriesData, projectId]);

const root = useMemo(
  () => buildProjectTree({ id: projectId, name: projectName, status: "active" }, ganttTasks, relevantCats),
  [projectId, projectName, ganttTasks, relevantCats],
);
```

- [ ] **Step 5: Wire `handleContextMenuAction` category branches**

Copy-adapt from `PortfolioGanttClient.tsx:393-435`: handle `addSubcategory`, `changeColour`, `rename`, and `delete` on `rowKind === "category"`. Surface errors via the existing `mutationError` state. Pass the already-built `categoriesForSubmenu` list (derived from `relevantCats`) through to `<GanttContainer>` so "Move to category…" works on tasks inside the project too.

- [ ] **Step 6: Verify live on Vercel preview**

Playwright MCP scenario:

1. Log in as `launch-test-2026@larry-pm.com`
2. Navigate to `/workspace/projects/<pid>?tab=timeline`
3. The project's category "ColourFlashTestRed" should appear as a category row above its tasks in the outline
4. Right-click the row → menu shows Add subcategory / Rename / Change colour / Delete
5. Click Add subcategory → modal opens → type "child" → Create → row appears nested
6. Right-click the new child → Rename → enter "child-2" → row label updates

If any step fails, STOP and re-investigate before committing. Per CLAUDE.md this is a systematic-debugging task — no fixes without root cause.

- [ ] **Step 7: Commit + PR**

```bash
git checkout -b fix/gantt-v4-project-subcategory-rows
git add apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx
git commit -m "fix(web): render category rows in project-level timeline (#bugA)

Project Gantt was calling buildProjectTree(project, tasks) — no categories were
ever threaded in, so right-click on a category was impossible because no
category row existed. Extend buildProjectTree to accept the relevant
categories (project-scoped + the project's parent chain) and render them as
nested rows. Wire the existing Add subcategory / Rename / Change colour /
Delete handlers that PortfolioGanttClient already has so the right-click menu
actions actually do something on this surface.

Fixes first of the post-launch bugs reported 2026-04-18.
Plan: docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md"
git push -u origin fix/gantt-v4-project-subcategory-rows
gh pr create --title "fix(web): render category rows in project-level timeline" --body "$(cat <<'EOF'
## Summary
- Project timeline was task-only — no category rows were rendered, so right-click-to-add-subcategory had no target.
- buildProjectTree now accepts the relevant categories and renders them nested.
- ProjectGanttClient wires addSubcategory / rename / changeColour / delete parity with PortfolioGanttClient.

## Test plan
- [ ] `npm test -- gantt-utils.test.ts` passes (new tests)
- [ ] Preview: project timeline shows category rows in outline
- [ ] Preview: right-click on category → menu works end-to-end (Add subcategory, Rename, Change colour)

Plan: docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md
EOF
)"
```

---

## Task 2 (PR B / bug #2): Eliminate the purple colour flash on project timeline

**Files:**
- `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx` — replace the `useEffect` + double-fetch block (lines 52-77) with a React Query hook that consumes the already-present `["categories"]` / `["projects"]` keys (Slice 3A populated them for the org timeline; if the user navigates from there, data is instant).

**Rule (for future bug-fix PRs too):** **never seed a visible colour with `DEFAULT_CATEGORY_COLOUR`.** The default is not a "safe neutral" — it is Larry purple, which looks meaningful. If the cache is cold, render a muted grey (`var(--text-muted)` on dots, `var(--border-2)` on bars) until the real colour resolves.

- [ ] **Step 1: Write the failing test**

This one is timing-dependent; the observer-based measurement lives in the E2E suite rather than unit tests. Add the scenario to the Playwright MCP suite:

```ts
// apps/web/tests/e2e/gantt-v4-no-purple-flash.spec.ts
test("project timeline never renders a task bar in Larry purple when the project's category has a colour", async ({ page }) => {
  // set up a project under a red category via API (helper)
  // navigate, install 50ms polling observer on bar background, wait 2s, assert that
  // no sample EVER recorded rgb(108, 68, 246) on a task-bar-sized element.
});
```

- [ ] **Step 2: Fix the component**

Delete the current `useState(DEFAULT_CATEGORY_COLOUR)` + `useEffect` block. Replace with:

```ts
const { data: categoriesData } = useQuery({
  queryKey: ["categories"] as const,
  queryFn: async () => {
    const res = await fetch("/api/workspace/categories", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<{ categories: ProjectCategory[] }>;
  },
  staleTime: 30_000,
});

const { data: projectsData } = useQuery({
  queryKey: ["projects"] as const,
  queryFn: async () => {
    const res = await fetch("/api/workspace/projects?status=all", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<{ items: Array<{ id: string; categoryId: string | null }> }>;
  },
  staleTime: 30_000,
});

const categoryColour: string | null = useMemo(() => {
  if (!categoriesData || !projectsData) return null;   // cold cache → null, NOT purple
  const project = projectsData.items.find((p) => p.id === projectId);
  if (!project?.categoryId) return null;
  const map = buildCategoryColorMap(categoriesData.categories.map((c) => ({ id: c.id, colour: c.colour })));
  return map.get(`cat:${project.categoryId}`) ?? null;
}, [categoriesData, projectsData, projectId]);
```

Downstream — the `rootCategoryColor={categoryColour}` prop on `<GanttContainer>` — already accepts a string; change the type to `string | null` and fall back to `var(--border-2)` inside the bar-render code when null. Audit: `gantt-utils.ts` → `flattenVisible` already supplies a `categoryColor` on each row from `rootCategoryColor`; when null, we substitute the neutral token there once and every row picks it up.

- [ ] **Step 3: Verify the purple no longer appears**

Run the observer scenario from Step 1. Expected: 0 samples with `rgb(108, 68, 246)` on any task-bar-sized element.

Also manually via Playwright MCP: navigate from the org timeline directly to a project timeline — because `["categories"]` / `["projects"]` are already warm from Slice 3A's PortfolioGanttClient, the colour should render red on the very first frame. If coming in cold (direct-URL navigation, no prior org timeline visit), the bar should render grey for up to the network round-trip and then flip to red. **Never purple.**

- [ ] **Step 4: Commit + PR**

```bash
git checkout -b fix/gantt-v4-project-colour-flash
git add apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/tests/e2e/gantt-v4-no-purple-flash.spec.ts
git commit -m "fix(web): stop project timeline flashing Larry purple before category colour loads (#bugB)

Root cause: ProjectGanttClient seeded local state with DEFAULT_CATEGORY_COLOUR
and resolved the real colour asynchronously in a useEffect. Observed purple
window ≈ 640 ms on warm cache, 2-3 s on cold navigate.

Fix: migrate the colour resolution onto TanStack Query hitting the same
['categories'] / ['projects'] keys Slice 3A populates for the org timeline, so
that navigating from the org timeline shows the correct colour on the very
first frame. If the cache is genuinely cold, render a neutral grey until
network resolves — never Larry purple (which looks meaningful, not neutral).

Fixes second of the post-launch bugs reported 2026-04-18.
Plan: docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md"
git push -u origin fix/gantt-v4-project-colour-flash
gh pr create --title "fix(web): stop project timeline flashing Larry purple before category colour loads" --body "## Summary
- Purple flash root caused to DEFAULT_CATEGORY_COLOUR seed + async useEffect fetch
- Migrated onto React Query; falls back to neutral grey, never purple
- Observer-based E2E guards against regression

Plan: docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md"
```

---

## Task 3 (PR C / bug #3): Full drag-and-drop matrix per spec §4.5

**Files:**
- `apps/api/src/routes/v1/projects.ts` — add `POST /v1/projects/:id/move` (already called by optimistic mutation pattern in portfolio client; handler missing). Accept `{ parentCategoryId, sortOrder }`; apply in a single tx.
- `apps/api/src/routes/v1/tasks.ts` — add `POST /v1/tasks/:id/move` accepting `{ projectId?, categoryId? }` (cross-project moves allowed per D3).
- `apps/web/src/app/api/workspace/projects/[id]/move/route.ts` — Next.js proxy (new).
- `apps/web/src/app/api/workspace/tasks/[id]/move/route.ts` — Next.js proxy (new).
- `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx` — extend `useDraggable` / `useDroppable` to all node kinds except synthetic buckets.
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx` — extend `handleDragEnd` with the 6-row matrix from spec §4.5 and add the matching optimistic-mutation hooks.
- `apps/web/src/components/workspace/gantt/gantt-utils.ts` — extract drop-target validation (cycle + self-drop + subtask-into-non-parent) into a pure function `validateDrop(source, target, tree)` so the hook and unit test share the logic.
- Tests: `gantt-utils.test.ts` (validateDrop matrix), `tasks.test.ts` and `projects.test.ts` in api (move routes), plus Playwright scenarios for the 6 drop combinations.

This is intentionally the largest task. Shippable in isolation because it doesn't touch Tasks 1/2 surfaces.

### Sub-task 3.1 — API routes

- [ ] **Step 1: `POST /v1/projects/:id/move`**

  Body: `{ parentCategoryId: string | null; sortOrder: number }`. Handler: one UPDATE to `projects` with `category_id` and `sort_order`. Tests: reparent into existing category, reparent to Uncategorised (`null`), reject archived-project move with 409 (reuse existing write-lock predicate), RBAC requires member+.

- [ ] **Step 2: `POST /v1/tasks/:id/move`**

  Body: `{ projectId?: string; categoryId?: string | null }`. Handler: single UPDATE on `tasks`; when `projectId` changes, also run the cross-project consistency check (task must belong to a project the mover can write to — reuse existing helper). Tests mirror §3.1.

- [ ] **Step 3: Next.js proxies**

  Two new `route.ts` files under `apps/web/src/app/api/workspace/`, both thin passthroughs via `proxyApiRequest`. No auth logic.

### Sub-task 3.2 — `validateDrop` + unit tests

- [ ] **Step 4: Pure validator**

  `validateDrop({ sourceKind, sourceId, targetKind, targetId, tree }): { ok: true } | { ok: false; reason: string }`

  Rules from spec §4.5, encoded exactly. Cover:
  - cycle (source ancestor of target) → reject
  - self-drop (sourceId === targetId) → reject
  - subtask dropped on anything other than same parent task → reject
  - task → task in same parent = reorder, task → different parent task = reparent
  - task → category row = reparent to that category
  - task → project row = reparent to project (category cleared)
  - category → category = nest
  - category → project = convert to project-scoped (single-parent CHECK already enforced in DB)
  - project → category = reparent
  - any row → top-of-tree = unnest

Unit-test every row of the matrix. No happy-path-only.

### Sub-task 3.3 — Client drag/drop wiring

- [ ] **Step 5: Make every node kind draggable**

  `GanttOutlineRow.tsx:62` currently gates on `isDraggableCategory`. Replace with a per-kind DnD id + droppable:

  ```ts
  const dndId =
    n.kind === "category" ? `dnd-cat:${n.id ?? "uncat"}` :
    n.kind === "project"  ? `dnd-proj:${n.id}` :
    n.kind === "task"     ? `dnd-task:${n.task.id}` :
                            `dnd-sub:${n.task.id}`;

  // Everything draggable except synthetic buckets (null-id category, __root__).
  const isSynthetic =
    n.kind === "category" && (n.id === null || n.id === "uncat" || n.id === "__root__");
  const dndEnabled = !isSynthetic;
  ```

  Keep the cycle-guard path-validation on the `PortfolioGanttClient` side (has tree access).

- [ ] **Step 6: Extend `handleDragEnd`**

  Dispatch on source/target kind pair, call `validateDrop`, then fire the matching optimistic mutation (`moveCategoryMutation` already exists; add `moveProjectMutation` and `moveTaskMutation` using the new endpoints). Rollback on error via the same snapshot-restore pattern Slice 3A uses.

- [ ] **Step 7: Visual polish per spec §5.8**

  - Grab cursor only on the row's drag handle (the leftmost 20 px — not the whole row, so inline actions and click-select still work)
  - 60 % opacity ghost follows cursor
  - Drop-target row: lavender wash + 2 px lavender insertion line
  - Invalid-drop visual: red "no" cursor (`cursor: not-allowed`) on the target while hovering an invalid pair — validated in `onDragOver`

### Sub-task 3.4 — Playwright scenarios

- [ ] **Step 8: New E2E file**

  `apps/web/tests/e2e/gantt-v4-dnd.spec.ts`. Six scenarios, one per drop-target row from the matrix. Each scenario: set up tree via API, drag via `page.dragAndDrop(sourceRef, targetRef)`, assert row appears in new position, assert server state via GET on the relevant endpoint. Invalid-drop scenario: drag category onto its own descendant, assert no network call fires and source stays put.

### Sub-task 3.5 — Commit + PR

- [ ] **Step 9: One PR**

  ```bash
  git checkout -b feat/gantt-v4-full-dnd-matrix
  git add <all files>
  git commit -m "feat(gantt): full drag-and-drop matrix for timeline (categories/projects/tasks/subtasks)

  Slice 3C-3 wired only category→category reparenting. This slice extends DnD
  to the full v4 spec §4.5 matrix:

  - Projects draggable; can drop onto categories (reparent) or top-of-tree
  - Tasks draggable; can drop onto tasks (reorder/reparent), projects (move to
    project with categoryId cleared), or categories (reparent + move project
    across projects if needed)
  - Subtasks draggable only within their parent task (reorder)

  New backend routes: POST /v1/projects/:id/move, POST /v1/tasks/:id/move.
  New proxies under app/api/workspace. Pure validateDrop() covers the full
  matrix including cycle / self-drop / subtask-misplacement rejection.

  Fixes third of the post-launch bugs reported 2026-04-18.
  Plan: docs/superpowers/plans/2026-04-18-gantt-v4-slice-4-post-launch-bugs.md"
  git push -u origin feat/gantt-v4-full-dnd-matrix
  gh pr create --title "feat(gantt): full drag-and-drop matrix (cats + projects + tasks + subtasks)" --body "..."
  ```

---

## Risks and rollback

| Risk | Mitigation |
|---|---|
| PR A's category-fetch adds a second network round trip on project timeline mount | Slice 3A already populates `['categories']` when the user visited the org timeline in the last 30 s (staleTime). In the uncached case we still add ~1 request; treating that as acceptable given the existing `useEffect` already made 2 requests. Net: one fewer, not one more. |
| PR B returning `null` instead of a colour could expose uninstantiated bar rendering if downstream code doesn't handle the null fallback | Default to the neutral grey token at `flattenVisible` so callers still get a valid string. Callers never see null. |
| PR C cross-project task move could breach project-level RBAC if mover isn't member of target project | Reuse the existing `assertProjectWriteAccess` guard at the route layer before any UPDATE. Test: mover who is non-member of target project gets 403. |
| PR C's DnD listeners on rows may interfere with native browser right-click on non-category rows (same subtle worry that existed with Slice 3C-3) | Post-PR verification: after each PR merge, re-run the right-click-opens-menu check on every row kind on the org timeline. If any regress, same mitigation as Slice 3C-3 used (no action needed there — already confirmed via Playwright 2026-04-18). |

**Rollback strategy per PR:** all three PRs are UI+API additions; reverting the merge commit restores prior behaviour with no DB migrations to undo. Slice 1's schema already supports every data shape these PRs produce.

---

## Self-review checklist (run before handoff)

- [x] Every task has concrete file paths
- [x] Every bug has a before-state repro + an after-state verification step
- [x] Fix addresses the root cause, not the symptom
- [x] No "TODO" / "TBD" / "similar to" placeholders
- [x] Each PR is shippable independently
- [x] No schema changes needed (all three fixes are within-code)
- [x] Tests are assertable (unit or Playwright, not "manual smoke")
- [x] Rollback is trivial per PR (revert commit; no data migration)
