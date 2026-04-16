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
