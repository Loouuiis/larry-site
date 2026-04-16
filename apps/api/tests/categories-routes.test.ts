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
