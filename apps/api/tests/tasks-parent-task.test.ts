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
      // project status lookup (writable) — used by loadProjectWriteState
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
