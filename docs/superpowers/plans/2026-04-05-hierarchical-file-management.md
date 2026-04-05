# Hierarchical File Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat documents page with a Google Drive-style folder browser supporting nested folders (5 levels), auto-created project folders, drag-and-drop, and context menus.

**Architecture:** New `folders` table with parent_id self-reference. `folder_id` FK added to `documents` and `larry_documents`. Backend CRUD routes for folders + move endpoints. Frontend folder browser replaces flat table in DocumentsPageClient.

**Tech Stack:** PostgreSQL, Fastify (backend), Next.js App Router (frontend), Vitest (tests), Zod (validation), Lucide icons, framer-motion (animations)

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/db/src/schema.sql` — append folders table + migrations |
| Modify | `packages/db/src/seed.ts` — seed General folder + project root folders |
| Create | `apps/api/src/routes/v1/folders.ts` — backend CRUD routes |
| Modify | `apps/api/src/routes/v1/index.ts` — register folder routes |
| Modify | `apps/api/src/routes/v1/projects.ts:248-287` — auto-create folder on project create |
| Modify | `apps/api/src/routes/v1/documents.ts` — add folderId filter + accept folderId on create |
| Create | `apps/api/tests/folders-routes.test.ts` — backend tests |
| Create | `apps/web/src/app/api/workspace/folders/route.ts` — frontend proxy GET/POST |
| Create | `apps/web/src/app/api/workspace/folders/[id]/route.ts` — frontend proxy PATCH/DELETE |
| Create | `apps/web/src/app/api/workspace/folders/[id]/move/route.ts` — frontend proxy move |
| Create | `apps/web/src/app/api/workspace/documents/[id]/move/route.ts` — frontend proxy doc move |
| Modify | `apps/web/src/app/dashboard/types.ts` — add Folder type |
| Rewrite | `apps/web/src/app/workspace/documents/DocumentsPageClient.tsx` — folder browser |
| Create | `apps/web/src/app/workspace/documents/FolderBreadcrumb.tsx` — breadcrumb nav |
| Create | `apps/web/src/app/workspace/documents/FolderContextMenu.tsx` — right-click menu |
| Create | `apps/web/src/app/workspace/documents/MoveToModal.tsx` — folder picker modal |
| Modify | `apps/web/src/components/dashboard/Sidebar.tsx` — project click → folder nav |

---

### Task 1: Database Schema — folders table + migrations

**Files:**
- Modify: `packages/db/src/schema.sql` (append after line 1310)

- [ ] **Step 1: Add folders table to schema.sql**

Append to end of `packages/db/src/schema.sql`:

```sql
-- ── Phase 14: Folders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  folder_type TEXT NOT NULL DEFAULT 'general'
    CHECK (folder_type IN ('project', 'company', 'general')),
  depth INT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 4),
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_parent
  ON folders (tenant_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_folders_tenant_project
  ON folders (tenant_id, project_id);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_folders
    ON folders
    USING (tenant_id::text = current_setting('app.tenant_id', true));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 014: Add folder_id to documents and larry_documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE larry_documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents (tenant_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_larry_documents_folder ON larry_documents (tenant_id, folder_id);

-- 015: Backfill — create General folder per tenant (if missing)
INSERT INTO folders (tenant_id, name, folder_type, depth)
SELECT id, 'General', 'general', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM folders f WHERE f.tenant_id = t.id AND f.folder_type = 'general'
);

-- 016: Backfill — create root folder per project (if missing)
INSERT INTO folders (tenant_id, project_id, name, folder_type, depth)
SELECT p.tenant_id, p.id, p.name, 'project', 0
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM folders f WHERE f.tenant_id = p.tenant_id AND f.project_id = p.id AND f.parent_id IS NULL
);

-- 017: Backfill — move existing documents into their project's root folder
UPDATE documents d
SET folder_id = f.id
FROM folders f
WHERE d.folder_id IS NULL
  AND d.project_id IS NOT NULL
  AND f.project_id = d.project_id
  AND f.parent_id IS NULL
  AND f.tenant_id = d.tenant_id;

-- 018: Backfill — move orphan documents (no project) into General folder
UPDATE documents d
SET folder_id = f.id
FROM folders f
WHERE d.folder_id IS NULL
  AND d.project_id IS NULL
  AND f.folder_type = 'general'
  AND f.tenant_id = d.tenant_id;

-- 019: Backfill — move larry_documents into their project's root folder
UPDATE larry_documents d
SET folder_id = f.id
FROM folders f
WHERE d.folder_id IS NULL
  AND d.project_id IS NOT NULL
  AND f.project_id = d.project_id
  AND f.parent_id IS NULL
  AND f.tenant_id = d.tenant_id;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/schema.sql
git commit -m "feat(db): add folders table + backfill migrations for hierarchical file management"
```

---

### Task 2: Seed Data

**Files:**
- Modify: `packages/db/src/seed.ts`

- [ ] **Step 1: Add folder seed IDs and inserts to seed.ts**

After the existing project seed inserts, add:

```typescript
const GENERAL_FOLDER_ID = "ff000001-0001-4001-8001-000000000001";
const PROJECT_FOLDER_ID = "ff000001-0001-4001-8001-000000000002";
```

Then after project inserts, add folder seed SQL:

```sql
INSERT INTO folders (id, tenant_id, name, folder_type, depth)
VALUES ($generalFolderId, $tenantId, 'General', 'general', 0)
ON CONFLICT DO NOTHING;

INSERT INTO folders (id, tenant_id, project_id, name, folder_type, depth)
VALUES ($projectFolderId, $tenantId, $projectId, $projectName, 'project', 0)
ON CONFLICT DO NOTHING;
```

Pattern: follow the existing `ON CONFLICT DO NOTHING` style used for other seed data.

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/seed.ts
git commit -m "feat(db): seed General and project root folders"
```

---

### Task 3: Backend Folder Routes — CRUD

**Files:**
- Create: `apps/api/src/routes/v1/folders.ts`
- Modify: `apps/api/src/routes/v1/index.ts`

- [ ] **Step 1: Write failing test for GET /v1/folders**

Create `apps/api/tests/folders-routes.test.ts` following the exact pattern from `documents-routes.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { folderRoutes } from "../src/routes/v1/folders.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "ff000001-0001-4001-8001-000000000001";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

async function createTestApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate("authenticate", async (request: any) => {
    request.user = { tenantId: TENANT_ID, userId: USER_ID, role: "pm", email: "pm@example.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  await app.register(sensible);
  await app.register(folderRoutes, { prefix: "/folders" });
  await app.ready();
  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Folder routes", () => {
  it("lists root folders", async () => {
    const queryTenant = vi.fn(async () => [
      { id: FOLDER_ID, tenantId: TENANT_ID, projectId: null, parentId: null, name: "General", folderType: "general", depth: 0, sortOrder: 0, createdAt: "2026-04-05T00:00:00Z", updatedAt: "2026-04-05T00:00:00Z" },
    ]);
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "GET", url: "/folders" });
    expect(res.statusCode).toBe(200);
    expect(res.json().folders).toHaveLength(1);
    expect(res.json().folders[0].name).toBe("General");
  });

  it("lists subfolders by parentId", async () => {
    const queryTenant = vi.fn(async () => [
      { id: "sub-1", tenantId: TENANT_ID, projectId: null, parentId: FOLDER_ID, name: "Designs", folderType: "company", depth: 1, sortOrder: 0, createdAt: "2026-04-05T00:00:00Z", updatedAt: "2026-04-05T00:00:00Z" },
    ]);
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "GET", url: `/folders?parentId=${FOLDER_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().folders[0].parentId).toBe(FOLDER_ID);
  });

  it("creates a folder", async () => {
    const queryTenant = vi.fn(async (_t: string, sql: string) => {
      if (sql.includes("SELECT depth")) return [{ depth: 0 }];
      if (sql.includes("INSERT INTO folders")) return [{ id: "new-folder", tenantId: TENANT_ID, projectId: null, parentId: FOLDER_ID, name: "Reports", folderType: "company", depth: 1, sortOrder: 0, createdAt: "2026-04-05T00:00:00Z", updatedAt: "2026-04-05T00:00:00Z" }];
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "POST", url: "/folders", payload: { name: "Reports", parentId: FOLDER_ID, folderType: "company" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().folder.name).toBe("Reports");
  });

  it("rejects folder creation exceeding depth 4", async () => {
    const queryTenant = vi.fn(async (_t: string, sql: string) => {
      if (sql.includes("SELECT depth")) return [{ depth: 4 }];
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "POST", url: "/folders", payload: { name: "Too Deep", parentId: FOLDER_ID, folderType: "company" } });
    expect(res.statusCode).toBe(400);
  });

  it("renames a folder", async () => {
    const queryTenant = vi.fn(async (_t: string, sql: string) => {
      if (sql.includes("UPDATE folders")) return [{ id: FOLDER_ID, name: "Renamed" }];
      if (sql.includes("SELECT")) return [{ id: FOLDER_ID, folderType: "company" }];
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "PATCH", url: `/folders/${FOLDER_ID}`, payload: { name: "Renamed" } });
    expect(res.statusCode).toBe(200);
  });

  it("blocks deletion of general folder", async () => {
    const queryTenant = vi.fn(async () => [{ id: FOLDER_ID, folderType: "general", parentId: null }]);
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "DELETE", url: `/folders/${FOLDER_ID}` });
    expect(res.statusCode).toBe(403);
  });

  it("blocks deletion of project root folder", async () => {
    const queryTenant = vi.fn(async () => [{ id: FOLDER_ID, folderType: "project", parentId: null }]);
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const res = await app.inject({ method: "DELETE", url: `/folders/${FOLDER_ID}` });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests — expect fail (module not found)**

```bash
cd apps/api && npx vitest run tests/folders-routes.test.ts
```

Expected: FAIL — `Cannot find module '../src/routes/v1/folders.js'`

- [ ] **Step 3: Implement folders.ts**

Create `apps/api/src/routes/v1/folders.ts`:

```typescript
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { writeAuditLog } from "../../lib/audit.js";

const ListFoldersQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
});

const CreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().uuid().optional(),
  folderType: z.enum(["company", "general"]).default("company"),
  projectId: z.string().uuid().optional(),
});

const RenameFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const MoveFolderSchema = z.object({
  newParentId: z.string().uuid().nullable(),
});

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

type FolderRow = {
  id: string;
  tenantId: string;
  projectId: string | null;
  parentId: string | null;
  name: string;
  folderType: string;
  depth: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const folderRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/folders?parentId=
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const query = ListFoldersQuerySchema.parse(request.query ?? {});
      const tenantId = request.user.tenantId;

      let sql: string;
      let values: unknown[];

      if (query.parentId) {
        sql = `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                      parent_id AS "parentId", name, folder_type AS "folderType",
                      depth, sort_order AS "sortOrder",
                      created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM folders
                WHERE tenant_id = $1 AND parent_id = $2
                ORDER BY sort_order, name`;
        values = [tenantId, query.parentId];
      } else {
        sql = `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                      parent_id AS "parentId", name, folder_type AS "folderType",
                      depth, sort_order AS "sortOrder",
                      created_at AS "createdAt", updated_at AS "updatedAt"
                 FROM folders
                WHERE tenant_id = $1 AND parent_id IS NULL
                ORDER BY sort_order, name`;
        values = [tenantId];
      }

      const folders = await fastify.db.queryTenant<FolderRow>(tenantId, sql, values);
      return { folders };
    }
  );

  // GET /v1/folders/:id — single folder + breadcrumb ancestors
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                parent_id AS "parentId", name, folder_type AS "folderType",
                depth, sort_order AS "sortOrder",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );

      if (!rows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      // Build breadcrumb by walking parent chain (max 5 levels)
      const breadcrumb: { id: string; name: string }[] = [];
      let current: FolderRow | undefined = rows[0];
      const visited = new Set<string>();

      while (current) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        breadcrumb.unshift({ id: current.id, name: current.name });

        if (!current.parentId) break;
        const parentRows = await fastify.db.queryTenant<FolderRow>(
          tenantId,
          `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                  parent_id AS "parentId", name, folder_type AS "folderType",
                  depth, sort_order AS "sortOrder",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, current.parentId]
        );
        current = parentRows[0];
      }

      return { folder: rows[0], breadcrumb };
    }
  );

  // POST /v1/folders
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const body = CreateFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      let depth = 0;
      if (body.parentId) {
        const parentRows = await fastify.db.queryTenant<{ depth: number }>(
          tenantId,
          `SELECT depth FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, body.parentId]
        );
        if (!parentRows[0]) throw fastify.httpErrors.notFound("Parent folder not found.");
        depth = parentRows[0].depth + 1;
        if (depth > 4) {
          throw fastify.httpErrors.badRequest("Maximum folder nesting depth (5 levels) exceeded.");
        }
      }

      const rows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `INSERT INTO folders (tenant_id, project_id, parent_id, name, folder_type, depth, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tenant_id AS "tenantId", project_id AS "projectId",
                   parent_id AS "parentId", name, folder_type AS "folderType",
                   depth, sort_order AS "sortOrder",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [tenantId, body.projectId ?? null, body.parentId ?? null, body.name, body.folderType, depth, request.user.userId]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "folder.create",
        objectType: "folder",
        objectId: rows[0].id,
        details: { name: body.name, folderType: body.folderType, parentId: body.parentId ?? null },
      });

      return reply.code(201).send({ folder: rows[0] });
    }
  );

  // PATCH /v1/folders/:id — rename
  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = RenameFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      const existing = await fastify.db.queryTenant<{ id: string; folderType: string }>(
        tenantId,
        `SELECT id, folder_type AS "folderType" FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!existing[0]) throw fastify.httpErrors.notFound("Folder not found.");

      const rows = await fastify.db.queryTenant<{ id: string; name: string }>(
        tenantId,
        `UPDATE folders SET name = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2
         RETURNING id, name`,
        [tenantId, id, body.name]
      );

      return { folder: rows[0] };
    }
  );

  // PATCH /v1/folders/:id/move
  fastify.patch(
    "/:id/move",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = MoveFolderSchema.parse(request.body);
      const tenantId = request.user.tenantId;

      // Get the folder being moved
      const folderRows = await fastify.db.queryTenant<FolderRow>(
        tenantId,
        `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                parent_id AS "parentId", name, folder_type AS "folderType",
                depth, sort_order AS "sortOrder",
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!folderRows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      // Prevent moving project root or general folders
      if (folderRows[0].folderType === "general" || (folderRows[0].folderType === "project" && folderRows[0].parentId === null)) {
        throw fastify.httpErrors.forbidden("Cannot move root-level project or General folders.");
      }

      let newDepth = 0;
      if (body.newParentId) {
        // Prevent moving into self or descendant
        if (body.newParentId === id) {
          throw fastify.httpErrors.badRequest("Cannot move a folder into itself.");
        }

        const parentRows = await fastify.db.queryTenant<{ depth: number; id: string }>(
          tenantId,
          `SELECT depth, id FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
          [tenantId, body.newParentId]
        );
        if (!parentRows[0]) throw fastify.httpErrors.notFound("Target folder not found.");
        newDepth = parentRows[0].depth + 1;

        // Check max depth: get max descendant depth relative to this folder
        const descendantRows = await fastify.db.queryTenant<{ maxDepth: number }>(
          tenantId,
          `WITH RECURSIVE tree AS (
             SELECT id, depth FROM folders WHERE tenant_id = $1 AND id = $2
             UNION ALL
             SELECT f.id, f.depth FROM folders f JOIN tree t ON f.parent_id = t.id WHERE f.tenant_id = $1
           )
           SELECT COALESCE(MAX(depth) - MIN(depth), 0) AS "maxDepth" FROM tree`,
          [tenantId, id]
        );
        const subtreeHeight = descendantRows[0]?.maxDepth ?? 0;
        if (newDepth + subtreeHeight > 4) {
          throw fastify.httpErrors.badRequest("Moving this folder here would exceed the maximum nesting depth (5 levels).");
        }
      }

      // Calculate depth difference for recursive update
      const depthDiff = newDepth - folderRows[0].depth;

      // Update this folder and all descendants
      await fastify.db.queryTenant(
        tenantId,
        `WITH RECURSIVE tree AS (
           SELECT id FROM folders WHERE tenant_id = $1 AND id = $2
           UNION ALL
           SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id WHERE f.tenant_id = $1
         )
         UPDATE folders SET depth = depth + $3, updated_at = NOW()
         WHERE id IN (SELECT id FROM tree)`,
        [tenantId, id, depthDiff]
      );

      // Update parent pointer on the moved folder itself
      await fastify.db.queryTenant(
        tenantId,
        `UPDATE folders SET parent_id = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, body.newParentId]
      );

      return { ok: true };
    }
  );

  // DELETE /v1/folders/:id
  fastify.delete(
    "/:id",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const rows = await fastify.db.queryTenant<{ id: string; folderType: string; parentId: string | null }>(
        tenantId,
        `SELECT id, folder_type AS "folderType", parent_id AS "parentId"
           FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!rows[0]) throw fastify.httpErrors.notFound("Folder not found.");

      if (rows[0].folderType === "general") {
        throw fastify.httpErrors.forbidden("Cannot delete the General folder.");
      }
      if (rows[0].folderType === "project" && rows[0].parentId === null) {
        throw fastify.httpErrors.forbidden("Cannot delete a project root folder.");
      }

      // CASCADE handles children via FK. Documents get folder_id SET NULL.
      await fastify.db.queryTenant(
        tenantId,
        `DELETE FROM folders WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );

      await writeAuditLog(fastify.db, {
        tenantId,
        actorUserId: request.user.userId,
        actionType: "folder.delete",
        objectType: "folder",
        objectId: id,
        details: {},
      });

      return reply.code(204).send();
    }
  );

  // PATCH /v1/folders/:id/contents — list folder contents (subfolders + documents)
  fastify.get(
    "/:id/contents",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const tenantId = request.user.tenantId;

      const [subfolders, documents, larryDocs] = await Promise.all([
        fastify.db.queryTenant<FolderRow>(
          tenantId,
          `SELECT id, tenant_id AS "tenantId", project_id AS "projectId",
                  parent_id AS "parentId", name, folder_type AS "folderType",
                  depth, sort_order AS "sortOrder",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM folders WHERE tenant_id = $1 AND parent_id = $2
             ORDER BY sort_order, name`,
          [tenantId, id]
        ),
        fastify.db.queryTenant(
          tenantId,
          `SELECT id, project_id AS "projectId", title, doc_type AS "docType",
                  created_at AS "createdAt", updated_at AS "updatedAt"
             FROM documents WHERE tenant_id = $1 AND folder_id = $2
             ORDER BY updated_at DESC`,
          [tenantId, id]
        ),
        fastify.db.queryTenant(
          tenantId,
          `SELECT id, project_id AS "projectId", title, doc_type AS "docType",
                  state, created_at AS "createdAt", updated_at AS "updatedAt"
             FROM larry_documents WHERE tenant_id = $1 AND folder_id = $2
             ORDER BY updated_at DESC`,
          [tenantId, id]
        ),
      ]);

      return { subfolders, documents, larryDocuments: larryDocs };
    }
  );
};
```

- [ ] **Step 4: Register route in index.ts**

In `apps/api/src/routes/v1/index.ts`, add import and registration:

```typescript
import { folderRoutes } from "./folders.js";
```

Add registration line after the documentRoutes line:

```typescript
await fastify.register(folderRoutes, { prefix: "/folders" });
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd apps/api && npx vitest run tests/folders-routes.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/folders.ts apps/api/src/routes/v1/index.ts apps/api/tests/folders-routes.test.ts
git commit -m "feat(api): add folder CRUD routes with tests"
```

---

### Task 4: Auto-create Folder on Project Creation

**Files:**
- Modify: `apps/api/src/routes/v1/projects.ts:248-287`

- [ ] **Step 1: Add folder insert after project creation**

In `apps/api/src/routes/v1/projects.ts`, after line 275 (the `createProjectOwnerMembership` call) and before the audit log at line 277, add:

```typescript
      // Auto-create root folder for the new project
      await fastify.db.queryTenant(
        request.user.tenantId,
        `INSERT INTO folders (tenant_id, project_id, name, folder_type, depth, created_by_user_id)
         VALUES ($1, $2, $3, 'project', 0, $4)`,
        [request.user.tenantId, projectId, body.name, request.user.userId]
      );
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/v1/projects.ts
git commit -m "feat(api): auto-create root folder when project is created"
```

---

### Task 5: Modify Document Routes — folderId Support

**Files:**
- Modify: `apps/api/src/routes/v1/documents.ts`

- [ ] **Step 1: Add folderId to ListDocumentsQuerySchema**

In `documents.ts`, add to `ListDocumentsQuerySchema`:

```typescript
folderId: z.string().uuid().optional(),
```

- [ ] **Step 2: Add folderId filter to GET query**

In the GET handler, after the `docType` filter block (around line 179), add:

```typescript
      if (query.folderId) {
        values.push(query.folderId);
        sql += ` AND d.folder_id = $${values.length}`;
      }
```

- [ ] **Step 3: Add folderId to CreateDocumentSchema**

```typescript
folderId: z.string().uuid().optional(),
```

- [ ] **Step 4: Add folderId to INSERT in POST handler**

Update the INSERT statement to include `folder_id` column and pass `body.folderId ?? null` as a parameter.

- [ ] **Step 5: Add document move endpoint**

Append to the end of the `documentRoutes` function:

```typescript
  // PATCH /v1/documents/:id/move
  fastify.patch(
    "/:id/move",
    { preHandler: [fastify.authenticate, fastify.requireRole(["admin", "pm", "member"])] },
    async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.body);
      const tenantId = request.user.tenantId;

      const docRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM documents WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, id]
      );
      if (!docRows[0]) throw fastify.httpErrors.notFound("Document not found.");

      const folderRows = await fastify.db.queryTenant<{ id: string }>(
        tenantId,
        `SELECT id FROM folders WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, folderId]
      );
      if (!folderRows[0]) throw fastify.httpErrors.notFound("Target folder not found.");

      await fastify.db.queryTenant(
        tenantId,
        `UPDATE documents SET folder_id = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, folderId]
      );

      return { ok: true };
    }
  );
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/documents.ts
git commit -m "feat(api): add folderId support to document routes + move endpoint"
```

---

### Task 6: Frontend API Proxy Routes for Folders

**Files:**
- Create: `apps/web/src/app/api/workspace/folders/route.ts`
- Create: `apps/web/src/app/api/workspace/folders/[id]/route.ts`
- Create: `apps/web/src/app/api/workspace/folders/[id]/move/route.ts`
- Create: `apps/web/src/app/api/workspace/folders/[id]/contents/route.ts`
- Create: `apps/web/src/app/api/workspace/documents/[id]/move/route.ts`

- [ ] **Step 1: Create GET/POST proxy for /api/workspace/folders**

Create `apps/web/src/app/api/workspace/folders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parentId = request.nextUrl.searchParams.get("parentId");
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";

  const result = await proxyApiRequest(session, `/v1/folders${qs}`);
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const result = await proxyApiRequest(session, "/v1/folders", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Create PATCH/DELETE proxy for /api/workspace/folders/[id]**

Create `apps/web/src/app/api/workspace/folders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await proxyApiRequest(session, `/v1/folders/${id}`);
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const result = await proxyApiRequest(session, `/v1/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await proxyApiRequest(session, `/v1/folders/${id}`, { method: "DELETE" });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Create move proxy for folders**

Create `apps/web/src/app/api/workspace/folders/[id]/move/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const result = await proxyApiRequest(session, `/v1/folders/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Create contents proxy**

Create `apps/web/src/app/api/workspace/folders/[id]/contents/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await proxyApiRequest(session, `/v1/folders/${id}/contents`);
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 5: Create document move proxy**

Create `apps/web/src/app/api/workspace/documents/[id]/move/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { persistSession, proxyApiRequest } from "@/lib/workspace-proxy";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  const result = await proxyApiRequest(session, `/v1/documents/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (result.session) await persistSession(result.session);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/workspace/folders/ apps/web/src/app/api/workspace/documents/\[id\]/move/
git commit -m "feat(web): add frontend proxy routes for folders and document move"
```

---

### Task 7: TypeScript Types

**Files:**
- Modify: `apps/web/src/app/dashboard/types.ts`

- [ ] **Step 1: Add Folder interface**

Append to `apps/web/src/app/dashboard/types.ts`:

```typescript
export interface Folder {
  id: string;
  tenantId: string;
  projectId: string | null;
  parentId: string | null;
  name: string;
  folderType: "project" | "company" | "general";
  depth: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderBreadcrumbItem {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/types.ts
git commit -m "feat(types): add Folder and FolderBreadcrumbItem interfaces"
```

---

### Task 8: Frontend — FolderBreadcrumb Component

**Files:**
- Create: `apps/web/src/app/workspace/documents/FolderBreadcrumb.tsx`

- [ ] **Step 1: Create breadcrumb component**

```tsx
"use client";

import { ChevronRight, FolderOpen } from "lucide-react";
import type { FolderBreadcrumbItem } from "@/app/dashboard/types";

interface FolderBreadcrumbProps {
  items: FolderBreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ items, onNavigate }: FolderBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-[13px] mb-3" aria-label="Folder breadcrumb">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: items.length === 0 ? "var(--text-1)" : "var(--text-muted)", fontWeight: items.length === 0 ? 600 : 400 }}
      >
        <FolderOpen size={14} />
        Documents
      </button>

      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.id} className="flex items-center gap-1">
            <ChevronRight size={12} style={{ color: "var(--text-disabled)" }} />
            <button
              onClick={() => onNavigate(item.id)}
              className="px-1.5 py-0.5 rounded-md transition-colors hover:bg-[var(--surface-2)]"
              style={{ color: isLast ? "var(--text-1)" : "var(--text-muted)", fontWeight: isLast ? 600 : 400 }}
            >
              {item.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/documents/FolderBreadcrumb.tsx
git commit -m "feat(ui): add FolderBreadcrumb component"
```

---

### Task 9: Frontend — FolderContextMenu Component

**Files:**
- Create: `apps/web/src/app/workspace/documents/FolderContextMenu.tsx`

- [ ] **Step 1: Create context menu component**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { FolderOpen, Pencil, Move, Trash2 } from "lucide-react";

interface ContextMenuAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
}

interface FolderContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function FolderContextMenu({ x, y, actions, onClose }: FolderContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 rounded-lg shadow-lg"
      style={{
        left: x,
        top: y,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      }}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => { action.onClick(); onClose(); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: action.danger ? "#dc2626" : "var(--text-2)" }}
        >
          <action.icon size={14} />
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function buildFolderActions(opts: {
  onOpen: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onDelete?: () => void;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: "Open", icon: FolderOpen, onClick: opts.onOpen },
    { label: "Rename", icon: Pencil, onClick: opts.onRename },
    { label: "Move to…", icon: Move, onClick: opts.onMoveTo },
  ];
  if (opts.onDelete) {
    actions.push({ label: "Delete", icon: Trash2, onClick: opts.onDelete, danger: true });
  }
  return actions;
}

export function buildDocumentActions(opts: {
  onOpen: () => void;
  onMoveTo: () => void;
  onDelete?: () => void;
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [
    { label: "Open", icon: FolderOpen, onClick: opts.onOpen },
    { label: "Move to…", icon: Move, onClick: opts.onMoveTo },
  ];
  if (opts.onDelete) {
    actions.push({ label: "Delete", icon: Trash2, onClick: opts.onDelete, danger: true });
  }
  return actions;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/documents/FolderContextMenu.tsx
git commit -m "feat(ui): add FolderContextMenu with builder helpers"
```

---

### Task 10: Frontend — MoveToModal Component

**Files:**
- Create: `apps/web/src/app/workspace/documents/MoveToModal.tsx`

- [ ] **Step 1: Create move-to modal with folder tree picker**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, Loader2, X } from "lucide-react";
import type { Folder as FolderType } from "@/app/dashboard/types";

interface MoveToModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (targetFolderId: string) => void;
  excludeId?: string; // prevent moving into self
  title?: string;
}

interface TreeNode {
  folder: FolderType;
  children: TreeNode[] | null; // null = not loaded
  expanded: boolean;
}

export function MoveToModal({ open, onClose, onConfirm, excludeId, title = "Move to…" }: MoveToModalProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const loadChildren = useCallback(async (parentId: string | null): Promise<FolderType[]> => {
    const qs = parentId ? `?parentId=${parentId}` : "";
    const res = await fetch(`/api/workspace/folders${qs}`, { cache: "no-store" });
    const data = await res.json();
    return (data.folders ?? []) as FolderType[];
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    loadChildren(null)
      .then((folders) => {
        setRoots(
          folders
            .filter((f) => f.id !== excludeId)
            .map((f) => ({ folder: f, children: null, expanded: false }))
        );
      })
      .finally(() => setLoading(false));
  }, [open, loadChildren, excludeId]);

  const toggleExpand = useCallback(async (node: TreeNode) => {
    if (node.expanded) {
      node.expanded = false;
      setRoots((r) => [...r]);
      return;
    }
    if (node.children === null) {
      const children = await loadChildren(node.folder.id);
      node.children = children
        .filter((f) => f.id !== excludeId)
        .map((f) => ({ folder: f, children: null, expanded: false }));
    }
    node.expanded = true;
    setRoots((r) => [...r]);
  }, [loadChildren, excludeId]);

  function renderTree(nodes: TreeNode[], indent: number) {
    return nodes.map((node) => (
      <div key={node.folder.id}>
        <button
          onClick={() => setSelected(node.folder.id)}
          onDoubleClick={() => toggleExpand(node)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors"
          style={{
            paddingLeft: `${12 + indent * 16}px`,
            background: selected === node.folder.id ? "rgba(108,68,246,0.08)" : undefined,
            color: selected === node.folder.id ? "#6c44f6" : "var(--text-2)",
            fontWeight: selected === node.folder.id ? 600 : 400,
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(node); }}
            className="shrink-0 w-4 h-4 flex items-center justify-center"
          >
            <ChevronRight
              size={12}
              style={{
                transform: node.expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                color: "var(--text-disabled)",
              }}
            />
          </button>
          <Folder size={14} style={{ color: selected === node.folder.id ? "#6c44f6" : "var(--text-muted)" }} />
          <span className="truncate">{node.folder.name}</span>
        </button>
        {node.expanded && node.children && renderTree(node.children, indent + 1)}
      </div>
    ));
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-[400px] max-h-[480px] flex flex-col rounded-xl shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>{title}</h3>
            <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-muted)" }} />
              </div>
            ) : roots.length === 0 ? (
              <p className="text-center py-8 text-[13px]" style={{ color: "var(--text-muted)" }}>No folders found</p>
            ) : (
              renderTree(roots, 0)
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={onClose} className="pm-btn pm-btn-sm" style={{ color: "var(--text-2)" }}>Cancel</button>
            <button
              onClick={() => selected && onConfirm(selected)}
              disabled={!selected}
              className="pm-btn pm-btn-primary pm-btn-sm"
              style={{ opacity: selected ? 1 : 0.5 }}
            >
              Move here
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/documents/MoveToModal.tsx
git commit -m "feat(ui): add MoveToModal with lazy-loading folder tree"
```

---

### Task 11: Frontend — Rewrite DocumentsPageClient as Folder Browser

**Files:**
- Rewrite: `apps/web/src/app/workspace/documents/DocumentsPageClient.tsx`

- [ ] **Step 1: Rewrite DocumentsPageClient.tsx**

Replace the full file content with the folder browser. This is the largest task. Key structure:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText, Folder, FolderPlus, Mail, MoreHorizontal,
  Search, Upload, GripVertical,
} from "lucide-react";
import type { Folder as FolderType, FolderBreadcrumbItem, LarryDocument } from "@/app/dashboard/types";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { FolderContextMenu, buildFolderActions, buildDocumentActions } from "./FolderContextMenu";
import { MoveToModal } from "./MoveToModal";
import { MeetingDetailDrawer, type MeetingDetail } from "./MeetingDetailDrawer";

interface DocumentRow {
  id: string;
  projectId: string | null;
  title: string;
  docType: string;
  createdAt: string;
  updatedAt: string;
  isLarryDoc?: boolean;
}

const FOLDER_TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  project: { label: "Project", color: "#6c44f6", bg: "rgba(108,68,246,0.08)" },
  company: { label: "Company", color: "var(--text-muted)", bg: "var(--surface-2)" },
  general: { label: "General", color: "var(--text-muted)", bg: "var(--surface-2)" },
};

export function DocumentsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFolderId = searchParams.get("folderId") ?? null;

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
  const [breadcrumb, setBreadcrumb] = useState<FolderBreadcrumbItem[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; actions: any[] } | null>(null);

  // Move modal state
  const [moveModal, setMoveModal] = useState<{ open: boolean; itemId: string; itemType: "folder" | "document" }>({ open: false, itemId: "", itemType: "folder" });

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // New folder state
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Drag state
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Fetch folder contents
  const loadContents = useCallback(async (folderId: string | null) => {
    setLoading(true);
    try {
      if (folderId) {
        const [contentsRes, folderRes] = await Promise.all([
          fetch(`/api/workspace/folders/${folderId}/contents`, { cache: "no-store" }),
          fetch(`/api/workspace/folders/${folderId}`, { cache: "no-store" }),
        ]);
        const contents = await contentsRes.json();
        const folderData = await folderRes.json();

        setFolders(contents.subfolders ?? []);
        const docs: DocumentRow[] = [
          ...(contents.documents ?? []).map((d: any) => ({ ...d, isLarryDoc: false })),
          ...(contents.larryDocuments ?? []).map((d: any) => ({ ...d, isLarryDoc: true })),
        ];
        setDocuments(docs);
        setBreadcrumb(folderData.breadcrumb ?? []);
      } else {
        const res = await fetch("/api/workspace/folders", { cache: "no-store" });
        const data = await res.json();
        setFolders(data.folders ?? []);
        setDocuments([]);
        setBreadcrumb([]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContents(currentFolderId);
  }, [currentFolderId, loadContents]);

  // Sync URL with folder state
  useEffect(() => {
    const url = currentFolderId
      ? `/workspace/documents?folderId=${currentFolderId}`
      : "/workspace/documents";
    router.replace(url, { scroll: false });
  }, [currentFolderId, router]);

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearch("");
  }, []);

  // Double-click to enter folder
  const handleFolderDoubleClick = useCallback((folderId: string) => {
    navigateToFolder(folderId);
  }, [navigateToFolder]);

  // Right-click context menu
  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folder: FolderType) => {
    e.preventDefault();
    const isProtected = folder.folderType === "general" || (folder.folderType === "project" && folder.parentId === null);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      actions: buildFolderActions({
        onOpen: () => navigateToFolder(folder.id),
        onRename: () => { setRenamingId(folder.id); setRenameValue(folder.name); },
        onMoveTo: () => setMoveModal({ open: true, itemId: folder.id, itemType: "folder" }),
        onDelete: isProtected ? undefined : () => handleDeleteFolder(folder.id),
      }),
    });
  }, [navigateToFolder]);

  const handleDocContextMenu = useCallback((e: React.MouseEvent, doc: DocumentRow) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      actions: buildDocumentActions({
        onOpen: () => { /* open doc detail */ },
        onMoveTo: () => setMoveModal({ open: true, itemId: doc.id, itemType: "document" }),
      }),
    });
  }, []);

  // Rename handler
  const handleRenameSubmit = useCallback(async (folderId: string) => {
    if (!renameValue.trim()) return;
    await fetch(`/api/workspace/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenamingId(null);
    loadContents(currentFolderId);
  }, [renameValue, currentFolderId, loadContents]);

  // Delete handler
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    await fetch(`/api/workspace/folders/${folderId}`, { method: "DELETE" });
    loadContents(currentFolderId);
  }, [currentFolderId, loadContents]);

  // Move handler
  const handleMoveConfirm = useCallback(async (targetFolderId: string) => {
    if (moveModal.itemType === "folder") {
      await fetch(`/api/workspace/folders/${moveModal.itemId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newParentId: targetFolderId }),
      });
    } else {
      await fetch(`/api/workspace/documents/${moveModal.itemId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
    }
    setMoveModal({ open: false, itemId: "", itemType: "folder" });
    loadContents(currentFolderId);
  }, [moveModal, currentFolderId, loadContents]);

  // Create folder handler
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    await fetch("/api/workspace/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName.trim(),
        parentId: currentFolderId ?? undefined,
        folderType: "company",
      }),
    });
    setCreatingFolder(false);
    setNewFolderName("");
    loadContents(currentFolderId);
  }, [newFolderName, currentFolderId, loadContents]);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, id: string, type: "folder" | "document") => {
    e.dataTransfer.setData("application/json", JSON.stringify({ id, type }));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(folderId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.id === targetFolderId) return;

      if (data.type === "folder") {
        await fetch(`/api/workspace/folders/${data.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newParentId: targetFolderId }),
        });
      } else {
        await fetch(`/api/workspace/documents/${data.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      }
      loadContents(currentFolderId);
    } catch { /* ignore bad drag data */ }
  }, [currentFolderId, loadContents]);

  // Filter by search
  const filteredFolders = search.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : folders;
  const filteredDocs = search.trim()
    ? documents.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    : documents;

  return (
    <div style={{ minHeight: "100%", overflowY: "auto", background: "var(--page-bg)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <h1 className="text-h1">Documents</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName(""); }}
            className="pm-btn pm-btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--text-2)" }}
          >
            <FolderPlus size={13} />
            New folder
          </button>
          <button
            className="pm-btn pm-btn-primary pm-btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <Upload size={13} />
            Upload
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <FolderBreadcrumb items={breadcrumb} onNavigate={navigateToFolder} />

      {/* Search */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px", height: "36px",
            padding: "0 10px", borderRadius: "var(--radius-btn)",
            border: "1px solid var(--border)", background: "var(--surface-2)",
            flex: "1 1 200px", maxWidth: "320px",
          }}
        >
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            placeholder="Search in this folder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: "13px", color: "var(--text-1)" }}
          />
        </div>
      </div>

      {/* New folder inline input */}
      {creatingFolder && (
        <div
          className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
          style={{ border: "1px solid #6c44f6", background: "rgba(108,68,246,0.04)" }}
        >
          <Folder size={16} style={{ color: "#6c44f6" }} />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
            placeholder="Folder name…"
            className="flex-1 text-[13px] outline-none"
            style={{ background: "none", border: "none", color: "var(--text-1)" }}
          />
          <button onClick={handleCreateFolder} className="pm-btn pm-btn-primary pm-btn-sm" style={{ padding: "2px 10px", fontSize: "12px" }}>Create</button>
          <button onClick={() => setCreatingFolder(false)} className="text-[12px]" style={{ color: "var(--text-muted)" }}>Cancel</button>
        </div>
      )}

      {/* Content area */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="pm-table-row" style={{ gridTemplateColumns: "minmax(0,1fr) 100px 100px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="pm-shimmer" style={{ height: "28px", width: "28px", borderRadius: "6px" }} />
                  <div className="pm-shimmer" style={{ height: "14px", width: "180px", borderRadius: "4px" }} />
                </span>
                <div className="pm-shimmer" style={{ height: "18px", width: "60px", borderRadius: "var(--radius-badge)" }} />
                <div className="pm-shimmer" style={{ height: "13px", width: "50px", borderRadius: "4px" }} />
              </div>
            ))}
          </div>
        ) : filteredFolders.length === 0 && filteredDocs.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <div
              style={{
                margin: "0 auto 12px", display: "flex", height: "48px", width: "48px",
                alignItems: "center", justifyContent: "center",
                borderRadius: "var(--radius-card)", background: "var(--surface-2)",
              }}
            >
              <Folder size={20} style={{ color: "var(--text-muted)" }} />
            </div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--text-1)", marginBottom: "6px" }}>
              {currentFolderId ? "This folder is empty" : "No folders yet"}
            </p>
            <p className="text-body-sm">
              {currentFolderId ? "Upload a file or create a subfolder." : "Create a project or folder to get started."}
            </p>
          </div>
        ) : (
          <>
            {/* Folders */}
            {filteredFolders.map((folder) => {
              const badge = FOLDER_TYPE_BADGE[folder.folderType] ?? FOLDER_TYPE_BADGE.company;
              const isDragOver = dragOverId === folder.id;
              return (
                <div
                  key={folder.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, folder.id, "folder")}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  onDoubleClick={() => handleFolderDoubleClick(folder.id)}
                  onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                  className="pm-table-row"
                  style={{
                    gridTemplateColumns: "minmax(0,1fr) 100px 100px",
                    cursor: "pointer",
                    border: isDragOver ? "2px solid #6c44f6" : "2px solid transparent",
                    borderRadius: isDragOver ? "8px" : undefined,
                    transition: "border-color 0.15s",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    <div
                      style={{
                        flexShrink: 0, display: "flex", height: "28px", width: "28px",
                        alignItems: "center", justifyContent: "center",
                        borderRadius: "6px", background: "var(--surface-2)",
                      }}
                    >
                      <Folder size={14} style={{ color: "#6c44f6" }} />
                    </div>
                    {renamingId === folder.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(folder.id); if (e.key === "Escape") setRenamingId(null); }}
                        onBlur={() => handleRenameSubmit(folder.id)}
                        className="text-[13px] font-medium outline-none px-1 py-0.5 rounded"
                        style={{ border: "1px solid #6c44f6", color: "var(--text-1)", background: "var(--surface)" }}
                      />
                    ) : (
                      <span className="text-h3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {folder.name}
                      </span>
                    )}
                  </span>
                  <span>
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "3px",
                        fontSize: "11px", fontWeight: 600,
                        color: badge.color, background: badge.bg,
                        borderRadius: "var(--radius-badge)", padding: "2px 7px",
                      }}
                    >
                      {badge.label}
                    </span>
                  </span>
                  <span className="text-body-sm">
                    {new Date(folder.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            })}

            {/* Documents */}
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                draggable
                onDragStart={(e) => handleDragStart(e, doc.id, "document")}
                onContextMenu={(e) => handleDocContextMenu(e, doc)}
                className="pm-table-row"
                style={{ gridTemplateColumns: "minmax(0,1fr) 100px 100px", cursor: "default" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <div
                    style={{
                      flexShrink: 0, display: "flex", height: "28px", width: "28px",
                      alignItems: "center", justifyContent: "center",
                      borderRadius: "6px", background: "var(--surface-2)",
                    }}
                  >
                    {doc.isLarryDoc ? <Mail size={13} style={{ color: "var(--text-muted)" }} /> : <FileText size={13} style={{ color: "var(--text-muted)" }} />}
                  </div>
                  <span className="text-h3" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.title}
                  </span>
                </span>
                <span>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "3px",
                      fontSize: "11px", fontWeight: 600,
                      color: "var(--text-2)", background: "var(--surface-2)",
                      borderRadius: "var(--radius-badge)", padding: "2px 7px",
                    }}
                  >
                    {doc.docType}
                  </span>
                </span>
                <span className="text-body-sm">
                  {new Date(doc.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FolderContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Move modal */}
      <MoveToModal
        open={moveModal.open}
        onClose={() => setMoveModal({ open: false, itemId: "", itemType: "folder" })}
        onConfirm={handleMoveConfirm}
        excludeId={moveModal.itemType === "folder" ? moveModal.itemId : undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/workspace/documents/DocumentsPageClient.tsx
git commit -m "feat(ui): rewrite DocumentsPageClient as Google Drive-style folder browser"
```

---

### Task 12: Sidebar — Project Click Navigates to Project Folder

**Files:**
- Modify: `apps/web/src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Update project links in sidebar**

In `Sidebar.tsx`, the project links currently go to `/workspace/projects/${project.id}`. We need to add a "Files" action. The simplest approach: when clicking the Documents nav item, it goes to `/workspace/documents`. When clicking a project in the sidebar, it still goes to the project workspace. But we add a utility: each project card in the sidebar gets a folder icon that navigates to its folder.

Actually, per the design: clicking a project in the sidebar should navigate to the project workspace as before. The documents page is the folder browser. To connect them: add a small file icon next to each project in the sidebar that links to `/workspace/documents?folderId=PROJECT_ROOT_FOLDER_ID`.

The simplest approach: fetch root folder IDs for all projects once, then use them in the sidebar. Add a data attribute or pre-fetched map.

In `WorkspaceSidebarInner`, after the existing `projects` state management, add a state for project folder IDs:

```typescript
const [projectFolderIds, setProjectFolderIds] = useState<Record<string, string>>({});

useEffect(() => {
  fetch("/api/workspace/folders", { cache: "no-store" })
    .then((r) => r.json())
    .then((data: { folders?: { id: string; projectId: string | null; folderType: string }[] }) => {
      const map: Record<string, string> = {};
      for (const f of data.folders ?? []) {
        if (f.projectId && f.folderType === "project") map[f.projectId] = f.id;
      }
      setProjectFolderIds(map);
    })
    .catch(() => {});
}, []);
```

Then in the project list items (both favourites and all-projects sections), add a folder icon button next to the star button:

```tsx
{projectFolderIds[project.id] && (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      router.push(`/workspace/documents?folderId=${projectFolderIds[project.id]}`);
    }}
    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
    title="Open project files"
    style={{ color: "var(--text-disabled)" }}
  >
    <FileText size={12} />
  </button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/Sidebar.tsx
git commit -m "feat(ui): add project folder quick-link in sidebar"
```

---

### Task 13: Run Full Test Suite + Build Check

- [ ] **Step 1: Run API tests**

```bash
cd apps/api && npx vitest run
```

Expected: All tests pass including new `folders-routes.test.ts`.

- [ ] **Step 2: Run frontend build**

```bash
cd apps/web && npx next build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Fix any type or build errors**

Address any issues found in steps 1-2.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A && git commit -m "fix: resolve build/test issues from folder management feature"
```

---

### Task 14: CI Integration Test — End-to-End Verification

- [ ] **Step 1: Run the schema against a local DB (if available)**

```bash
cd packages/db && npx tsx src/migrate.ts
```

Or if using a different migration runner, use the project's standard approach. Verify the folders table is created and backfill queries succeed.

- [ ] **Step 2: Run seed**

```bash
cd packages/db && npx tsx src/seed.ts
```

Verify General folder and project root folders are seeded.

- [ ] **Step 3: Start dev server and manually verify**

```bash
npm run dev
```

Open browser → /workspace/documents → verify:
1. Root view shows General folder + project folders
2. Double-click enters a folder
3. Breadcrumb navigation works
4. Right-click shows context menu
5. "New folder" creates a subfolder
6. Drag a document onto a folder moves it

- [ ] **Step 4: Final commit if needed**

```bash
git add -A && git commit -m "test: verify hierarchical file management end-to-end"
```
