import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { projectRoutes } from "../src/routes/v1/projects.js";

// Mirror the audit-log mock pattern used in project-members-routes.test.ts
vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

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
    // Query sequence for POST /:
    // 1. INSERT INTO projects  → returns the new project row
    // 2. INSERT INTO project_memberships (createProjectOwnerMembership → upsertProjectMembership) → []
    // 3. INSERT INTO folders (auto-create root folder) → []
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/INSERT INTO projects/i.test(sql)) {
        return [{ id: "p1", tenantId: TENANT_ID, categoryId: CATEGORY_ID }];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "POST",
      url: "/projects",
      payload: { name: "Client A", categoryId: CATEGORY_ID },
    });
    await app.close();

    expect(res.statusCode).toBeLessThan(300);

    const insertCall = queryTenant.mock.calls.find(
      (c) => /INSERT INTO projects/i.test(c[1] as string)
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall?.[2]).toContain(CATEGORY_ID);
  });
});

describe("PATCH /projects/:id with categoryId", () => {
  it("accepts null to uncategorise", async () => {
    const queryTenant = vi.fn()
      // 1. SELECT project existence check
      .mockResolvedValueOnce([{ id: "11111111-1111-4111-8111-111111111111", tenantId: TENANT_ID, status: "active" }])
      // 2. UPDATE RETURNING
      .mockResolvedValueOnce([{ id: "11111111-1111-4111-8111-111111111111", categoryId: null }]);

    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH",
      url: "/projects/11111111-1111-4111-8111-111111111111",
      payload: { categoryId: null },
    });
    await app.close();

    expect(res.statusCode).toBeLessThan(300);
  });
});
