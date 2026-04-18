# Gantt v4 — Slice 1: Schema + 409 Root-Cause + Quick Frontend Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the DB changes that unblock subcategories + project-scoped categories, diagnose and fix the 409 users are hitting today, filter null-date tasks from the Timeline at source, and knock out three trivial frontend bugs (#1 duplicate `+`, #2 Collapse-all button, crash-page on error). This slice produces a working, shippable deployment; subcategory UI, DnD, React Query, and subtask parity come in Slice 2+.

**Architecture:** Additive SQL migration (`024_portfolio_gantt_v4.sql`) on `project_categories` (adds `parent_category_id`, `project_id`, check constraint, indexes) and `projects` (adds `sort_order`). Backend `lib/categories.ts` extended to compose a category tree and accept parent fields on insert/update; new timeline SQL filter at source. Frontend polish contained to `PortfolioGanttClient.tsx` and `GanttToolbar.tsx`.

**Tech Stack:** PostgreSQL + Fastify 4 (apps/api), Next.js 16 App Router + React 18 (apps/web), Vitest for tests, Playwright MCP for visual regression (deferred to Slice 2 when UI changes are non-trivial — Slice 1's visual delta is just a removed button and a stripped "+" prefix).

**Branch:** `feat/gantt-v4-slice-1-schema` (off `master`, NOT off `fix/rbac-owner-project-create`)

---

## Task 0: Reproduce the 409 and capture exact URL + payload

**Files:** (no code changes — diagnostic only)

- [ ] **Step 1: Log into prod as the affected user and open DevTools Network tab**

Creds: `launch-test-2026@larry-pm.com` / `TestLarry123%` (from `memory/larry-launch-test-user.md`).
URL: `https://larry-pm.com/workspace/timeline`
Filter Network tab to `Fetch/XHR`, preserve log ON, disable cache.

- [ ] **Step 2: Trigger the 409 by creating a category with a colour selected**

Click "+ Category" in toolbar → enter name "Diag 409" → pick a non-default swatch → submit. Watch Network for the red 409 row.

- [ ] **Step 3: Capture and save artefacts**

For the 409 row, copy-as-cURL (bash). Also screenshot:
- Full Request URL (not truncated)
- Request Method + Payload tab
- Response headers + body

Save to `docs/reports/2026-04-18-409-repro.md`:

```markdown
# 2026-04-18 — Timeline 409 Reproduction

## Environment
- URL: https://larry-pm.com/workspace/timeline
- User: launch-test-2026@larry-pm.com
- Time: <UTC timestamp>

## Trigger
<exact click path>

## 409 Request
- Method: <METHOD>
- URL: <full URL>
- Payload:
  ```json
  <payload>
  ```

## 409 Response
- Headers: <relevant>
- Body:
  ```json
  <body>
  ```

## Surrounding context
<any other errors/warnings fired in the same flow>
```

- [ ] **Step 4: Classify the root cause against known 409 sources**

Known prod sources (from `apps/api/src/routes/v1/**` grep 2026-04-18):
- `ARCHIVED_PROJECT_WRITE_LOCK_MESSAGE` — project/task writes on archived projects
- Seat cap exceeded — invitations, auth/workspace.js
- Duplicate invite — invitations.ts
- Circular dependency / self-dependency — tasks.ts
- "Only suggested events can be accepted/dismissed/modified" — larry.ts

Grep the captured response body for these strings; note which source matches. If none match, the 409 is coming from a place not yet catalogued — document the endpoint's handler file + line.

- [ ] **Step 5: Commit the repro report**

```bash
git add docs/reports/2026-04-18-409-repro.md
git commit -m "docs: capture live repro of timeline 409 error"
```

---

## Task 1: Create the schema migration (additive, subcategory columns)

**Files:**
- Create: `packages/db/src/migrations/024_portfolio_gantt_v4.sql`
- Modify: `packages/db/src/schema.sql` (append the same statements at the bottom of the `project_categories` section so fresh DBs match migrated DBs)

- [ ] **Step 1: Write the migration file**

Create `packages/db/src/migrations/024_portfolio_gantt_v4.sql`:

```sql
-- 024_portfolio_gantt_v4.sql
-- Gantt v4 — Subcategories + project-scoped categories + project sort order.
-- Slice 1 of spec 2026-04-18-gantt-v4-subcategories-sync-design.md

-- 1. project_categories: add parent_category_id + project_id (flexible tree parent)
ALTER TABLE project_categories
  ADD COLUMN IF NOT EXISTS parent_category_id uuid NULL
    REFERENCES project_categories(id) ON DELETE CASCADE;

ALTER TABLE project_categories
  ADD COLUMN IF NOT EXISTS project_id uuid NULL
    REFERENCES projects(id) ON DELETE CASCADE;

-- 2. Exactly one of parent_category_id / project_id may be non-null at a time.
DO $$ BEGIN
  ALTER TABLE project_categories
    ADD CONSTRAINT project_categories_single_parent_chk
      CHECK (parent_category_id IS NULL OR project_id IS NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_project_categories_parent_category
  ON project_categories(tenant_id, parent_category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_categories_project
  ON project_categories(tenant_id, project_id, sort_order);

-- 3. projects: add sort_order for DnD within a category.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_category_sort
  ON projects(tenant_id, category_id, sort_order);
```

- [ ] **Step 2: Mirror the migration into `schema.sql`**

In `packages/db/src/schema.sql`, find the block starting at line 1494 (`CREATE TABLE IF NOT EXISTS project_categories (...)`). After the existing `ALTER TABLE projects ADD COLUMN IF NOT EXISTS category_id` and its index, append the same six statements from Step 1 (the ALTER TABLEs, the DO $$ constraint, the three indexes). Use `IF NOT EXISTS` so re-running schema.sql on an existing DB is a no-op.

- [ ] **Step 3: Run the migration locally**

```bash
cd apps/api
npm run db:migrate
```

Expected: "Applied 024_portfolio_gantt_v4.sql". No errors.

- [ ] **Step 4: Verify the columns exist**

```bash
psql "$DATABASE_URL" -c "\d project_categories" | grep -E "parent_category_id|project_id"
```

Expected output: two rows showing both columns as `uuid`, nullable, with FK to the right tables.

```bash
psql "$DATABASE_URL" -c "\d projects" | grep sort_order
```

Expected: `sort_order | integer | not null | default 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/024_portfolio_gantt_v4.sql packages/db/src/schema.sql
git commit -m "feat(db): add subcategory + project-scoped category columns, project sort_order

Migration 024 adds project_categories.parent_category_id and project_categories.project_id
(exactly one non-null at a time, enforced by CHECK), plus projects.sort_order for DnD reorder.
Foundation for Gantt v4 subcategories and project-scoped categories.

Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 2: Extend `lib/categories.ts` to support parent + project fields

**Files:**
- Modify: `apps/api/src/lib/categories.ts`
- Test: `apps/api/src/lib/categories.test.ts`

- [ ] **Step 1: Read the current `lib/categories.ts` shape**

Open `apps/api/src/lib/categories.ts` and note the current export signatures: `listCategoriesForTenant`, `insertCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`. The plan extends `insertCategory` and `updateCategory` to accept `parentCategoryId` and `projectId`, and `listCategoriesForTenant` to return the new columns.

- [ ] **Step 2: Write the failing test for parent-aware insert**

Append to `apps/api/src/lib/categories.test.ts`:

```ts
it("accepts parentCategoryId on insert and returns it", async () => {
  const tenantId = await setupTenant();
  const parent = await insertCategory(db, tenantId, { name: "Parent", colour: "#6c44f6", sortOrder: 0 });
  const child = await insertCategory(db, tenantId, {
    name: "Child",
    colour: null,
    sortOrder: 0,
    parentCategoryId: parent.id,
    projectId: null,
  });
  expect(child.parentCategoryId).toBe(parent.id);
  expect(child.projectId).toBeNull();
});

it("accepts projectId on insert (project-scoped category)", async () => {
  const tenantId = await setupTenant();
  const projectId = await insertProject(db, tenantId, "Test Project");
  const cat = await insertCategory(db, tenantId, {
    name: "Design",
    colour: null,
    sortOrder: 0,
    parentCategoryId: null,
    projectId,
  });
  expect(cat.projectId).toBe(projectId);
  expect(cat.parentCategoryId).toBeNull();
});

it("rejects insert with both parentCategoryId and projectId set", async () => {
  const tenantId = await setupTenant();
  const parent = await insertCategory(db, tenantId, { name: "P", colour: null, sortOrder: 0 });
  const projectId = await insertProject(db, tenantId, "P");
  await expect(
    insertCategory(db, tenantId, {
      name: "Bad",
      colour: null,
      sortOrder: 0,
      parentCategoryId: parent.id,
      projectId,
    }),
  ).rejects.toThrow(/project_categories_single_parent_chk/);
});
```

Note: if `insertProject` is not already exported from a test helper, add it to `apps/api/src/lib/test-helpers.ts` as:

```ts
export async function insertProject(db: DbClient, tenantId: string, name: string): Promise<string> {
  const rows = await db.queryTenant<{ id: string }>(tenantId,
    `INSERT INTO projects (tenant_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
    [tenantId, name]);
  return rows[0].id;
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/api
npm test -- categories.test.ts
```

Expected: three new tests FAIL with "Unknown property `parentCategoryId`" or similar type/runtime error.

- [ ] **Step 4: Extend the `Category` type and `insertCategory`**

In `apps/api/src/lib/categories.ts`, extend the `Category` type:

```ts
export type Category = {
  id: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  parentCategoryId: string | null;  // NEW
  projectId: string | null;          // NEW
  createdAt: string;
  updatedAt: string;
};
```

Extend `insertCategory` params + SQL:

```ts
export async function insertCategory(
  db: DbClient,
  tenantId: string,
  input: {
    name: string;
    colour: string | null;
    sortOrder: number;
    parentCategoryId?: string | null;  // NEW
    projectId?: string | null;          // NEW
  },
): Promise<Category> {
  const rows = await db.queryTenant<Category>(
    tenantId,
    `INSERT INTO project_categories
       (tenant_id, name, colour, sort_order, parent_category_id, project_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id, name, colour, sort_order AS "sortOrder",
       parent_category_id AS "parentCategoryId",
       project_id AS "projectId",
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      tenantId,
      input.name,
      input.colour,
      input.sortOrder,
      input.parentCategoryId ?? null,
      input.projectId ?? null,
    ],
  );
  return rows[0];
}
```

Extend `updateCategory` similarly — add `parentCategoryId?: string | null` and `projectId?: string | null` to the partial update type and to the SET clause (use `COALESCE($N::uuid, parent_category_id)` pattern only if you want undefined-means-keep; we want explicit null to clear, so use a build-SET-clause helper that only includes fields present in the input).

Extend `listCategoriesForTenant` SQL SELECT to return the two new columns.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- categories.test.ts
```

Expected: all three new tests PASS. All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/categories.ts apps/api/src/lib/categories.test.ts apps/api/src/lib/test-helpers.ts
git commit -m "feat(api): extend categories lib with parent + project scope

insertCategory and updateCategory now accept optional parentCategoryId and projectId.
DB check constraint enforces that exactly one may be non-null. List queries return
both columns on every Category row.

Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 3: Extend `POST /v1/categories` + `PATCH /:id` schemas

**Files:**
- Modify: `apps/api/src/routes/v1/categories.ts`
- Test: `apps/api/src/routes/v1/categories.test.ts` (create if not present)

- [ ] **Step 1: Write the failing route test**

Create `apps/api/src/routes/v1/categories.test.ts` if it doesn't exist. Append:

```ts
it("POST /v1/categories accepts parentCategoryId", async () => {
  const { fastify, tenantId, userId } = await buildApp();
  const parent = await insertCategory(fastify.db, tenantId, { name: "Parent", colour: null, sortOrder: 0 });
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/categories",
    headers: authHeaders(userId, tenantId),
    payload: { name: "Child", colour: null, parentCategoryId: parent.id },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  expect(body.category.parentCategoryId).toBe(parent.id);
  expect(body.category.projectId).toBeNull();
});

it("POST /v1/categories accepts projectId", async () => {
  const { fastify, tenantId, userId } = await buildApp();
  const projectId = await insertProject(fastify.db, tenantId, "P1");
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/categories",
    headers: authHeaders(userId, tenantId),
    payload: { name: "Design", colour: "#6c44f6", projectId },
  });
  expect(res.statusCode).toBe(201);
  expect(res.json().category.projectId).toBe(projectId);
});

it("POST /v1/categories rejects both parentCategoryId and projectId set", async () => {
  const { fastify, tenantId, userId } = await buildApp();
  const parent = await insertCategory(fastify.db, tenantId, { name: "P", colour: null, sortOrder: 0 });
  const projectId = await insertProject(fastify.db, tenantId, "Pr");
  const res = await fastify.inject({
    method: "POST",
    url: "/v1/categories",
    headers: authHeaders(userId, tenantId),
    payload: { name: "Bad", parentCategoryId: parent.id, projectId },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error).toMatch(/exactly one/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- categories.test.ts
```

Expected: new tests FAIL with "400" (payload validation rejects unknown field) or similar.

- [ ] **Step 3: Extend the Zod schemas and handler**

In `apps/api/src/routes/v1/categories.ts`:

```ts
const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  colour: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  parentCategoryId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
}).refine(
  (v) => !(v.parentCategoryId && v.projectId),
  { message: "A category may have parentCategoryId or projectId set, but not both (exactly one or neither)." },
);

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  colour: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  parentCategoryId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
}).refine(
  (v) => !(v.parentCategoryId && v.projectId),
  { message: "A category may have parentCategoryId or projectId set, but not both (exactly one or neither)." },
);
```

Update the POST handler to pass `parentCategoryId` and `projectId` into `insertCategory`. Update PATCH similarly. No other logic changes.

- [ ] **Step 4: Run tests**

```bash
npm test -- categories.test.ts
```

Expected: all new and existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/categories.ts apps/api/src/routes/v1/categories.test.ts
git commit -m "feat(api): categories route accepts parentCategoryId + projectId

POST /v1/categories and PATCH /v1/categories/:id accept the two new parent fields.
Zod refine enforces that at most one is set; DB CHECK constraint guarantees it.

Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 4: Timeline SQL filters null-date tasks

**Files:**
- Modify: `apps/api/src/routes/v1/timeline.ts` (org-wide) and wherever project timeline tasks are queried (likely `apps/api/src/routes/v1/projects.ts` — the `/projects/:id/timeline` endpoint)
- Test: same file's test, or `timeline.test.ts` if present

- [ ] **Step 1: Find both timeline queries**

```bash
grep -n "FROM tasks\|start_date\|due_date" apps/api/src/routes/v1/timeline.ts apps/api/src/routes/v1/projects.ts | grep -i "tasks"
```

Identify the exact SELECT statements that fetch task rows for the two timeline endpoints.

- [ ] **Step 2: Write failing test — org timeline excludes null-date tasks**

Append to `apps/api/src/routes/v1/timeline.test.ts`:

```ts
it("GET /v1/timeline excludes tasks with null start_date or due_date", async () => {
  const { fastify, tenantId, userId } = await buildApp();
  const projectId = await insertProject(fastify.db, tenantId, "P1");
  const taskWithDates = await insertTask(fastify.db, tenantId, {
    projectId,
    title: "Dated",
    startDate: "2026-04-01",
    dueDate: "2026-04-10",
  });
  const taskNoStart = await insertTask(fastify.db, tenantId, {
    projectId,
    title: "No start",
    startDate: null,
    dueDate: "2026-04-10",
  });
  const taskNoEnd = await insertTask(fastify.db, tenantId, {
    projectId,
    title: "No end",
    startDate: "2026-04-01",
    dueDate: null,
  });
  const res = await fastify.inject({
    method: "GET",
    url: "/v1/timeline",
    headers: authHeaders(userId, tenantId),
  });
  expect(res.statusCode).toBe(200);
  const taskIds = res.json().categories.flatMap((c: any) =>
    c.projects.flatMap((p: any) => p.tasks.map((t: any) => t.id)),
  );
  expect(taskIds).toContain(taskWithDates);
  expect(taskIds).not.toContain(taskNoStart);
  expect(taskIds).not.toContain(taskNoEnd);
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- timeline.test.ts
```

Expected: FAIL — currently returns all three tasks.

- [ ] **Step 4: Add the WHERE clause to both timeline queries**

In `apps/api/src/routes/v1/timeline.ts` (and the project-timeline sibling), find the tasks SELECT and append to its WHERE clause:

```sql
AND t.start_date IS NOT NULL
AND t.due_date IS NOT NULL
```

(Alias may be `tasks` not `t` — match the existing query.)

- [ ] **Step 5: Run test**

```bash
npm test -- timeline.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/timeline.ts apps/api/src/routes/v1/projects.ts apps/api/src/routes/v1/timeline.test.ts
git commit -m "feat(api): exclude null-date tasks from timeline queries

Tasks without both start_date and due_date are filtered at the SQL layer for the
org-wide /v1/timeline and the project-scoped /v1/projects/:id/timeline endpoints.
They remain fully visible in Task Center and /v1/tasks queries.

Fixes part of bug #7 from larry-timeline-bugs.md.
Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 5: Fix the 409 root cause (targeted fix based on Task 0 findings)

**Files:** depends on Task 0 finding.

- [ ] **Step 1: Open `docs/reports/2026-04-18-409-repro.md` (from Task 0) and identify the handler file**

From the classification step, you know which source line in which file raised the 409. Navigate to it.

- [ ] **Step 2: Decide the fix class**

Three likely patterns:

- **Pattern A — archived-project-write-lock firing on a non-write** (read-side endpoint incorrectly treated as write): relax the lock predicate in that handler so read-only requests pass. Write test that a GET/POST-as-read on an archived project returns 200.
- **Pattern B — stale client cache causing a spurious request** (e.g., refetching with a stale project id that was archived): the client-side `fetchTimeline` retries with a bad id. Fix at the client by skipping archived projects in the refetch set.
- **Pattern C — something else entirely** (seat cap, duplicate invite, circular-dependency check): apply the narrow fix at the source.

Write the failing test FIRST that reproduces the 409 at the unit or integration level.

- [ ] **Step 3: Implement the fix**

Code goes here once Task 0's output is known. This step intentionally does not prescribe code — the fix is root-cause-specific.

- [ ] **Step 4: Verify the test passes AND manually re-run the original repro from Task 0**

The same click-path from Task 0 Step 2 must no longer produce a 409 on prod-parity local environment.

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "fix(api|web): resolve 409 on timeline category create

Root cause: <one-line summary from repro report>.
<3-line explanation of fix>.

Fixes bug #6 from larry-timeline-bugs.md.
Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 6: Replace the crash-page error with an inline toast

**Files:**
- Modify: `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx` (line 50)

- [ ] **Step 1: Import a toast utility or use existing one**

```bash
grep -rn "toast\." apps/web/src/app/workspace --include="*.tsx" | head -5
```

Confirm the project uses `sonner`, `react-hot-toast`, or a home-grown toast hook. Use whatever exists; do NOT add a new library in this slice.

- [ ] **Step 2: Modify the error render branch**

In `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`, replace lines 19-51 so that errors are surfaced as a toast + the page stays mounted with the last good `data`:

```tsx
const [data, setData] = useState<PortfolioTimelineResponse | null>(null);
const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
const [managerOpen, setManagerOpen] = useState(false);
const [selectedKey, setSelectedKey] = useState<string | null>(null);

const fetchTimeline = useCallback(async () => {
  try {
    const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setData(await res.json());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    toast.error(`Couldn't refresh timeline: ${msg}`);
    // Keep the previous `data` mounted so the user's view is not wiped.
  }
}, []);

useEffect(() => { void fetchTimeline(); }, [fetchTimeline]);

// Remove the `if (error) return <div>…</div>` branch entirely.
if (!data) return <div style={{ padding: 24 }}>Loading…</div>;
```

Delete the `error` state variable and any references.

Also update the `setError(...)` calls inside the context-menu handlers (lines ~137, 153, 169, 188, 202, 214) to `toast.error(...)` so failures in those actions surface the same way.

- [ ] **Step 3: Manual smoke test**

```bash
cd apps/web
npm run dev
```

Visit `/workspace/timeline`. Trigger an error by temporarily stopping the Railway API or returning a 500 from the timeline route. Confirm a toast appears and the Gantt stays mounted, rather than a white error page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx
git commit -m "fix(web): don't blank the timeline on fetch error — show toast instead

Before: any HTTP error replaced the entire Gantt with 'Couldn't load timeline: HTTP 409'.
After: errors surface as a toast; the last good timeline stays visible so transient
failures don't kill the session.

Fixes part of bug #6 from larry-timeline-bugs.md.
Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 7: Fix duplicate "+" on the Add button

**Files:**
- Modify: `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx` (`selectionContextAddLabel()` function, lines 68-95)

The `GanttToolbar` at line 74 renders `<Plus icon>` followed by `{addLabel}`. The `addLabel` currently returned from `selectionContextAddLabel()` starts with `"+ "` (e.g. `"+ Task"`), producing the visible duplicate. Fix: strip the `"+ "` prefix from every return in that function.

- [ ] **Step 1: Modify `selectionContextAddLabel()`**

In `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`:

```ts
function selectionContextAddLabel(): string {
  if (!selectedKey) return "Category";
  if (selectedKey.startsWith("cat:")) {
    const id = selectedKey.slice(4);
    const cat = data?.categories.find((c) => c.id === (id === "uncat" ? null : id));
    const name = cat?.name ?? "";
    return `Project${name ? " in " + name : ""}`;
  }
  if (selectedKey.startsWith("proj:")) {
    const id = selectedKey.slice(5);
    let pname = "";
    for (const cat of data!.categories) {
      const p = cat.projects.find((pp) => pp.id === id);
      if (p) { pname = p.name; break; }
    }
    return `Task${pname ? " in " + pname : ""}`;
  }
  if (selectedKey.startsWith("task:")) {
    const taskId = selectedKey.slice(5);
    let tname = "";
    for (const cat of data!.categories) for (const p of cat.projects) {
      const t = p.tasks.find((tt) => tt.id === taskId);
      if (t) { tname = t.title; break; }
    }
    return `Subtask${tname ? " in " + tname : ""}`;
  }
  return "Category";
}
```

Every return value lost its `"+ "` prefix. The icon `<Plus size={14} />` in `GanttToolbar.tsx:74` now provides the sole "+".

- [ ] **Step 2: Manual visual check**

Dev server running. Click the toolbar's add button with no row selected. Label should read `[+] Category` (one plus icon, one word). Click a category row — label should read `[+] Project in Marketing` (for example).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx
git commit -m "fix(web): remove duplicate + in timeline Add button label

The Plus icon in GanttToolbar and the leading '+ ' in the label string were
stacking visually as '[+] + Task'. Dropped the prefix from every return value
in selectionContextAddLabel() so the icon provides the sole '+'.

Fixes bug #1 from larry-timeline-bugs.md.
Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 8: Delete the Collapse-all button

Per spec D7 — the button is not needed; individual row chevrons are sufficient.

**Files:**
- Modify: `apps/web/src/components/workspace/gantt/GanttToolbar.tsx` (remove button + props)
- Modify: `apps/web/src/components/workspace/gantt/GanttContainer.tsx` (remove handler + state, or inline them to `false`)

- [ ] **Step 1: Remove the button from `GanttToolbar.tsx`**

Delete lines 44-47 (the button JSX) and from the Props interface remove `allCollapsed`, `onToggleCollapseAll`. Remove them from the destructuring in the function signature and from the `import { ChevronsDownUp, ChevronsUpDown }` (if those icons are not used elsewhere in the file).

- [ ] **Step 2: Update `GanttContainer.tsx`**

Find where `<GanttToolbar ... allCollapsed={...} onToggleCollapseAll={...} />` is rendered. Remove both props from the JSX. Also delete the `allCollapsed` state / derivation and the `handleToggleCollapseAll` function if they're only used for this button — otherwise leave them alone.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/web
npm run typecheck
```

Expected: zero errors. If any file was passing `onToggleCollapseAll`, the typecheck will surface it — delete that call site too.

- [ ] **Step 4: Manual check**

Dev server. Toolbar no longer shows the "Collapse all" button. Individual chevrons on category/project rows still collapse/expand.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttToolbar.tsx apps/web/src/components/workspace/gantt/GanttContainer.tsx
git commit -m "chore(web): remove non-functional 'Collapse all' button from timeline

Per spec D7 the button was not worth fixing — individual row chevrons are
sufficient. Dropped the button, its props, and related state.

Fixes bug #2 from larry-timeline-bugs.md.
Part of: 2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md"
```

---

## Task 9: Open PR for Slice 1

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/gantt-v4-slice-1-schema
```

- [ ] **Step 2: Open PR via `gh`**

```bash
gh pr create --title "Gantt v4 Slice 1: schema + 409 fix + quick polish" --body "$(cat <<'EOF'
## Summary
- Additive DB migration 024: `project_categories.parent_category_id`, `project_categories.project_id` (with CHECK constraint), `projects.sort_order`, plus supporting indexes. Foundation for subcategories + project-scoped categories.
- Backend `lib/categories.ts` + `/v1/categories` route accept the new parent fields; Zod + DB check enforce single-parent.
- Timeline SQL (`/v1/timeline` and `/v1/projects/:id/timeline`) excludes tasks with null start_date or due_date (bug #7 source fix).
- Live-reproduced and fixed the 409 on timeline category create (bug #6).
- Toast-on-error replaces the crash page in PortfolioGanttClient (bug #6 secondary).
- Duplicate `+` icon on the toolbar Add button fixed (bug #1).
- Non-functional Collapse-all button removed (bug #2).

Everything else in the spec (React Query, DnD, subcategory UI, subtasks in Task Center, required-dates modal) is deferred to Slice 2+.

## Test plan
- [ ] `npm test` green in apps/api (categories + timeline tests)
- [ ] `npm run typecheck` green in apps/web
- [ ] Manual: Visit /workspace/timeline — category add works, no duplicate "+", no Collapse-all button, toast on API error
- [ ] Manual: Trigger original 409 repro path — no longer 409s
- [ ] Vercel preview deployment green
- [ ] Railway API deploy green (migration 024 applies cleanly)

Spec: `docs/superpowers/specs/2026-04-18-gantt-v4-subcategories-sync-design.md`
Plan: `docs/superpowers/plans/2026-04-18-gantt-v4-slice-1-schema-and-quick-fixes.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI and Vercel preview**

Poll `gh pr checks` every ~60s until all checks pass. Then open the Vercel preview URL, click through the Timeline once, confirm no regressions.

- [ ] **Step 4: Merge**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Watch prod deploys**

Monitor Vercel (web) and Railway (api) deploys. If migration 024 fails on Railway, roll back via the migration's reverse (drop the new columns + constraint + indexes — additive-only so rollback is trivial). If web deploy fails, inspect build logs.

---

## Self-review checklist (run before handoff)

- [x] Every task has concrete file paths and actual code
- [x] Every test has assertable expectations
- [x] Every commit message names the bug(s) fixed and links back to the plan file
- [x] No "TODO" / "TBD" / "similar to" placeholders
- [x] Root cause for the 409 is discovered-then-fixed, not assumed
- [x] Slice is shippable independently of Slice 2+
- [x] All migrations are additive (rollback is trivial column drops)
- [x] Frontend changes are minimal and don't depend on Slice 2's React Query
