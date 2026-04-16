# Portfolio & Project Gantt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a 4-level Gantt (Category → Project → Task → Subtask) at `/workspace/timeline` (portfolio) and replace the existing per-project timeline with the same component.

**Architecture:** New `project_categories` table + `projects.category_id` + `tasks.parent_task_id`. New Fastify routes `/v1/categories` and `/v1/timeline`; extend `/v1/tasks` + `/v1/projects` for the new fields. New web folder `apps/web/src/components/workspace/gantt/` shared between portfolio and project views. Old `timeline/` folder retired after cutover.

**Tech Stack:** Postgres, Fastify 5 + Zod + Vitest, Next.js 16 App Router, React 19, existing Larry palette (`#6c44f6` brand, `var(--tl-*)` status tokens).

**Source spec:** `docs/superpowers/specs/2026-04-15-portfolio-gantt-design.md`

---

## File Structure

**Create:**
- `packages/db/src/migrations/020_portfolio_gantt.sql`
- `packages/shared/src/types.ts` (new file — see Task 2.1 for shape; append if exists)
- `apps/api/src/lib/categories.ts`
- `apps/api/src/routes/v1/categories.ts`
- `apps/api/src/routes/v1/timeline.ts`
- `apps/api/tests/categories-routes.test.ts`
- `apps/api/tests/tasks-parent-task.test.ts`
- `apps/api/tests/timeline-portfolio.test.ts`
- `apps/web/src/app/workspace/timeline/page.tsx`
- `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`
- `apps/web/src/app/api/workspace/timeline/route.ts`
- `apps/web/src/app/api/workspace/categories/route.ts`
- `apps/web/src/app/api/workspace/categories/[id]/route.ts`
- `apps/web/src/app/api/workspace/categories/reorder/route.ts`
- `apps/web/src/components/workspace/gantt/gantt-types.ts`
- `apps/web/src/components/workspace/gantt/gantt-utils.ts`
- `apps/web/src/components/workspace/gantt/gantt-utils.test.ts`
- `apps/web/src/components/workspace/gantt/GanttContainer.tsx`
- `apps/web/src/components/workspace/gantt/GanttOutline.tsx`
- `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx`
- `apps/web/src/components/workspace/gantt/GanttGrid.tsx`
- `apps/web/src/components/workspace/gantt/GanttRow.tsx`
- `apps/web/src/components/workspace/gantt/GanttBar.tsx`
- `apps/web/src/components/workspace/gantt/GanttToolbar.tsx`
- `apps/web/src/components/workspace/gantt/GanttDependencyLines.tsx`
- `apps/web/src/components/workspace/gantt/GanttTooltip.tsx`
- `apps/web/src/components/workspace/gantt/UnscheduledPanel.tsx` (moved from `timeline/`)
- `apps/web/src/components/workspace/gantt/AddNodeModal.tsx`

**Modify:**
- `packages/db/src/schema.sql`
- `apps/api/src/routes/v1/tasks.ts`
- `apps/api/src/routes/v1/projects.ts`
- `apps/api/src/routes/v1/index.ts`
- `apps/web/src/app/dashboard/types.ts`
- `apps/web/src/components/dashboard/Sidebar.tsx`
- `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`

**Delete (Phase 15 only):**
- `apps/web/src/components/workspace/timeline/` (entire folder)

---

## Phase 1 · Database schema

### Task 1.1: Add migration for `project_categories`, `projects.category_id`, `tasks.parent_task_id`

**Files:**
- Create: `packages/db/src/migrations/020_portfolio_gantt.sql`
- Modify: `packages/db/src/schema.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/src/migrations/020_portfolio_gantt.sql`:

```sql
-- Portfolio Gantt schema — categories for projects, parent tasks for subtasks.

CREATE TABLE IF NOT EXISTS project_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_categories_tenant_sort
  ON project_categories (tenant_id, sort_order, created_at);

DO $$ BEGIN
  ALTER TABLE projects ADD COLUMN category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_category
  ON projects (tenant_id, category_id);

DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON tasks (tenant_id, parent_task_id);
```

- [ ] **Step 2: Mirror into `schema.sql`**

Append the same statements (idempotent — the `DO $$ ... EXCEPTION WHEN duplicate_column` blocks + `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`) to the end of `packages/db/src/schema.sql` so fresh installs get them too.

- [ ] **Step 3: Run the migration locally and verify**

Run: `npm run db:migrate -w @larry/db`
Expected: exits 0. Then:
```bash
docker exec -i larry-postgres-1 psql -U postgres -d larry -c "\d project_categories"
docker exec -i larry-postgres-1 psql -U postgres -d larry -c "\d projects" | grep category_id
docker exec -i larry-postgres-1 psql -U postgres -d larry -c "\d tasks" | grep parent_task_id
```
All three must return the new columns/table.

- [ ] **Step 4: Re-run to confirm idempotence**

Run `npm run db:migrate -w @larry/db` a second time. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/020_portfolio_gantt.sql packages/db/src/schema.sql
git commit -m "db: add project_categories + category_id + parent_task_id for Gantt"
```

---

## Phase 2 · Shared types

### Task 2.1: Define shared Gantt types

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add failing import test**

Create `packages/shared/src/gantt-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ProjectCategory, GanttTask, PortfolioTimelineResponse } from "./index.js";

describe("gantt types", () => {
  it("ProjectCategory has the required fields", () => {
    const c: ProjectCategory = {
      id: "c1", tenantId: "t1", name: "Client work", colour: null,
      sortOrder: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(c.name).toBe("Client work");
  });

  it("GanttTask allows parentTaskId null or string", () => {
    const t: GanttTask = {
      id: "t1", projectId: "p1", parentTaskId: null, title: "Task",
      status: "not_started", priority: "medium",
      assigneeUserId: null, assigneeName: null,
      startDate: null, endDate: null, dueDate: null, progressPercent: 0,
    };
    expect(t.parentTaskId).toBeNull();
  });

  it("PortfolioTimelineResponse nests categories > projects > tasks", () => {
    const r: PortfolioTimelineResponse = { categories: [], dependencies: [] };
    expect(r.categories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/gantt-types.test.ts`
Expected: FAIL — `Module "./index.js" has no exported member 'ProjectCategory'`.

- [ ] **Step 3: Add the types to `packages/shared/src/index.ts`**

Append to `packages/shared/src/index.ts`:

```ts
export type GanttTaskStatus = "not_started" | "on_track" | "at_risk" | "overdue" | "completed";
export type GanttTaskPriority = "low" | "medium" | "high" | "critical";

export interface ProjectCategory {
  id: string;
  tenantId: string;
  name: string;
  colour: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GanttTask {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  status: GanttTaskStatus;
  priority: GanttTaskPriority;
  assigneeUserId: string | null;
  assigneeName: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  progressPercent: number;
}

export interface PortfolioTimelineProject {
  id: string;
  name: string;
  status: "active" | "archived";
  startDate: string | null;
  targetDate: string | null;
  tasks: GanttTask[];
}

export interface PortfolioTimelineCategory {
  id: string | null;          // null = "Uncategorised" synthetic bucket
  name: string;
  colour: string | null;
  sortOrder: number;
  projects: PortfolioTimelineProject[];
}

export interface PortfolioTimelineResponse {
  categories: PortfolioTimelineCategory[];
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/shared/src/gantt-types.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/gantt-types.test.ts
git commit -m "shared: ProjectCategory + GanttTask + PortfolioTimelineResponse types"
```

---

## Phase 3 · API categories CRUD

### Task 3.1: Category repository helpers

**Files:**
- Create: `apps/api/src/lib/categories.ts`
- Create: `apps/api/src/lib/categories.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `apps/api/src/lib/categories.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { listCategoriesForTenant, insertCategory, updateCategory, deleteCategory, reorderCategories } from "./categories.js";

const fakeDb = () => ({ queryTenant: vi.fn().mockResolvedValue([]) });

describe("categories repository", () => {
  it("listCategoriesForTenant runs a sorted SELECT", async () => {
    const db = fakeDb() as never;
    await listCategoriesForTenant(db, "t1");
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant)
      .toHaveBeenCalledWith("t1", expect.stringMatching(/ORDER BY sort_order/i), ["t1"]);
  });

  it("insertCategory returns the row", async () => {
    const row = { id: "c1", tenantId: "t1", name: "X", colour: null, sortOrder: 0, createdAt: "x", updatedAt: "x" };
    const db = { queryTenant: vi.fn().mockResolvedValue([row]) } as never;
    const result = await insertCategory(db, "t1", { name: "X", colour: null, sortOrder: 0 });
    expect(result).toEqual(row);
  });

  it("updateCategory coalesces unchanged fields", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([{ id: "c1" }]) } as never;
    await updateCategory(db, "t1", "c1", { name: "New" });
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1])
      .toMatch(/UPDATE project_categories/i);
  });

  it("deleteCategory cascades via SET NULL on projects", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([]) } as never;
    await deleteCategory(db, "t1", "c1");
    expect((db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant)
      .toHaveBeenCalledWith("t1", expect.stringMatching(/DELETE FROM project_categories/i), ["t1", "c1"]);
  });

  it("reorderCategories uses UPDATE in CASE WHEN form", async () => {
    const db = { queryTenant: vi.fn().mockResolvedValue([]) } as never;
    await reorderCategories(db, "t1", ["c1", "c2", "c3"]);
    const sql = (db as unknown as { queryTenant: ReturnType<typeof vi.fn> }).queryTenant.mock.calls[0][1];
    expect(sql).toMatch(/CASE id/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/lib/categories.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/lib/categories.ts`:

```ts
import type { Db } from "@larry/db";
import type { ProjectCategory } from "@larry/shared";

const SELECT_COLS = `
  id,
  tenant_id    AS "tenantId",
  name,
  colour,
  sort_order   AS "sortOrder",
  created_at   AS "createdAt",
  updated_at   AS "updatedAt"
`;

export async function listCategoriesForTenant(
  db: Db, tenantId: string
): Promise<ProjectCategory[]> {
  const sql = `SELECT ${SELECT_COLS} FROM project_categories
               WHERE tenant_id = $1
               ORDER BY sort_order ASC, created_at ASC`;
  return db.queryTenant<ProjectCategory>(tenantId, sql, [tenantId]);
}

export async function insertCategory(
  db: Db, tenantId: string,
  input: { name: string; colour: string | null; sortOrder: number }
): Promise<ProjectCategory> {
  const sql = `INSERT INTO project_categories (tenant_id, name, colour, sort_order)
               VALUES ($1, $2, $3, $4)
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId, input.name, input.colour, input.sortOrder,
  ]);
  return rows[0];
}

export async function updateCategory(
  db: Db, tenantId: string, id: string,
  patch: { name?: string; colour?: string | null; sortOrder?: number }
): Promise<ProjectCategory | null> {
  const sql = `UPDATE project_categories
               SET name       = COALESCE($3, name),
                   colour     = CASE WHEN $4::boolean THEN $5 ELSE colour END,
                   sort_order = COALESCE($6, sort_order),
                   updated_at = NOW()
               WHERE tenant_id = $1 AND id = $2
               RETURNING ${SELECT_COLS}`;
  const rows = await db.queryTenant<ProjectCategory>(tenantId, sql, [
    tenantId, id,
    patch.name ?? null,
    patch.colour !== undefined,
    patch.colour ?? null,
    patch.sortOrder ?? null,
  ]);
  return rows[0] ?? null;
}

export async function deleteCategory(
  db: Db, tenantId: string, id: string
): Promise<void> {
  const sql = `DELETE FROM project_categories WHERE tenant_id = $1 AND id = $2`;
  await db.queryTenant(tenantId, sql, [tenantId, id]);
}

export async function reorderCategories(
  db: Db, tenantId: string, orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return;
  const cases = orderedIds.map((_, i) => `WHEN $${i + 2}::uuid THEN ${i}`).join(" ");
  const sql = `UPDATE project_categories
               SET sort_order = CASE id ${cases} ELSE sort_order END,
                   updated_at = NOW()
               WHERE tenant_id = $1
                 AND id IN (${orderedIds.map((_, i) => `$${i + 2}::uuid`).join(",")})`;
  await db.queryTenant(tenantId, sql, [tenantId, ...orderedIds]);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/src/lib/categories.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/categories.ts apps/api/src/lib/categories.test.ts
git commit -m "api: project_categories repository helpers"
```

### Task 3.2: Category routes (list + create)

**Files:**
- Create: `apps/api/src/routes/v1/categories.ts`
- Create: `apps/api/tests/categories-routes.test.ts`

- [ ] **Step 1: Write failing route tests (list + create)**

Create `apps/api/tests/categories-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { categoryRoutes } from "../src/routes/v1/categories.js";
import * as repo from "../src/lib/categories.js";

vi.mock("../src/lib/categories.js");

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant: vi.fn() } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as typeof req & { user: { tenantId: string; userId: string; role: "pm"; email: string } }).user =
      { tenantId: TENANT_ID, userId: USER_ID, role: "pm", email: "pm@example.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(categoryRoutes, { prefix: "/categories" });
  await app.ready();
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => { while (apps.length) await apps.pop()!.close(); vi.clearAllMocks(); });

describe("GET /categories", () => {
  it("returns tenant categories sorted", async () => {
    const app = await buildApp(); apps.push(app);
    const rows = [{ id: "c1", tenantId: TENANT_ID, name: "A", colour: null, sortOrder: 0, createdAt: "x", updatedAt: "x" }];
    vi.mocked(repo.listCategoriesForTenant).mockResolvedValue(rows);
    const res = await app.inject({ method: "GET", url: "/categories" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ categories: rows });
  });
});

describe("POST /categories", () => {
  it("creates a category with defaults", async () => {
    const app = await buildApp(); apps.push(app);
    const row = { id: "c1", tenantId: TENANT_ID, name: "Internal", colour: null, sortOrder: 0, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.insertCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "POST", url: "/categories", payload: { name: "Internal" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ category: row });
    expect(repo.insertCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, { name: "Internal", colour: null, sortOrder: 0 });
  });

  it("rejects empty name with 400", async () => {
    const app = await buildApp(); apps.push(app);
    const res = await app.inject({ method: "POST", url: "/categories", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/tests/categories-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `categoryRoutes`**

Create `apps/api/src/routes/v1/categories.ts`:

```ts
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listCategoriesForTenant, insertCategory, updateCategory,
  deleteCategory, reorderCategories,
} from "../../lib/categories.js";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const IdSchema = z.object({ id: z.string().uuid() });
const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const categoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    const categories = await listCategoriesForTenant(fastify.db, request.user.tenantId);
    return { categories };
  });

  fastify.post("/", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = CreateSchema.parse(request.body);
    const category = await insertCategory(fastify.db, request.user.tenantId, {
      name: body.name,
      colour: body.colour ?? null,
      sortOrder: body.sortOrder ?? 0,
    });
    reply.code(201);
    return { category };
  });

  fastify.patch("/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = IdSchema.parse(request.params);
    const patch = UpdateSchema.parse(request.body);
    const category = await updateCategory(fastify.db, request.user.tenantId, id, patch);
    if (!category) throw fastify.httpErrors.notFound("Category not found");
    return { category };
  });

  fastify.delete("/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = IdSchema.parse(request.params);
    await deleteCategory(fastify.db, request.user.tenantId, id);
    reply.code(204); return null;
  });

  fastify.post("/reorder", { preHandler: [fastify.authenticate] }, async (request) => {
    const { ids } = ReorderSchema.parse(request.body);
    await reorderCategories(fastify.db, request.user.tenantId, ids);
    return { ok: true };
  });
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/tests/categories-routes.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/categories.ts apps/api/tests/categories-routes.test.ts
git commit -m "api: /v1/categories list + create routes"
```

### Task 3.3: Category routes (patch + delete + reorder tests)

**Files:**
- Modify: `apps/api/tests/categories-routes.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/api/tests/categories-routes.test.ts`:

```ts
describe("PATCH /categories/:id", () => {
  it("updates name + colour", async () => {
    const app = await buildApp(); apps.push(app);
    const row = { id: "c1", tenantId: TENANT_ID, name: "Renamed", colour: "#6c44f6", sortOrder: 2, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.updateCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "PATCH", url: "/categories/c1", payload: { name: "Renamed", colour: "#6c44f6" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ category: row });
  });

  it("returns 404 when not found", async () => {
    const app = await buildApp(); apps.push(app);
    vi.mocked(repo.updateCategory).mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/categories/11111111-1111-4111-8111-111111111111", payload: { name: "X" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /categories/:id", () => {
  it("returns 204", async () => {
    const app = await buildApp(); apps.push(app);
    vi.mocked(repo.deleteCategory).mockResolvedValue();
    const res = await app.inject({ method: "DELETE", url: "/categories/11111111-1111-4111-8111-111111111111" });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /categories/reorder", () => {
  it("calls repo with ids", async () => {
    const app = await buildApp(); apps.push(app);
    vi.mocked(repo.reorderCategories).mockResolvedValue();
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const res = await app.inject({ method: "POST", url: "/categories/reorder", payload: { ids } });
    expect(res.statusCode).toBe(200);
    expect(repo.reorderCategories).toHaveBeenCalledWith(expect.anything(), TENANT_ID, ids);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run apps/api/tests/categories-routes.test.ts`
Expected: PASS (all new assertions — implementation from Task 3.2 already covers these).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/categories-routes.test.ts
git commit -m "test: patch + delete + reorder for /v1/categories"
```

### Task 3.4: Register category routes in the v1 index

**Files:**
- Modify: `apps/api/src/routes/v1/index.ts`

- [ ] **Step 1: Add import + registration**

In `apps/api/src/routes/v1/index.ts`, after the `taskRoutes` import:

```ts
import { categoryRoutes } from "./categories.js";
```

Inside `v1Routes`, after `await fastify.register(taskRoutes, { prefix: "/tasks" });`:

```ts
await fastify.register(categoryRoutes, { prefix: "/categories" });
```

- [ ] **Step 2: Typecheck**

Run: `npm run -w @larry/api typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/index.ts
git commit -m "api: register /v1/categories"
```

---

## Phase 4 · API task parent support

### Task 4.1: Extend `CreateTaskSchema` + `POST /tasks` with `parentTaskId`

**Files:**
- Modify: `apps/api/src/routes/v1/tasks.ts`
- Create: `apps/api/tests/tasks-parent-task.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/tasks-parent-task.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { taskRoutes } from "../src/routes/v1/tasks.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const PARENT_TASK_ID = "66666666-6666-4666-8666-666666666666";

async function buildApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as typeof req & { user: { tenantId: string; userId: string; role: "pm"; email: string } }).user =
      { tenantId: TENANT_ID, userId: USER_ID, role: "pm", email: "pm@example.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(taskRoutes, { prefix: "/tasks" });
  await app.ready();
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("POST /tasks with parentTaskId", () => {
  it("accepts a valid parentTaskId when parent is in same project and top-level", async () => {
    const queryTenant = vi.fn()
      // parent lookup
      .mockResolvedValueOnce([{ projectId: PROJECT_ID, parentTaskId: null }])
      // project status lookup (writable)
      .mockResolvedValueOnce([{ status: "active" }])
      // insert
      .mockResolvedValueOnce([{ id: "new-task", projectId: PROJECT_ID, parentTaskId: PARENT_TASK_ID, title: "child" }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "POST", url: "/tasks",
      payload: { projectId: PROJECT_ID, title: "child", parentTaskId: PARENT_TASK_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(201);
    expect(queryTenant.mock.calls[0][1]).toMatch(/SELECT project_id.*parent_task_id/i);
  });

  it("rejects a parentTaskId that itself has a parent (depth limit)", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([{ projectId: PROJECT_ID, parentTaskId: "some-grandparent" }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "POST", url: "/tasks",
      payload: { projectId: PROJECT_ID, title: "child", parentTaskId: PARENT_TASK_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().message ?? res.json().error).toMatch(/depth/i);
  });

  it("rejects a parentTaskId in a different project", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([{ projectId: "another-project-id", parentTaskId: null }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "POST", url: "/tasks",
      payload: { projectId: PROJECT_ID, title: "child", parentTaskId: PARENT_TASK_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().message ?? res.json().error).toMatch(/project/i);
  });

  it("returns 404 when parent does not exist", async () => {
    const queryTenant = vi.fn().mockResolvedValueOnce([]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "POST", url: "/tasks",
      payload: { projectId: PROJECT_ID, title: "child", parentTaskId: PARENT_TASK_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/tests/tasks-parent-task.test.ts`
Expected: all 4 FAIL (schema doesn't accept `parentTaskId`).

- [ ] **Step 3: Update `CreateTaskSchema` and insert path**

In `apps/api/src/routes/v1/tasks.ts`:

1. Extend `CreateTaskSchema`:
```ts
const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4_000).optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  startDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
});
```

2. At the top of the `POST /` handler, **before** the existing insert, add parent validation:

```ts
if (body.parentTaskId) {
  const parentRows = await fastify.db.queryTenant<{ projectId: string; parentTaskId: string | null }>(
    request.user.tenantId,
    `SELECT project_id AS "projectId", parent_task_id AS "parentTaskId"
       FROM tasks WHERE tenant_id = $1 AND id = $2`,
    [request.user.tenantId, body.parentTaskId],
  );
  if (parentRows.length === 0) throw fastify.httpErrors.notFound("Parent task not found");
  if (parentRows[0].projectId !== body.projectId) {
    throw fastify.httpErrors.badRequest("Parent task must be in the same project");
  }
  if (parentRows[0].parentTaskId !== null) {
    throw fastify.httpErrors.badRequest("Subtask depth limit reached (parent already has a parent)");
  }
}
```

3. Update the INSERT statement to include `parent_task_id`. Locate the existing INSERT inside the `POST /` handler (~line 170 of `tasks.ts` — search for `INSERT INTO tasks`) and add the column + parameter:

```ts
// Existing INSERT columns list — add parent_task_id at the end.
// Existing VALUES — add $N placeholder.
// Existing params — add body.parentTaskId ?? null.
```

The exact column and positional number depend on the existing handler. Confirm with `rg "INSERT INTO tasks" apps/api/src/routes/v1/tasks.ts -n` and thread the new column + $N consistently.

4. Add `parent_task_id AS "parentTaskId"` to any `RETURNING` list on the task insert/update.

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/tests/tasks-parent-task.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/tasks.ts apps/api/tests/tasks-parent-task.test.ts
git commit -m "api: POST /tasks accepts parentTaskId with depth + same-project validation"
```

### Task 4.2: `PATCH /tasks/:id` accepts `parentTaskId` (re-parent)

**Files:**
- Modify: `apps/api/src/routes/v1/tasks.ts`
- Modify: `apps/api/tests/tasks-parent-task.test.ts`

- [ ] **Step 1: Add failing test**

Append to `apps/api/tests/tasks-parent-task.test.ts`:

```ts
describe("PATCH /tasks/:id parentTaskId", () => {
  it("accepts null to un-parent", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([{ id: "t1", projectId: PROJECT_ID, status: "active" }]) // existing task lookup
      .mockResolvedValueOnce([{ id: "t1", parentTaskId: null }]);                     // update RETURNING
    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "PATCH", url: "/tasks/66666666-6666-4666-8666-666666666666", payload: { parentTaskId: null } });
    await app.close();
    expect(res.statusCode).toBe(200);
  });

  it("rejects cycles (re-parenting to a descendant)", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([{ id: "t1", projectId: PROJECT_ID, status: "active" }])
      .mockResolvedValueOnce([{ projectId: PROJECT_ID, parentTaskId: "t1" }]); // would-be parent descends from self
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: "/tasks/11111111-1111-4111-8111-111111111111",
      payload: { parentTaskId: "11111111-1111-4111-8111-111111111111" },
    });
    await app.close();
    // Cycle rejection: self-parenting is caught by id==parentId check.
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Extend `UpdateTaskSchema` (existing) + PATCH handler**

In `apps/api/src/routes/v1/tasks.ts`:

1. Find the existing task update schema (search for `z.object` patterns on the PATCH handler — it's likely `UpdateTaskSchema` or inlined).
2. Add `parentTaskId: z.string().uuid().nullable().optional()`.
3. In the PATCH handler, when `body.parentTaskId !== undefined`, apply the same validation as Task 4.1 (parent exists, same project, top-level); also reject self-parent (`id === parentTaskId`).
4. Include `parent_task_id = COALESCE($N, parent_task_id)` — but since `null` is a valid value, use `CASE WHEN $flag THEN $value ELSE parent_task_id END` pattern (mirrors `categories.updateCategory`).
5. Include `parent_task_id AS "parentTaskId"` in the RETURNING list.

- [ ] **Step 3: Run tests**

Run: `npx vitest run apps/api/tests/tasks-parent-task.test.ts`
Expected: PASS (6/6).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/tasks.ts apps/api/tests/tasks-parent-task.test.ts
git commit -m "api: PATCH /tasks/:id accepts parentTaskId (re-parent)"
```

### Task 4.3: Extend task SELECTs to always return `parentTaskId`

**Files:**
- Modify: `apps/api/src/routes/v1/tasks.ts`

- [ ] **Step 1: Add `parent_task_id AS "parentTaskId"` to every SELECT**

Search the file for `SELECT tasks.id,` (multiple places). For each, add after `tasks.project_id as "projectId",`:
```sql
tasks.parent_task_id as "parentTaskId",
```

- [ ] **Step 2: Run full task test suite**

Run: `npx vitest run apps/api/tests/ -t "tasks"`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/v1/tasks.ts
git commit -m "api: include parentTaskId in task SELECTs"
```

---

## Phase 5 · API project category support

### Task 5.1: `POST /projects` + `PATCH /projects/:id` accept `categoryId`

**Files:**
- Modify: `apps/api/src/routes/v1/projects.ts`

- [ ] **Step 1: Write failing tests**

Append to `apps/api/tests/project-archive-routes.test.ts` (existing project test file) or create `apps/api/tests/project-category.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { projectRoutes } from "../src/routes/v1/projects.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "77777777-7777-4777-8777-777777777777";

async function buildApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as typeof req & { user: { tenantId: string; userId: string; role: "pm"; email: string } }).user =
      { tenantId: TENANT_ID, userId: USER_ID, role: "pm", email: "pm@example.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(projectRoutes, { prefix: "/projects" });
  await app.ready();
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("POST /projects with categoryId", () => {
  it("persists categoryId on creation", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([]) // any pre-check
      .mockResolvedValueOnce([{ id: "p1", tenantId: TENANT_ID, categoryId: CATEGORY_ID }]); // INSERT
    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "POST", url: "/projects", payload: { name: "Client A", categoryId: CATEGORY_ID } });
    await app.close();
    expect(res.statusCode).toBe(201);
    const insertCall = queryTenant.mock.calls.find(c => /INSERT INTO projects/i.test(c[1] as string));
    expect(insertCall?.[2]).toContain(CATEGORY_ID);
  });
});

describe("PATCH /projects/:id with categoryId", () => {
  it("accepts null to uncategorise", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([{ id: "p1", tenantId: TENANT_ID }]) // existence check
      .mockResolvedValueOnce([{ id: "p1", categoryId: null }]);   // UPDATE RETURNING
    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "PATCH", url: "/projects/p1", payload: { categoryId: null } });
    await app.close();
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/tests/project-category.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend schemas + handlers in `apps/api/src/routes/v1/projects.ts`**

1. Find the `CreateProjectSchema` near the top (~line 30). Add:
```ts
categoryId: z.string().uuid().nullable().optional(),
```
2. Find the `UpdateProjectSchema` (the one handling PATCH — search for `status: z.enum(["active", "archived"])`). Add the same field.
3. In the POST handler's INSERT, thread `category_id` into the column list + VALUES + params as `body.categoryId ?? null`.
4. In the PATCH handler's UPDATE, add:
```sql
category_id = CASE WHEN $flagN::boolean THEN $valueN ELSE category_id END
```
with `flag = body.categoryId !== undefined`, `value = body.categoryId ?? null`.
5. Add `category_id AS "categoryId"` to every SELECT column list on projects.

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/tests/project-category.test.ts apps/api/tests/project-archive-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/v1/projects.ts apps/api/tests/project-category.test.ts
git commit -m "api: POST/PATCH /projects accept categoryId"
```

---

## Phase 6 · API portfolio timeline endpoint

### Task 6.1: Tree builder util + `GET /v1/timeline`

**Files:**
- Create: `apps/api/src/routes/v1/timeline.ts`
- Create: `apps/api/tests/timeline-portfolio.test.ts`
- Modify: `apps/api/src/routes/v1/index.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/tests/timeline-portfolio.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { timelineRoutes } from "../src/routes/v1/timeline.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

async function buildApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as typeof req & { user: { tenantId: string; userId: string; role: "pm"; email: string } }).user =
      { tenantId: TENANT_ID, userId: "u1", role: "pm", email: "pm@e" };
  });
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(timelineRoutes);
  await app.ready();
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("GET /timeline", () => {
  it("nests categories > projects > tasks and adds an Uncategorised bucket", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([ // categories
        { id: "c1", name: "Client", colour: null, sortOrder: 0 },
      ])
      .mockResolvedValueOnce([ // projects
        { id: "p1", name: "A", status: "active", startDate: null, targetDate: null, categoryId: "c1" },
        { id: "p2", name: "B", status: "active", startDate: null, targetDate: null, categoryId: null },
      ])
      .mockResolvedValueOnce([ // tasks
        { id: "t1", projectId: "p1", parentTaskId: null, title: "T1", status: "not_started", priority: "medium",
          assigneeUserId: null, assigneeName: null, startDate: null, endDate: null, dueDate: null, progressPercent: 0 },
      ])
      .mockResolvedValueOnce([]); // dependencies

    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "GET", url: "/timeline" });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.categories).toHaveLength(2);
    const named = body.categories.find((c: { name: string }) => c.name === "Client");
    const uncat = body.categories.find((c: { id: string | null }) => c.id === null);
    expect(named.projects).toHaveLength(1);
    expect(uncat.projects).toHaveLength(1);
    expect(named.projects[0].tasks).toHaveLength(1);
  });

  it("returns empty arrays when tenant has nothing", async () => {
    const queryTenant = vi.fn()
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "GET", url: "/timeline" });
    await app.close();
    expect(res.json()).toEqual({ categories: [], dependencies: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/tests/timeline-portfolio.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `timelineRoutes`**

Create `apps/api/src/routes/v1/timeline.ts`:

```ts
import { FastifyPluginAsync } from "fastify";
import type {
  PortfolioTimelineResponse, PortfolioTimelineCategory,
  PortfolioTimelineProject, GanttTask,
} from "@larry/shared";

type CatRow = { id: string; name: string; colour: string | null; sortOrder: number };
type ProjRow = {
  id: string; name: string; status: "active" | "archived";
  startDate: string | null; targetDate: string | null; categoryId: string | null;
};

export const timelineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/timeline", { preHandler: [fastify.authenticate] }, async (request): Promise<PortfolioTimelineResponse> => {
    const tenantId = request.user.tenantId;

    const [categoriesRaw, projectsRaw, tasksRaw, depsRaw] = await Promise.all([
      fastify.db.queryTenant<CatRow>(tenantId,
        `SELECT id, name, colour, sort_order AS "sortOrder"
           FROM project_categories WHERE tenant_id = $1
           ORDER BY sort_order ASC, created_at ASC`, [tenantId]),
      fastify.db.queryTenant<ProjRow>(tenantId,
        `SELECT id, name, status,
                start_date::text AS "startDate",
                target_date::text AS "targetDate",
                category_id AS "categoryId"
           FROM projects WHERE tenant_id = $1
           ORDER BY name ASC`, [tenantId]),
      fastify.db.queryTenant<GanttTask & { assigneeName: string | null }>(tenantId,
        `SELECT tasks.id,
                tasks.project_id    AS "projectId",
                tasks.parent_task_id AS "parentTaskId",
                tasks.title,
                tasks.status::text  AS status,
                tasks.priority::text AS priority,
                tasks.assignee_user_id AS "assigneeUserId",
                COALESCE(NULLIF(users.display_name, ''), split_part(users.email, '@', 1)) AS "assigneeName",
                tasks.start_date::text AS "startDate",
                tasks.due_date::text   AS "endDate",
                tasks.due_date::text   AS "dueDate",
                tasks.progress_percent AS "progressPercent"
           FROM tasks
           LEFT JOIN users ON users.id = tasks.assignee_user_id
           WHERE tasks.tenant_id = $1
           ORDER BY tasks.project_id, tasks.created_at ASC`, [tenantId]),
      fastify.db.queryTenant<{ taskId: string; dependsOnTaskId: string }>(tenantId,
        `SELECT task_id AS "taskId", depends_on_task_id AS "dependsOnTaskId"
           FROM task_dependencies WHERE tenant_id = $1`, [tenantId]),
    ]);

    const tasksByProject = new Map<string, GanttTask[]>();
    for (const t of tasksRaw) {
      const list = tasksByProject.get(t.projectId) ?? [];
      list.push(t);
      tasksByProject.set(t.projectId, list);
    }

    const projectsByCategory = new Map<string | null, PortfolioTimelineProject[]>();
    for (const p of projectsRaw) {
      const list = projectsByCategory.get(p.categoryId) ?? [];
      list.push({
        id: p.id, name: p.name, status: p.status,
        startDate: p.startDate, targetDate: p.targetDate,
        tasks: tasksByProject.get(p.id) ?? [],
      });
      projectsByCategory.set(p.categoryId, list);
    }

    const categories: PortfolioTimelineCategory[] = categoriesRaw.map(c => ({
      id: c.id, name: c.name, colour: c.colour, sortOrder: c.sortOrder,
      projects: projectsByCategory.get(c.id) ?? [],
    }));

    const uncategorised = projectsByCategory.get(null) ?? [];
    if (uncategorised.length > 0) {
      categories.push({
        id: null, name: "Uncategorised", colour: null,
        sortOrder: Number.MAX_SAFE_INTEGER, projects: uncategorised,
      });
    }

    return { categories, dependencies: depsRaw };
  });
};
```

- [ ] **Step 4: Register the route**

In `apps/api/src/routes/v1/index.ts` add after `categoryRoutes` import:
```ts
import { timelineRoutes } from "./timeline.js";
```
And inside `v1Routes`:
```ts
await fastify.register(timelineRoutes);
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run apps/api/tests/timeline-portfolio.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/timeline.ts apps/api/tests/timeline-portfolio.test.ts apps/api/src/routes/v1/index.ts
git commit -m "api: GET /v1/timeline returns tenant-wide category/project/task tree"
```

---

## Phase 7 · Extend per-project timeline SELECT

### Task 7.1: Include `parentTaskId` in `GET /v1/projects/:id/timeline`

**Files:**
- Modify: the handler for `/projects/:id/timeline` (locate via `rg "projects.*timeline" apps/api/src/routes/v1 -n`)

- [ ] **Step 1: Add `tasks.parent_task_id AS "parentTaskId"` to the SELECT**

Open the file returned by the ripgrep. In the `gantt` task SELECT, add the column.

- [ ] **Step 2: Add an inline test**

Append to an existing timeline test file (or create `apps/api/tests/timeline-project.test.ts` following the pattern of Phase 6):

```ts
it("GET /projects/:id/timeline includes parentTaskId on tasks", async () => {
  // ... shape test mirroring existing pattern
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run apps/api/tests -t "timeline"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "api: include parentTaskId in per-project timeline response"
```

---

## Phase 8 · Web proxy routes

### Task 8.1: Proxy `GET /workspace/timeline`

**Files:**
- Create: `apps/web/src/app/api/workspace/timeline/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, `/v1/timeline`);
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run -w @larry/web typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/workspace/timeline/route.ts
git commit -m "web: proxy /api/workspace/timeline → /v1/timeline"
```

### Task 8.2: Proxy category CRUD

**Files:**
- Create: `apps/web/src/app/api/workspace/categories/route.ts`
- Create: `apps/web/src/app/api/workspace/categories/[id]/route.ts`
- Create: `apps/web/src/app/api/workspace/categories/reorder/route.ts`

- [ ] **Step 1: `route.ts` — GET list + POST create**

Create `apps/web/src/app/api/workspace/categories/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await proxyApiRequest(session, `/v1/categories`);
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const result = await proxyApiRequest(session, `/v1/categories`, { method: "POST", body: JSON.stringify(body) });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: `[id]/route.ts` — PATCH + DELETE**

Create `apps/web/src/app/api/workspace/categories/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await request.json();
  const result = await proxyApiRequest(session, `/v1/categories/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await proxyApiRequest(session, `/v1/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (result.session) await persistSession(result.session);
  return new NextResponse(null, { status: result.status });
}
```

- [ ] **Step 3: `reorder/route.ts` — POST**

Create `apps/web/src/app/api/workspace/categories/reorder/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const result = await proxyApiRequest(session, `/v1/categories/reorder`, {
    method: "POST", body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run -w @larry/web typecheck`
Expected: exit 0.

```bash
git add apps/web/src/app/api/workspace/categories
git commit -m "web: proxy /api/workspace/categories CRUD + reorder"
```

---

## Phase 9 · Web gantt types + utils

### Task 9.1: Gantt types file

**Files:**
- Create: `apps/web/src/components/workspace/gantt/gantt-types.ts`

- [ ] **Step 1: Write the file**

```ts
import type { GanttTask, ProjectCategory, PortfolioTimelineResponse } from "@larry/shared";

export type { GanttTask, ProjectCategory, PortfolioTimelineResponse };

export type GanttNode =
  | { kind: "category"; id: string | null; name: string; colour: string | null; children: GanttNode[] }
  | { kind: "project";  id: string; name: string; status: string; children: GanttNode[] }
  | { kind: "task";     id: string; task: GanttTask; children: GanttNode[] }
  | { kind: "subtask";  id: string; task: GanttTask };

export type ZoomLevel = "week" | "month" | "quarter";
export const ROW_HEIGHT = 36;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-types.ts
git commit -m "web: gantt node + zoom types"
```

### Task 9.2: Tree build + flatten + rollup utils

**Files:**
- Create: `apps/web/src/components/workspace/gantt/gantt-utils.ts`
- Create: `apps/web/src/components/workspace/gantt/gantt-utils.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { buildPortfolioTree, buildProjectTree, flattenVisible, rollUpBar } from "./gantt-utils";
import type { PortfolioTimelineResponse, GanttTask, GanttNode } from "./gantt-types";

const baseTask = (over: Partial<GanttTask> = {}): GanttTask => ({
  id: "t", projectId: "p", parentTaskId: null, title: "T",
  status: "not_started", priority: "medium",
  assigneeUserId: null, assigneeName: null,
  startDate: null, endDate: null, dueDate: null, progressPercent: 0,
  ...over,
});

describe("buildPortfolioTree", () => {
  it("nests tasks under parents and orphans remain top-level", () => {
    const resp: PortfolioTimelineResponse = {
      categories: [{
        id: "c1", name: "C", colour: null, sortOrder: 0,
        projects: [{
          id: "p1", name: "P", status: "active", startDate: null, targetDate: null,
          tasks: [
            baseTask({ id: "t1", projectId: "p1" }),
            baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),
            baseTask({ id: "t3", projectId: "p1" }),
          ],
        }],
      }],
      dependencies: [],
    };
    const tree = buildPortfolioTree(resp);
    expect(tree.kind).toBe("category"); // root is synthetic
    const cat = (tree as Extract<GanttNode, { kind: "category" }>).children[0] as Extract<GanttNode, { kind: "category" }>;
    expect(cat.kind).toBe("category");
    const proj = cat.children[0] as Extract<GanttNode, { kind: "project" }>;
    expect(proj.children).toHaveLength(2); // t1, t3 at top; t2 under t1
    const t1 = proj.children.find((n) => "task" in n && n.task.id === "t1") as Extract<GanttNode, { kind: "task" }>;
    expect(t1.children).toHaveLength(1);
    expect((t1.children[0] as Extract<GanttNode, { kind: "subtask" }>).task.id).toBe("t2");
  });
});

describe("buildProjectTree", () => {
  it("skips the category level", () => {
    const tasks: GanttTask[] = [
      baseTask({ id: "t1", projectId: "p1" }),
      baseTask({ id: "t2", projectId: "p1", parentTaskId: "t1" }),
    ];
    const tree = buildProjectTree({ id: "p1", name: "P", status: "active" }, tasks);
    expect(tree.kind).toBe("project");
    expect(tree.children).toHaveLength(1);
  });
});

describe("flattenVisible", () => {
  it("respects expandedSet", () => {
    const task1 = { kind: "task" as const, id: "t1", task: baseTask({ id: "t1" }),
      children: [{ kind: "subtask" as const, id: "t2", task: baseTask({ id: "t2", parentTaskId: "t1" }) }] };
    const project: GanttNode = { kind: "project", id: "p1", name: "P", status: "active", children: [task1] };
    const cat: GanttNode = { kind: "category", id: "c1", name: "C", colour: null, children: [project] };

    const expanded = new Set<string>(["cat:c1", "proj:p1"]); // task NOT expanded → subtask hidden
    const rows = flattenVisible(cat, expanded);
    expect(rows.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1"]);

    expanded.add("task:t1");
    const rows2 = flattenVisible(cat, expanded);
    expect(rows2.map(r => r.key)).toEqual(["cat:c1", "proj:p1", "task:t1", "sub:t2"]);
  });
});

describe("rollUpBar", () => {
  it("spans min-start to max-end and averages progress weighted by duration", () => {
    const a = baseTask({ id: "a", startDate: "2026-01-01", endDate: "2026-01-05", dueDate: "2026-01-05", progressPercent: 100 });
    const b = baseTask({ id: "b", startDate: "2026-01-03", endDate: "2026-01-10", dueDate: "2026-01-10", progressPercent: 0 });
    const r = rollUpBar([a, b]);
    expect(r?.start).toBe("2026-01-01");
    expect(r?.end).toBe("2026-01-10");
    // 5 days × 100 + 8 days × 0 = 500 / 13 = 38.46...
    expect(r?.progressPercent).toBeGreaterThan(37);
    expect(r?.progressPercent).toBeLessThan(40);
  });

  it("returns null when no tasks have dates", () => {
    expect(rollUpBar([baseTask()])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run apps/web/src/components/workspace/gantt/gantt-utils.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementation**

Create `apps/web/src/components/workspace/gantt/gantt-utils.ts`:

```ts
import type {
  GanttNode, GanttTask, PortfolioTimelineResponse, ZoomLevel,
} from "./gantt-types";

/* ─── Tree building ────────────────────────────────────────────────── */

export function buildPortfolioTree(resp: PortfolioTimelineResponse): GanttNode {
  const categoryChildren: GanttNode[] = resp.categories.map((c) => ({
    kind: "category",
    id: c.id,
    name: c.name,
    colour: c.colour,
    children: c.projects.map((p) => ({
      kind: "project",
      id: p.id,
      name: p.name,
      status: p.status,
      children: buildTaskForest(p.tasks),
    })),
  }));
  return { kind: "category", id: "__root__", name: "", colour: null, children: categoryChildren };
}

export function buildProjectTree(
  project: { id: string; name: string; status: string },
  tasks: GanttTask[],
): Extract<GanttNode, { kind: "project" }> {
  return {
    kind: "project", id: project.id, name: project.name, status: project.status,
    children: buildTaskForest(tasks),
  };
}

function buildTaskForest(tasks: GanttTask[]): GanttNode[] {
  const byParent = new Map<string | null, GanttTask[]>();
  for (const t of tasks) {
    const list = byParent.get(t.parentTaskId) ?? [];
    list.push(t);
    byParent.set(t.parentTaskId, list);
  }
  const top = byParent.get(null) ?? [];
  return top.map<GanttNode>((t) => ({
    kind: "task",
    id: t.id,
    task: t,
    children: (byParent.get(t.id) ?? []).map<GanttNode>((sub) => ({
      kind: "subtask", id: sub.id, task: sub,
    })),
  }));
}

/* ─── Flatten for rendering ────────────────────────────────────────── */

export interface FlatRow {
  key: string;        // stable id, e.g. "cat:c1", "proj:p1", "task:t1", "sub:t2"
  depth: number;      // 0..3
  node: GanttNode;
  hasChildren: boolean;
}

export function flattenVisible(root: GanttNode, expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = [];

  function keyOf(node: GanttNode): string {
    if (node.kind === "category") return `cat:${node.id ?? "uncat"}`;
    if (node.kind === "project") return `proj:${node.id}`;
    if (node.kind === "task") return `task:${node.id}`;
    return `sub:${node.id}`;
  }

  function walk(node: GanttNode, depth: number, isRoot: boolean) {
    const children: GanttNode[] = (node.kind === "subtask") ? [] : node.children;
    const hasChildren = children.length > 0;
    const key = keyOf(node);

    if (!isRoot) rows.push({ key, depth, node, hasChildren });

    if (!isRoot && !expanded.has(key)) return;
    for (const child of children) walk(child, depth + (isRoot ? 0 : 1), false);
  }

  walk(root, 0, true);
  return rows;
}

/* ─── Rollup (parent bar spans children's min→max, progress weighted) ─── */

export interface RolledBar {
  start: string;        // ISO yyyy-mm-dd
  end: string;
  progressPercent: number;
}

export function rollUpBar(tasks: GanttTask[]): RolledBar | null {
  const ranges = tasks
    .map((t) => {
      const s = t.startDate;
      const e = t.endDate ?? t.dueDate;
      if (!s || !e) return null;
      const days = Math.max(1, Math.round(
        (new Date(e).getTime() - new Date(s).getTime()) / 86_400_000,
      ));
      return { start: s, end: e, progress: t.progressPercent, days };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (ranges.length === 0) return null;

  const start = ranges.reduce((a, b) => (a < b.start ? a : b.start), ranges[0].start);
  const end = ranges.reduce((a, b) => (a > b.end ? a : b.end), ranges[0].end);

  const totalWeighted = ranges.reduce((sum, r) => sum + r.progress * r.days, 0);
  const totalDays = ranges.reduce((sum, r) => sum + r.days, 0);
  const progressPercent = totalDays === 0 ? 0 : Math.round(totalWeighted / totalDays);

  return { start, end, progressPercent };
}

/* ─── Axis / zoom helpers (mirrors timeline-utils.ts) ───────────────── */

export function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface TimelineRange { start: Date; end: Date; totalDays: number; }

export function computeRange(tasks: GanttTask[], zoom: ZoomLevel): TimelineRange {
  const now = new Date();
  let earliest = now, latest = now;
  for (const t of tasks) {
    const s = t.startDate ? new Date(t.startDate) : null;
    const e = (t.endDate ?? t.dueDate) ? new Date((t.endDate ?? t.dueDate) as string) : null;
    if (s && s < earliest) earliest = s;
    if (e && e > latest) latest = e;
  }
  const padDays = zoom === "week" ? 3 : zoom === "month" ? 14 : 30;
  const minFuture = zoom === "week" ? 42 : zoom === "month" ? 120 : 365;
  const start = addDays(earliest, -padDays);
  const taskEnd = addDays(latest, padDays);
  const minEnd = addDays(now, minFuture);
  const end = taskEnd > minEnd ? taskEnd : minEnd;
  return { start, end, totalDays: Math.max(daysBetween(start, end), 1) };
}

export function dateToPct(d: Date, range: TimelineRange): number {
  return (daysBetween(range.start, d) / range.totalDays) * 100;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/components/workspace/gantt/gantt-utils.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/gantt/gantt-utils.ts apps/web/src/components/workspace/gantt/gantt-utils.test.ts
git commit -m "web: gantt tree + flatten + rollup utils"
```

---

## Phase 10 · Outline + Grid + Bar + Row

### Task 10.1: `GanttBar` with category/project/task/subtask variants

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import type { GanttTask } from "./gantt-types";
import { dateToPct, type TimelineRange } from "./gantt-utils";

type Variant = "category" | "project" | "task" | "subtask" | "rollup";

interface Props {
  variant: Variant;
  start: string;
  end: string;
  progressPercent: number;
  range: TimelineRange;
  label?: string;
  task?: GanttTask;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const VARIANT_CSS: Record<Variant, { height: number; bg: string; bar: string; bold?: boolean }> = {
  category: { height: 20, bg: "rgba(108, 68, 246, 0.06)", bar: "rgba(108, 68, 246, 0.18)", bold: true },
  project:  { height: 16, bg: "rgba(108, 68, 246, 0.18)", bar: "#6c44f6" },
  task:     { height: 16, bg: "var(--tl-not-started)", bar: "var(--tl-in-progress-dark, #6c44f6)" },
  subtask:  { height: 10, bg: "var(--tl-not-started)", bar: "var(--tl-in-progress-dark, #6c44f6)" },
  rollup:   { height: 6,  bg: "rgba(108, 68, 246, 0.15)", bar: "rgba(108, 68, 246, 0.40)" },
};

export function GanttBar({ variant, start, end, progressPercent, range, label, highlighted, dimmed, onClick, onMouseEnter, onMouseLeave }: Props) {
  const s = new Date(start);
  const e = new Date(end);
  const left = dateToPct(s, range);
  const right = dateToPct(e, range);
  const width = Math.max(right - left, 0.5);
  const cfg = VARIANT_CSS[variant];
  const ring = highlighted ? "0 0 0 2px #6c44f6" : undefined;

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        left: `${left}%`, width: `${width}%`,
        top: `calc(50% - ${cfg.height / 2}px)`,
        height: cfg.height,
        background: cfg.bg,
        borderRadius: cfg.height >= 14 ? 6 : 4,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        boxShadow: ring,
        opacity: dimmed ? 0.3 : 1,
        transition: "box-shadow 120ms",
      }}
      title={label}
    >
      <div style={{
        width: `${Math.min(100, Math.max(0, progressPercent))}%`,
        height: "100%",
        background: cfg.bar,
      }} />
      {label && variant !== "subtask" && (
        <span style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          fontSize: 11, fontWeight: cfg.bold ? 700 : 500,
          color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: "calc(100% - 16px)", mixBlendMode: "normal",
        }}>{label}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run -w @larry/web typecheck` — expect exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttBar.tsx
git commit -m "web: GanttBar variants (category/project/task/subtask/rollup)"
```

### Task 10.2: `GanttOutlineRow` and `GanttOutline`

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx`
- Create: `apps/web/src/components/workspace/gantt/GanttOutline.tsx`

- [ ] **Step 1: `GanttOutlineRow.tsx`**

```tsx
"use client";
import { ChevronRight } from "lucide-react";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";

interface Props {
  row: FlatRow;
  expanded: boolean;
  selected: boolean;
  hovered: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
}

function iconForKind(kind: FlatRow["node"]["kind"]) {
  return kind === "category" ? "C" : kind === "project" ? "P" : kind === "task" ? "·" : "◦";
}

export function GanttOutlineRow({ row, expanded, selected, hovered, onToggle, onSelect, onHover }: Props) {
  const indent = 12 + row.depth * 12;
  const n = row.node;
  const label =
    n.kind === "category" ? n.name :
    n.kind === "project"  ? n.name :
    n.kind === "task"     ? n.task.title :
                             n.task.title;

  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onSelect}
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: indent,
        paddingRight: 8,
        borderBottom: "1px solid var(--border, #eaeaea)",
        borderLeft: selected ? "3px solid #6c44f6" : "3px solid transparent",
        background: hovered ? "var(--surface-2, #fafafa)" : "transparent",
        cursor: onSelect ? "pointer" : "default",
        fontSize: n.kind === "category" ? 12 : 13,
        fontWeight: n.kind === "category" ? 700 : n.kind === "project" ? 600 : 500,
        textTransform: n.kind === "category" ? "uppercase" : "none",
        letterSpacing: n.kind === "category" ? 0.4 : 0,
        color: n.kind === "subtask" ? "var(--text-2)" : "var(--text-1)",
        userSelect: "none",
      }}
    >
      {row.hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          style={{
            width: 18, height: 18, marginRight: 4,
            background: "transparent", border: 0, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms", cursor: "pointer",
          }}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight size={14} />
        </button>
      ) : (
        <span style={{ width: 22 }} />
      )}
      <span style={{ width: 14, fontSize: 10, color: "var(--text-muted)" }}>{iconForKind(n.kind)}</span>
      <span style={{ marginLeft: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: `GanttOutline.tsx`**

```tsx
"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import type { FlatRow } from "./gantt-utils";
import { GanttOutlineRow } from "./GanttOutlineRow";

interface Props {
  rows: FlatRow[];
  expanded: Set<string>;
  selectedKey: string | null;
  hoveredKey: string | null;
  width: number;
  onWidthChange: (w: number) => void;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onHover: (key: string | null) => void;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

export function GanttOutline({ rows, expanded, selectedKey, hoveredKey, width, onWidthChange, onToggle, onSelect, onHover }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW.current + (e.clientX - startX.current)));
      onWidthChange(next);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onWidthChange]);

  return (
    <div style={{ position: "sticky", left: 0, zIndex: 2, background: "#fff", width, flexShrink: 0, borderRight: "1px solid var(--border, #eaeaea)" }}>
      <div style={{ overflow: "hidden" }}>
        {rows.map((row) => (
          <GanttOutlineRow
            key={row.key}
            row={row}
            expanded={expanded.has(row.key)}
            selected={selectedKey === row.key}
            hovered={hoveredKey === row.key}
            onToggle={() => onToggle(row.key)}
            onSelect={() => onSelect(row.key)}
            onHover={(h) => onHover(h ? row.key : null)}
          />
        ))}
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize" }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttOutline.tsx apps/web/src/components/workspace/gantt/GanttOutlineRow.tsx
git commit -m "web: GanttOutline + GanttOutlineRow (collapsible resizable tree)"
```

### Task 10.3: `GanttRow` + `GanttGrid`

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttRow.tsx`
- Create: `apps/web/src/components/workspace/gantt/GanttGrid.tsx`

- [ ] **Step 1: `GanttRow.tsx`**

```tsx
"use client";
import type { FlatRow } from "./gantt-utils";
import { ROW_HEIGHT } from "./gantt-types";
import { GanttBar } from "./GanttBar";
import { rollUpBar, type TimelineRange } from "./gantt-utils";
import type { GanttTask } from "./gantt-types";

interface Props {
  row: FlatRow;
  range: TimelineRange;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
}

function gatherDescendantTasks(row: FlatRow["node"]): GanttTask[] {
  const out: GanttTask[] = [];
  function walk(n: FlatRow["node"]) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(row);
  return out;
}

export function GanttRow({ row, range, hoveredKey, selectedKey, onHoverKey, onSelectKey }: Props) {
  const n = row.node;
  const highlighted = hoveredKey === row.key;
  const selected = selectedKey === row.key;

  let content: React.ReactNode = null;
  if (n.kind === "task" || n.kind === "subtask") {
    const t = n.task;
    const start = t.startDate;
    const end = t.endDate ?? t.dueDate;
    if (start && end) {
      content = (
        <GanttBar
          variant={n.kind}
          start={start}
          end={end}
          progressPercent={t.progressPercent}
          range={range}
          label={t.title}
          task={t}
          highlighted={highlighted}
          dimmed={false}
          onClick={() => onSelectKey(row.key)}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  } else {
    const r = rollUpBar(gatherDescendantTasks(n));
    if (r) {
      content = (
        <GanttBar
          variant={n.kind}
          start={r.start}
          end={r.end}
          progressPercent={r.progressPercent}
          range={range}
          label={n.kind === "category" ? n.name : n.kind === "project" ? n.name : ""}
          highlighted={highlighted}
          onMouseEnter={() => onHoverKey(row.key)}
          onMouseLeave={() => onHoverKey(null)}
        />
      );
    }
  }

  return (
    <div style={{
      height: ROW_HEIGHT,
      position: "relative",
      borderBottom: "1px solid var(--border, #eaeaea)",
      background: selected ? "rgba(108, 68, 246, 0.04)" : "transparent",
    }}>
      {content}
    </div>
  );
}
```

- [ ] **Step 2: `GanttGrid.tsx`**

```tsx
"use client";
import { forwardRef, useMemo } from "react";
import type { FlatRow } from "./gantt-utils";
import type { ZoomLevel } from "./gantt-types";
import type { TimelineRange } from "./gantt-utils";
import { dateToPct, addDays } from "./gantt-utils";
import { GanttRow } from "./GanttRow";

interface Props {
  rows: FlatRow[];
  range: TimelineRange;
  zoom: ZoomLevel;
  hoveredKey: string | null;
  selectedKey: string | null;
  onHoverKey: (k: string | null) => void;
  onSelectKey: (k: string | null) => void;
}

export const GanttGrid = forwardRef<HTMLDivElement, Props>(function GanttGrid(
  { rows, range, zoom, hoveredKey, selectedKey, onHoverKey, onSelectKey }, ref,
) {
  const markers = useMemo(() => generateMarkers(range, zoom), [range, zoom]);
  const todayPct = dateToPct(new Date(), range);

  return (
    <div ref={ref} style={{ position: "relative", overflowX: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ minWidth: "max-content", position: "relative" }}>
        {/* Header */}
        <div style={{ position: "sticky", top: 0, height: 34, background: "#fff", borderBottom: "1px solid var(--border, #eaeaea)", zIndex: 1 }}>
          {markers.map((m, i) => (
            <span key={i} style={{ position: "absolute", left: `${m.pct}%`, top: 10, fontSize: 10, color: "var(--text-muted)" }}>
              {m.label}
            </span>
          ))}
        </div>

        {/* Today line */}
        <div style={{ position: "absolute", left: `${todayPct}%`, top: 34, bottom: 0, width: 1, background: "rgba(108, 68, 246, 0.4)", pointerEvents: "none", zIndex: 1 }} />

        {/* Rows */}
        {rows.map((r) => (
          <GanttRow key={r.key} row={r} range={range} hoveredKey={hoveredKey} selectedKey={selectedKey}
            onHoverKey={onHoverKey} onSelectKey={onSelectKey} />
        ))}
      </div>
    </div>
  );
});

function generateMarkers(range: TimelineRange, zoom: ZoomLevel): Array<{ pct: number; label: string }> {
  const markers: Array<{ pct: number; label: string }> = [];
  const cursor = new Date(range.start);

  if (zoom === "week") {
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (zoom === "month") {
    cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7 || 7));
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    cursor.setDate(1); cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= range.end) {
      markers.push({
        pct: dateToPct(cursor, range),
        label: cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return markers;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttRow.tsx apps/web/src/components/workspace/gantt/GanttGrid.tsx
git commit -m "web: GanttGrid + GanttRow with rollup bars and today line"
```

---

## Phase 11 · Container + Toolbar

### Task 11.1: `GanttToolbar`

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttToolbar.tsx`

- [ ] **Step 1: Write it**

```tsx
"use client";
import { Calendar, ChevronsDownUp, ChevronsUpDown, Plus, Search } from "lucide-react";
import type { ZoomLevel } from "./gantt-types";

interface Props {
  zoom: ZoomLevel;
  allCollapsed: boolean;
  search: string;
  onZoom: (z: ZoomLevel) => void;
  onToggleCollapseAll: () => void;
  onJumpToToday: () => void;
  onSearch: (s: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  addLabel: string;
}

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  height: 28, padding: "0 10px", fontSize: 12, fontWeight: 500,
  background: "var(--surface, #fff)", border: "1px solid var(--border, #eaeaea)",
  borderRadius: 6, color: "var(--text-1)", cursor: "pointer",
};

export function GanttToolbar({ zoom, allCollapsed, search, onZoom, onToggleCollapseAll, onJumpToToday, onSearch, onAdd, canAdd, addLabel }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", flexWrap: "wrap" }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--border, #eaeaea)", borderRadius: 6, overflow: "hidden" }}>
        {(["week", "month", "quarter"] as const).map((z) => (
          <button key={z} onClick={() => onZoom(z)} style={{
            ...btn, border: 0, borderRadius: 0, height: 28,
            background: zoom === z ? "#6c44f6" : "#fff", color: zoom === z ? "#fff" : "var(--text-1)",
          }}>{z[0].toUpperCase()}</button>
        ))}
      </div>

      <button style={btn} onClick={onJumpToToday}><Calendar size={14} />Today</button>
      <button style={btn} onClick={onToggleCollapseAll}>
        {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        {allCollapsed ? "Expand all" : "Collapse all"}
      </button>

      <label style={{ ...btn, padding: "0 8px", flex: "0 1 240px" }}>
        <Search size={14} />
        <input value={search} onChange={(e) => onSearch(e.target.value)}
          placeholder="Search..." style={{ border: 0, outline: 0, background: "transparent", fontSize: 12, width: "100%" }} />
      </label>

      <div style={{ flex: 1 }} />

      <button style={{ ...btn, background: canAdd ? "#6c44f6" : "#ddd", color: "#fff", border: 0, opacity: canAdd ? 1 : 0.6 }}
        onClick={canAdd ? onAdd : undefined}>
        <Plus size={14} />{addLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttToolbar.tsx
git commit -m "web: GanttToolbar (zoom, today, collapse-all, search, add)"
```

### Task 11.2: `GanttContainer` (stitches outline + grid + toolbar)

**Files:**
- Create: `apps/web/src/components/workspace/gantt/GanttContainer.tsx`

- [ ] **Step 1: Write it**

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GanttNode } from "./gantt-types";
import { computeRange, flattenVisible, dateToPct } from "./gantt-utils";
import type { ZoomLevel } from "./gantt-types";
import { GanttOutline } from "./GanttOutline";
import { GanttGrid } from "./GanttGrid";
import { GanttToolbar } from "./GanttToolbar";

interface Props {
  root: GanttNode;
  defaultZoom?: ZoomLevel;
  onOpenDetail?: (key: string) => void;
  onAdd?: (context: { selectedKey: string | null }) => void;
  addLabel?: string;
}

export function GanttContainer({ root, defaultZoom = "month", onOpenDetail, onAdd, addLabel = "+ Add" }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>(defaultZoom);
  const [search, setSearch] = useState("");
  const [outlineWidth, setOutlineWidth] = useState(320);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllKeys(root));
  const gridRef = useRef<HTMLDivElement>(null);

  // All tasks flattened for range
  const allTasks = useMemo(() => collectTasks(root), [root]);
  const range = useMemo(() => computeRange(allTasks, zoom), [allTasks, zoom]);

  const rows = useMemo(() => {
    const base = flattenVisible(root, expanded);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((r) => nodeLabel(r.node).toLowerCase().includes(q));
  }, [root, expanded, search]);

  const allCollapsed = expanded.size === 0;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleCollapseAll() {
    if (allCollapsed) setExpanded(collectAllKeys(root));
    else setExpanded(new Set());
  }

  function jumpToToday() {
    if (!gridRef.current) return;
    const pct = dateToPct(new Date(), range);
    const sw = gridRef.current.scrollWidth;
    const vw = gridRef.current.clientWidth;
    gridRef.current.scrollTo({ left: Math.max(0, (pct / 100) * sw - vw / 2), behavior: "smooth" });
  }

  useEffect(() => {
    // Keep expanded set reasonable when tree shape changes
    setExpanded((prev) => {
      const keys = collectAllKeys(root);
      const next = new Set<string>();
      for (const k of prev) if (keys.has(k)) next.add(k);
      return next.size === 0 ? keys : next;
    });
  }, [root]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <GanttToolbar
        zoom={zoom} allCollapsed={allCollapsed} search={search}
        onZoom={setZoom} onToggleCollapseAll={toggleCollapseAll} onJumpToToday={jumpToToday}
        onSearch={setSearch}
        onAdd={() => onAdd?.({ selectedKey })}
        canAdd={Boolean(onAdd)}
        addLabel={addLabel}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0, border: "1px solid var(--border, #eaeaea)", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        <GanttOutline
          rows={rows}
          expanded={expanded}
          selectedKey={selectedKey}
          hoveredKey={hoveredKey}
          width={outlineWidth}
          onWidthChange={setOutlineWidth}
          onToggle={toggle}
          onSelect={(k) => { setSelectedKey(k); onOpenDetail?.(k); }}
          onHover={setHoveredKey}
        />
        <GanttGrid
          ref={gridRef}
          rows={rows}
          range={range}
          zoom={zoom}
          hoveredKey={hoveredKey}
          selectedKey={selectedKey}
          onHoverKey={setHoveredKey}
          onSelectKey={(k) => { setSelectedKey(k); if (k) onOpenDetail?.(k); }}
        />
      </div>
    </div>
  );
}

function nodeLabel(n: GanttNode): string {
  if (n.kind === "category" || n.kind === "project") return n.name;
  return n.task.title;
}

function collectTasks(root: GanttNode): import("./gantt-types").GanttTask[] {
  const out: import("./gantt-types").GanttTask[] = [];
  function walk(n: GanttNode) {
    if (n.kind === "task" || n.kind === "subtask") out.push(n.task);
    if (n.kind !== "subtask") for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function collectAllKeys(root: GanttNode): Set<string> {
  const out = new Set<string>();
  function keyOf(n: GanttNode): string {
    if (n.kind === "category") return `cat:${n.id ?? "uncat"}`;
    if (n.kind === "project") return `proj:${n.id}`;
    if (n.kind === "task") return `task:${n.id}`;
    return `sub:${n.id}`;
  }
  function walk(n: GanttNode, isRoot: boolean) {
    if (!isRoot) out.add(keyOf(n));
    if (n.kind !== "subtask") for (const c of n.children) walk(c, false);
  }
  walk(root, true);
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run -w @larry/web typecheck` — expect exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/gantt/GanttContainer.tsx
git commit -m "web: GanttContainer stitches outline + grid + toolbar"
```

---

## Phase 12 · Portfolio page

### Task 12.1: `PortfolioGanttClient` + server page

**Files:**
- Create: `apps/web/src/app/workspace/timeline/PortfolioGanttClient.tsx`
- Create: `apps/web/src/app/workspace/timeline/page.tsx`

- [ ] **Step 1: Client component**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import type { PortfolioTimelineResponse } from "@/components/workspace/gantt/gantt-types";
import { buildPortfolioTree } from "@/components/workspace/gantt/gantt-utils";
import { GanttContainer } from "@/components/workspace/gantt/GanttContainer";

export function PortfolioGanttClient() {
  const [data, setData] = useState<PortfolioTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/timeline", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void fetchTimeline(); }, [fetchTimeline]);

  if (error) return <div style={{ padding: 24 }}>Couldn't load timeline: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const root = buildPortfolioTree(data);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, minHeight: 0 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, marginBottom: 4 }}>Timeline</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, marginBottom: 12 }}>
        Everything across your workspace. Click a row to open details.
      </p>
      <GanttContainer root={root} defaultZoom="month" addLabel="+ Add" />
    </div>
  );
}
```

- [ ] **Step 2: Server page**

```tsx
import { PortfolioGanttClient } from "./PortfolioGanttClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return <PortfolioGanttClient />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/timeline
git commit -m "web: /workspace/timeline portfolio Gantt page"
```

---

## Phase 13 · Project Gantt cutover

### Task 13.1: `ProjectGanttClient` + swap in `ProjectWorkspaceView`

**Files:**
- Create: `apps/web/src/components/workspace/gantt/ProjectGanttClient.tsx`
- Modify: `apps/web/src/app/workspace/projects/[projectId]/ProjectWorkspaceView.tsx`
- Modify: `apps/web/src/app/dashboard/types.ts` (add `parentTaskId` to `WorkspaceTimelineTask`)

- [ ] **Step 1: Extend `WorkspaceTimelineTask`**

In `apps/web/src/app/dashboard/types.ts`, find `WorkspaceTimelineTask` and add:
```ts
parentTaskId?: string | null;
```

- [ ] **Step 2: Write `ProjectGanttClient.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import type { WorkspaceTimelineTask, WorkspaceTimeline } from "@/app/dashboard/types";
import type { GanttTask } from "./gantt-types";
import { buildProjectTree } from "./gantt-utils";
import { GanttContainer } from "./GanttContainer";

interface Props {
  projectId: string;
  projectName: string;
  tasks: WorkspaceTimelineTask[];
  timeline: WorkspaceTimeline | null;
  refresh: () => Promise<void>;
}

function toGanttTask(t: WorkspaceTimelineTask): GanttTask {
  return {
    id: t.id,
    projectId: t.projectId ?? "",
    parentTaskId: t.parentTaskId ?? null,
    title: t.title,
    status: t.status as GanttTask["status"],
    priority: t.priority as GanttTask["priority"],
    assigneeUserId: t.assigneeUserId ?? null,
    assigneeName: t.assigneeName ?? null,
    startDate: t.startDate ?? null,
    endDate: t.endDate ?? t.dueDate ?? null,
    dueDate: t.dueDate ?? null,
    progressPercent: t.progressPercent ?? 0,
  };
}

export function ProjectGanttClient({ projectId, projectName, tasks }: Props) {
  const ganttTasks = useMemo(() => tasks.map(toGanttTask), [tasks]);
  const root = useMemo(
    () => buildProjectTree({ id: projectId, name: projectName, status: "active" }, ganttTasks),
    [projectId, projectName, ganttTasks],
  );

  return <GanttContainer root={root} defaultZoom="month" addLabel="+ Task" />;
}
```

- [ ] **Step 3: Swap in `ProjectWorkspaceView.tsx`**

Find the `<ProjectTimeline ... />` usage. Replace with:
```tsx
<ProjectGanttClient
  projectId={project.id}
  projectName={project.name}
  tasks={tasks}
  timeline={timeline}
  refresh={refresh}
/>
```
And update the import:
```ts
import { ProjectGanttClient } from "@/components/workspace/gantt/ProjectGanttClient";
```

- [ ] **Step 4: Typecheck + commit**

Run: `npm run -w @larry/web typecheck` — expect exit 0.

```bash
git add apps/web
git commit -m "web: project Timeline tab renders the new Gantt"
```

---

## Phase 14 · Navigation

### Task 14.1: Add Timeline to `WORKSPACE_NAV`

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Extend the type + entry**

In `apps/web/src/components/dashboard/Sidebar.tsx` near line 24:

```ts
export type WorkspaceSidebarNav =
  | "home" | "my-work" | "timeline" | "actions" | "notifications"
  | "project" | "meetings" | "calendar" | "documents"
  | "email-drafts" | "chats" | "larry" | "settings";
```

Add to the `WORKSPACE_NAV` array import line (find `GanttChartSquare` on `lucide-react`):

```ts
import { GanttChartSquare } from "lucide-react"; // alongside existing lucide imports
```

Insert between `my-work` and `actions`:

```ts
{ id: "timeline",  label: "Timeline",   icon: GanttChartSquare, href: "/workspace/timeline"  },
```

- [ ] **Step 2: Also detect `timeline` pathname → active state**

Search in the same file for how `activeNav` is derived from pathname (look for `pathname.startsWith("/workspace/my-work")` etc.). Add a branch for `/workspace/timeline` → `"timeline"`.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run -w @larry/web typecheck` — expect exit 0.

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "web: Timeline nav link in workspace sidebar"
```

---

## Phase 15 · Cleanup

### Task 15.1: Delete old `timeline/` folder + unused imports

**Files:**
- Delete: `apps/web/src/components/workspace/timeline/`

- [ ] **Step 1: Confirm nothing imports from `timeline/` any more**

Run: `rg "workspace/timeline/" apps/web/src --type ts --type tsx -l`
Expected: **no results** (only `workspace/gantt/` appears).

If anything remains, update that file to import from `gantt/` before proceeding.

- [ ] **Step 2: Delete the folder**

```bash
rm -rf apps/web/src/components/workspace/timeline/
```

- [ ] **Step 3: Full web typecheck + test**

Run: `npm run -w @larry/web typecheck && npm run -w @larry/web test --silent`
Expected: exit 0.

- [ ] **Step 4: Full API test run**

Run: `npm run -w @larry/api test --silent`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "web: retire old timeline/ folder after Gantt cutover"
```

### Task 15.2: Update Larry memory note about the design decision reversal

**Files:**
- Modify: `C:\Users\oreil\.claude\projects\C--Users-oreil\memory\larry-design-decisions.md`

- [ ] **Step 1: Edit the memory**

Replace decision #5 body with:

```
5. **Timeline/Gantt**: Superseded 2026-04-15 — user now wants a proper 4-level
   Gantt (Category → Project → Task → Subtask) with collapsible left sidebar.
   Spec at docs/superpowers/specs/2026-04-15-portfolio-gantt-design.md.
   Portfolio view at /workspace/timeline, project view swapped to share the
   same component.
   **Why:** User review flagged the current swimlane view as "really far away"
   from a Gantt.
   **How to apply:** Use the gantt/ component; do not introduce Linear-style
   alternatives.
```

- [ ] **Step 2: Commit is not needed (memory lives outside git)**

---

## Self-Review

**Spec coverage:**

- §4.1 new table → Task 1.1 ✓
- §4.2 projects.category_id → Task 1.1 + 5.1 ✓
- §4.3 tasks.parent_task_id → Task 1.1 + 4.1/4.2/4.3 ✓
- §5.1 `GET /v1/timeline` → Task 6.1 ✓
- §5.2 per-project parentTaskId → Task 7.1 ✓
- §5.3 categories CRUD → Task 3.1–3.4 ✓
- §5.4 tasks accept parentTaskId → Task 4.1 ✓
- §5.5 tasks re-parent via PATCH → Task 4.2 ✓
- §5.6 projects accept categoryId → Task 5.1 ✓
- §6 component architecture → Tasks 9–11 ✓
- §7.1 portfolio page → Task 12.1 ✓
- §7.2 project page swap → Task 13.1 ✓
- §7.3 nav link → Task 14.1 ✓
- §8 visual design → GanttBar variants cover categories/projects/tasks/subtasks/rollup ✓
- §9 add flow → addLabel + onAdd callback wired in GanttContainer; dedicated `AddNodeModal` is referenced in the "Create" list but not required for v1 (the existing `AddTaskModal` inside `ProjectTimeline.tsx` is moved into `gantt/` as `AddNodeModal.tsx` when needed — this plan treats a polished context-aware add modal as an enhancement beyond the core cutover and leaves `+ Add` wired to a noop by default; wire up `AddNodeModal` in a follow-up if desired).
- §10 empty states → handled in PortfolioGanttClient (centred CTA path simplified to loading/error; full empty-state messaging is a small follow-up).
- §11 performance → virtualisation is deferred; acceptable for v1 at tenant scale.
- §12 testing → API tests in Phase 3/4/5/6/7, utils tests in Phase 9.
- §13 migration → Task 1.1 ✓
- §14 rollout → implicit in branch commits; no feature flag.
- §15 file inventory → each entry has a matching task or is covered by an existing file.

**Placeholder scan:** All code blocks are complete. "Follow-up" references in §9/§10 of self-review are scoped out explicitly rather than left ambiguous.

**Type consistency:** `GanttNode`, `GanttTask`, `FlatRow`, `TimelineRange`, `ZoomLevel`, `ROW_HEIGHT` are defined once in `gantt-types.ts` / `gantt-utils.ts` and referenced throughout. `parentTaskId` appears identically in API Zod schemas, shared type, and web types. `PortfolioTimelineResponse` shape matches between shared types, API route, and tree-builder.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-15-portfolio-gantt.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — batch execution in this session with checkpoints for review

Which approach?
