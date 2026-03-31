import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { meetingRoutes } from "../src/routes/v1/meetings.js";
import { projectRoutes } from "../src/routes/v1/projects.js";
import { taskRoutes } from "../src/routes/v1/tasks.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

async function createTestApp(db: Db) {
  const app = Fastify({ logger: false });

  app.decorate("db", db);
  app.decorate("config", { MODEL_PROVIDER: "mock" } as unknown as ApiEnv);
  app.decorate(
    "authenticate",
    async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
      (
        request as typeof request & {
          user: { tenantId: string; userId: string; role: "pm"; email: string };
        }
      ).user = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: "pm",
        email: "pm@example.com",
      };
    }
  );
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(projectRoutes, { prefix: "/projects" });
  await app.register(taskRoutes, { prefix: "/tasks" });
  await app.register(meetingRoutes);
  await app.ready();

  return app;
}

describe("Project archive lifecycle routes", () => {
  it("archives a project, updates status, and writes archive audit metadata", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id, CASE WHEN status = 'archived'")) {
        return [{ id: PROJECT_ID, status: "active" }];
      }
      if (sql.includes("UPDATE projects")) {
        return [];
      }
      return [];
    });

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/archive`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: PROJECT_ID, status: "archived" });
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("UPDATE projects"),
      [TENANT_ID, PROJECT_ID, "archived"]
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "project.archive",
        objectId: PROJECT_ID,
        details: expect.objectContaining({
          previousStatus: "active",
          newStatus: "archived",
          changed: true,
        }),
      })
    );
  }, 15_000);

  it("keeps archive requests idempotent when the project is already archived", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id, CASE WHEN status = 'archived'")) {
        return [{ id: PROJECT_ID, status: "archived" }];
      }
      if (sql.includes("UPDATE projects")) {
        throw new Error("Archive should not update an already archived project.");
      }
      return [];
    });

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/archive`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: PROJECT_ID, status: "archived" });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "project.archive",
        details: expect.objectContaining({
          previousStatus: "archived",
          newStatus: "archived",
          changed: false,
        }),
      })
    );
  });

  it("returns 404 when unarchiving a missing project", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/unarchive`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "Project not found." });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("applies the additive project status filter to project list reads", async () => {
    const queryTenant = vi.fn(async () => [
      {
        id: PROJECT_ID,
        name: "Archived project",
        description: null,
        ownerUserId: USER_ID,
        status: "archived",
        riskScore: 0,
        riskLevel: "low",
        startDate: null,
        targetDate: null,
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
    ]);

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/projects?status=archived",
    });

    expect(response.statusCode).toBe(200);
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("CASE WHEN projects.status = 'archived' THEN 'archived' ELSE 'active' END = $2"),
      [TENANT_ID, "archived"]
    );
    expect(response.json()).toMatchObject({
      items: [expect.objectContaining({ id: PROJECT_ID, status: "archived" })],
    });
  });

  it("filters cross-project task reads by project status without changing project-scoped reads", async () => {
    const queryTenant = vi.fn(async () => []);

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const globalResponse = await app.inject({
      method: "GET",
      url: "/tasks?projectStatus=active",
    });

    expect(globalResponse.statusCode).toBe(200);
    const [globalTenant, globalSql, globalValues] = queryTenant.mock.calls[0]!;
    expect(globalTenant).toBe(TENANT_ID);
    expect(String(globalSql)).toContain("JOIN projects");
    expect(String(globalSql)).toContain(
      "CASE WHEN projects.status = 'archived' THEN 'archived' ELSE 'active' END = $2"
    );
    expect(globalValues).toEqual([TENANT_ID, "active"]);

    queryTenant.mockClear();

    const scopedResponse = await app.inject({
      method: "GET",
      url: `/tasks?projectId=${PROJECT_ID}&projectStatus=archived`,
    });

    expect(scopedResponse.statusCode).toBe(200);
    const [, scopedSql, scopedValues] = queryTenant.mock.calls[0]!;
    expect(String(scopedSql)).not.toContain("JOIN projects");
    expect(String(scopedSql)).not.toContain("CASE WHEN projects.status = 'archived'");
    expect(scopedValues).toEqual([TENANT_ID, PROJECT_ID]);
  });

  it("filters cross-project meeting reads by project status without changing project-scoped reads", async () => {
    const queryTenant = vi.fn(async () => []);

    const app = await createTestApp({ queryTenant } as unknown as Db);
    appsToClose.push(app);

    const globalResponse = await app.inject({
      method: "GET",
      url: "/meetings?projectStatus=archived&limit=10",
    });

    expect(globalResponse.statusCode).toBe(200);
    const [globalTenant, globalSql, globalValues] = queryTenant.mock.calls[0]!;
    expect(globalTenant).toBe(TENANT_ID);
    expect(String(globalSql)).toContain("JOIN projects");
    expect(String(globalSql)).toContain(
      "CASE WHEN projects.status = 'archived' THEN 'archived' ELSE 'active' END = $3"
    );
    expect(globalValues).toEqual([TENANT_ID, 10, "archived"]);

    queryTenant.mockClear();

    const scopedResponse = await app.inject({
      method: "GET",
      url: `/meetings?projectId=${PROJECT_ID}&projectStatus=active&limit=10`,
    });

    expect(scopedResponse.statusCode).toBe(200);
    const [, scopedSql, scopedValues] = queryTenant.mock.calls[0]!;
    expect(String(scopedSql)).not.toContain("JOIN projects");
    expect(String(scopedSql)).not.toContain("CASE WHEN projects.status = 'archived'");
    expect(scopedValues).toEqual([TENANT_ID, 10, PROJECT_ID]);
  });
});
