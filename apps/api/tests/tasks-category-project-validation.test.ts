import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { taskRoutes } from "../src/routes/v1/tasks.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

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

describe("PATCH /tasks/:id cross-project categoryId validation", () => {
  it("rejects a categoryId whose owning project differs from the task's project", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // categoryId owning-project resolution → returns OTHER_PROJECT_ID (different)
      .mockResolvedValueOnce([{ projectId: OTHER_PROJECT_ID }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { categoryId: CATEGORY_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code ?? body.error?.code).toBe("CATEGORY_PROJECT_MISMATCH");
    expect(body.expectedProjectId ?? body.error?.expectedProjectId).toBe(PROJECT_ID);
    expect(body.gotProjectId ?? body.error?.gotProjectId).toBe(OTHER_PROJECT_ID);
  });

  it("accepts a categoryId whose owning project matches the task's project", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // categoryId owning-project resolution → matches
      .mockResolvedValueOnce([{ projectId: PROJECT_ID }])
      // UPDATE returning
      .mockResolvedValueOnce([{ parentTaskId: null }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { categoryId: CATEGORY_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("accepts categoryId: null (Uncategorised) without running the mismatch check", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // UPDATE returning — no category lookup query in between
      .mockResolvedValueOnce([{ parentTaskId: null }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { categoryId: null },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    // Critical: categoryId=null must NOT trigger the lookup query.
    const calls = queryTenant.mock.calls.map((c) => String(c[1]));
    const lookupCalls = calls.filter((sql) => /project_categories/i.test(sql));
    expect(lookupCalls).toHaveLength(0);
  });

  it("rejects categoryId that does not resolve to any row (unknown category)", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // categoryId owning-project resolution → empty (category missing)
      .mockResolvedValueOnce([]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { categoryId: CATEGORY_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code ?? body.error?.code).toBe("CATEGORY_PROJECT_MISMATCH");
  });

  it("allows an org-scoped category (root has project_id = null) regardless of task project", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // categoryId owning-project resolution → project_id is null (org-scoped)
      .mockResolvedValueOnce([{ projectId: null }])
      // UPDATE returning
      .mockResolvedValueOnce([{ parentTaskId: null }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { categoryId: CATEGORY_ID },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
  });

  it("skips categoryId validation entirely when categoryId is not in the PATCH body", async () => {
    const queryTenant = vi.fn()
      // project-write-state lookup (writable)
      .mockResolvedValueOnce([{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "active" }])
      // UPDATE returning — no category lookup
      .mockResolvedValueOnce([{ parentTaskId: null }]);
    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "PATCH", url: `/tasks/${TASK_ID}`,
      payload: { title: "rename only" },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    const calls = queryTenant.mock.calls.map((c) => String(c[1]));
    const lookupCalls = calls.filter((sql) => /project_categories/i.test(sql));
    expect(lookupCalls).toHaveLength(0);
  });
});
