import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { projectRoutes } from "../src/routes/v1/projects.js";
import { taskRoutes } from "../src/routes/v1/tasks.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

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
  await app.ready();

  return app;
}

describe("Workspace cutover contracts", () => {
  it("GET /projects returns the scoped project list", async () => {
    const db = {
      queryTenant: vi.fn(async (_tenantId: string, sql: string) => {
        if (sql.includes("FROM projects")) {
          return [
            {
              id: PROJECT_ID,
              name: "Alpha Launch",
              description: "Scoped workspace project",
              ownerUserId: USER_ID,
              status: "active",
              riskScore: 18,
              riskLevel: "low",
              startDate: null,
              targetDate: "2026-04-10",
              createdAt: "2026-03-30T00:00:00.000Z",
              updatedAt: "2026-03-30T00:00:00.000Z",
            },
          ];
        }
        return [];
      }),
    } as unknown as Db;

    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({ method: "GET", url: "/projects" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        expect.objectContaining({
          id: PROJECT_ID,
          name: "Alpha Launch",
        }),
      ],
    });
    expect(db.queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("FROM projects"),
      [TENANT_ID]
    );
  });

  it("POST /projects creates a project for manual intake", async () => {
    const db = {
      queryTenant: vi.fn(async (_tenantId: string, sql: string) => {
        if (sql.includes("INSERT INTO projects")) {
          return [{ id: PROJECT_ID }];
        }
        return [];
      }),
    } as unknown as Db;

    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        name: "Phase 1 Intake",
        description: "Manual intake path",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: PROJECT_ID });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "project.create",
        objectId: PROJECT_ID,
      })
    );
  });

  it("GET /projects/:id/timeline returns the scoped timeline read model", async () => {
    const db = {
      queryTenant: vi.fn(async (_tenantId: string, sql: string) => {
        if (sql.includes("FROM projects")) {
          return [{ id: PROJECT_ID, status: "active" }];
        }

        if (sql.includes("FROM project_memberships")) {
          return [{ role: "owner" }];
        }

        if (sql.includes("FROM task_dependencies")) {
          return [
            {
              taskId: "55555555-5555-4555-8555-555555555555",
              dependsOnTaskId: TASK_ID,
              relation: "finish_to_start",
            },
          ];
        }

        if (sql.includes("FROM tasks")) {
          return [
            {
              id: TASK_ID,
              title: "Draft rollout note",
              status: "not_started",
              priority: "medium",
              assigneeUserId: USER_ID,
              progressPercent: 0,
              startDate: "2026-03-25",
              dueDate: "2026-04-02",
              riskLevel: "low",
            },
            {
              id: "55555555-5555-4555-8555-555555555555",
              title: "Review legal feedback",
              status: "blocked",
              priority: "high",
              assigneeUserId: null,
              progressPercent: 20,
              startDate: "2026-04-01",
              dueDate: "2026-04-05",
              riskLevel: "high",
            },
          ];
        }

        return [];
      }),
    } as unknown as Db;

    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/timeline`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toMatchObject({
      projectId: PROJECT_ID,
      gantt: expect.arrayContaining([
        expect.objectContaining({ id: TASK_ID, status: "not_started" }),
        expect.objectContaining({ id: "55555555-5555-4555-8555-555555555555", status: "blocked" }),
      ]),
      dependencies: [
        expect.objectContaining({
          taskId: "55555555-5555-4555-8555-555555555555",
          dependsOnTaskId: TASK_ID,
        }),
      ],
    });

    expect(body.kanban.not_started).toHaveLength(1);
    expect(body.kanban.blocked).toHaveLength(1);
    expect(body.kanban.completed).toHaveLength(0);
  });

  it("GET /tasks?projectId= filters by project scope", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, _sql: string, _values: unknown[] = []) => [
      {
        id: TASK_ID,
        projectId: PROJECT_ID,
        title: "Scoped task",
        description: null,
        status: "in_progress",
        priority: "medium",
        assigneeUserId: USER_ID,
        progressPercent: 55,
        assigneeName: "pm",
        riskScore: 32,
        riskLevel: "medium",
        startDate: null,
        dueDate: "2026-04-03",
        createdAt: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-30T00:00:00.000Z",
      },
    ]);

    const db = { queryTenant } as unknown as Db;
    const app = await createTestApp(db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/tasks?projectId=${PROJECT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        expect.objectContaining({
          id: TASK_ID,
          projectId: PROJECT_ID,
        }),
      ],
    });

    expect(queryTenant).toHaveBeenCalledTimes(1);
    const [tenantArg, sqlArg, valuesArg] = queryTenant.mock.calls[0]!;
    expect(tenantArg).toBe(TENANT_ID);
    expect(sqlArg).toContain("AND tasks.project_id = $2");
    expect(valuesArg).toEqual([TENANT_ID, PROJECT_ID]);
  });
});
