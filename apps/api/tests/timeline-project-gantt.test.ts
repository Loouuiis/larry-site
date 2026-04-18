import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { projectRoutes } from "../src/routes/v1/projects.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PARENT_TASK_ID = "44444444-4444-4444-8444-444444444444";

async function buildApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });
  app.decorate("db", { queryTenant } as unknown as Db);
  app.decorate(
    "authenticate",
    async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
      (
        req as typeof req & {
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
  await app.ready();
  return app;
}

afterEach(() => vi.clearAllMocks());

describe("GET /projects/:id/timeline includes parentTaskId", () => {
  it("returns parentTaskId on each task in the gantt array", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      // project existence check (SELECT id … FROM projects)
      if (/FROM projects/.test(sql) && /WHERE tenant_id/.test(sql)) {
        return [{ id: PROJECT_ID, status: "active" }];
      }
      // membership role check (SELECT role FROM project_memberships)
      if (/FROM project_memberships/.test(sql)) {
        return [{ role: "owner" }];
      }
      // task rows SELECT (contains parent_task_id)
      if (/FROM tasks/.test(sql) && /parent_task_id/i.test(sql)) {
        return [
          {
            id: "t1",
            title: "Task one",
            status: "not_started",
            priority: "medium",
            parentTaskId: PARENT_TASK_ID,
            assigneeUserId: null,
            assigneeName: null,
            progressPercent: 0,
            startDate: "2026-04-01",
            dueDate: "2026-04-10",
            riskLevel: "low",
          },
          {
            id: "t2",
            title: "Task two (top-level)",
            status: "in_progress",
            priority: "high",
            parentTaskId: null,
            assigneeUserId: null,
            assigneeName: null,
            progressPercent: 50,
            startDate: "2026-04-05",
            dueDate: "2026-04-15",
            riskLevel: "low",
          },
        ];
      }
      // dependencies query
      if (/FROM task_dependencies/.test(sql)) {
        return [];
      }
      return [];
    });

    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/timeline`,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // The handler returns { gantt, ... }
    const tasks: Array<{ parentTaskId?: string | null }> = body.gantt ?? [];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => "parentTaskId" in t)).toBe(true);

    const child = tasks.find((t) => t.parentTaskId === PARENT_TASK_ID);
    expect(child).toBeDefined();

    const topLevel = tasks.find((t) => t.parentTaskId === null);
    expect(topLevel).toBeDefined();
  });

  it("gantt array excludes tasks with null start_date or due_date; kanban keeps them", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/FROM projects/.test(sql) && /WHERE tenant_id/.test(sql)) {
        return [{ id: PROJECT_ID, status: "active" }];
      }
      if (/FROM project_memberships/.test(sql)) return [{ role: "owner" }];
      if (/FROM tasks/.test(sql) && /parent_task_id/i.test(sql)) {
        return [
          { id: "t-dated",    title: "Dated",    status: "not_started", priority: "medium",
            parentTaskId: null, assigneeUserId: null, assigneeName: null, progressPercent: 0,
            startDate: "2026-04-01", dueDate: "2026-04-10", riskLevel: "low" },
          { id: "t-no-start", title: "No start", status: "in_progress", priority: "medium",
            parentTaskId: null, assigneeUserId: null, assigneeName: null, progressPercent: 0,
            startDate: null, dueDate: "2026-04-10", riskLevel: "low" },
          { id: "t-no-end",   title: "No end",   status: "blocked",     priority: "medium",
            parentTaskId: null, assigneeUserId: null, assigneeName: null, progressPercent: 0,
            startDate: "2026-04-01", dueDate: null, riskLevel: "low" },
        ];
      }
      if (/FROM task_dependencies/.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const res = await app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/timeline` });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const ganttIds = (body.gantt as Array<{ id: string }>).map((t) => t.id);
    expect(ganttIds).toEqual(["t-dated"]);

    // Kanban still holds every task regardless of dates.
    const kanbanIds = Object.values(body.kanban as Record<string, Array<{ id: string }>>)
      .flat()
      .map((t) => t.id)
      .sort();
    expect(kanbanIds).toEqual(["t-dated", "t-no-end", "t-no-start"]);
  });

  it("includes parent_task_id in the SQL sent to the database", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (/FROM projects/.test(sql)) return [{ id: PROJECT_ID, status: "active" }];
      if (/FROM project_memberships/.test(sql)) return [{ role: "owner" }];
      if (/FROM tasks/.test(sql)) return [];
      if (/FROM task_dependencies/.test(sql)) return [];
      return [];
    });

    const app = await buildApp(queryTenant);
    const res = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/timeline`,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const sqlStrings = queryTenant.mock.calls.map((c) => c[1] as string);
    expect(sqlStrings.some((s) => /parent_task_id/i.test(s))).toBe(true);
  });
});
