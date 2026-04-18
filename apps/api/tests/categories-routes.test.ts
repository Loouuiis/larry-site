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
    expect(repo.insertCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, { name: "Internal", colour: null, sortOrder: 0, parentCategoryId: null, projectId: null });
  });

  it("rejects empty name with 400", async () => {
    const app = await buildApp(); apps.push(app);
    const res = await app.inject({ method: "POST", url: "/categories", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
  });

  it("passes parentCategoryId to the repo", async () => {
    const app = await buildApp(); apps.push(app);
    const PARENT_ID = "33333333-3333-4333-8333-333333333333";
    const row = { id: "c1", tenantId: TENANT_ID, name: "Child", colour: null, sortOrder: 0, parentCategoryId: PARENT_ID, projectId: null, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.insertCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "POST", url: "/categories", payload: { name: "Child", parentCategoryId: PARENT_ID } });
    expect(res.statusCode).toBe(201);
    expect(repo.insertCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, {
      name: "Child", colour: null, sortOrder: 0, parentCategoryId: PARENT_ID, projectId: null,
    });
  });

  it("passes projectId to the repo", async () => {
    const app = await buildApp(); apps.push(app);
    const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
    const row = { id: "c1", tenantId: TENANT_ID, name: "Design", colour: "#6c44f6", sortOrder: 0, parentCategoryId: null, projectId: PROJECT_ID, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.insertCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "POST", url: "/categories", payload: { name: "Design", colour: "#6c44f6", projectId: PROJECT_ID } });
    expect(res.statusCode).toBe(201);
    expect(repo.insertCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, {
      name: "Design", colour: "#6c44f6", sortOrder: 0, parentCategoryId: null, projectId: PROJECT_ID,
    });
  });

  it("returns 400 when both parentCategoryId and projectId are set", async () => {
    const app = await buildApp(); apps.push(app);
    const res = await app.inject({ method: "POST", url: "/categories", payload: {
      name: "Bad",
      parentCategoryId: "33333333-3333-4333-8333-333333333333",
      projectId: "44444444-4444-4444-8444-444444444444",
    } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message ?? res.json().error).toMatch(/exactly one or neither/i);
    expect(repo.insertCategory).not.toHaveBeenCalled();
  });
});

describe("PATCH /categories/:id", () => {
  it("updates name + colour", async () => {
    const app = await buildApp(); apps.push(app);
    const row = { id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", tenantId: TENANT_ID, name: "Renamed", colour: "#6c44f6", sortOrder: 2, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.updateCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "PATCH", url: "/categories/c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", payload: { name: "Renamed", colour: "#6c44f6" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ category: row });
  });

  it("returns 404 when not found", async () => {
    const app = await buildApp(); apps.push(app);
    vi.mocked(repo.updateCategory).mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/categories/11111111-1111-4111-8111-111111111111", payload: { name: "X" } });
    expect(res.statusCode).toBe(404);
  });

  it("accepts parentCategoryId on PATCH", async () => {
    const app = await buildApp(); apps.push(app);
    const PARENT_ID = "33333333-3333-4333-8333-333333333333";
    const row = { id: "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", tenantId: TENANT_ID, name: "Child", colour: null, sortOrder: 0, parentCategoryId: PARENT_ID, projectId: null, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.updateCategory).mockResolvedValue(row);
    const res = await app.inject({ method: "PATCH", url: "/categories/c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", payload: { parentCategoryId: PARENT_ID } });
    expect(res.statusCode).toBe(200);
    expect(repo.updateCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", { parentCategoryId: PARENT_ID });
  });

  it("returns 400 when PATCH sets both parentCategoryId and projectId", async () => {
    const app = await buildApp(); apps.push(app);
    const res = await app.inject({ method: "PATCH", url: "/categories/c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1", payload: {
      parentCategoryId: "33333333-3333-4333-8333-333333333333",
      projectId: "44444444-4444-4444-8444-444444444444",
    } });
    expect(res.statusCode).toBe(400);
    expect(repo.updateCategory).not.toHaveBeenCalled();
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

describe("POST /categories/:id/move", () => {
  it("moves a category under a new parentCategoryId", async () => {
    const app = await buildApp(); apps.push(app);
    const NEW_PARENT = "33333333-3333-4333-8333-333333333333";
    const ID = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
    const row = { id: ID, tenantId: TENANT_ID, name: "X", colour: null, sortOrder: 2, parentCategoryId: NEW_PARENT, projectId: null, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.moveCategory).mockResolvedValue(row);
    const res = await app.inject({
      method: "POST",
      url: `/categories/${ID}/move`,
      payload: { parentCategoryId: NEW_PARENT, sortOrder: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().category.parentCategoryId).toBe(NEW_PARENT);
    expect(repo.moveCategory).toHaveBeenCalledWith(expect.anything(), TENANT_ID, ID, {
      parentCategoryId: NEW_PARENT, projectId: null, sortOrder: 2,
    });
  });

  it("moves a category into a project (scoped)", async () => {
    const app = await buildApp(); apps.push(app);
    const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
    const ID = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
    const row = { id: ID, tenantId: TENANT_ID, name: "X", colour: null, sortOrder: 0, parentCategoryId: null, projectId: PROJECT_ID, createdAt: "x", updatedAt: "x" };
    vi.mocked(repo.moveCategory).mockResolvedValue(row);
    const res = await app.inject({
      method: "POST",
      url: `/categories/${ID}/move`,
      payload: { projectId: PROJECT_ID, sortOrder: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().category.projectId).toBe(PROJECT_ID);
  });

  it("rejects both parentCategoryId and projectId set", async () => {
    const app = await buildApp(); apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/categories/c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1/move",
      payload: {
        parentCategoryId: "33333333-3333-4333-8333-333333333333",
        projectId: "44444444-4444-4444-8444-444444444444",
        sortOrder: 0,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(repo.moveCategory).not.toHaveBeenCalled();
  });

  it("returns 400 when moveCategory rejects a cycle", async () => {
    const app = await buildApp(); apps.push(app);
    vi.mocked(repo.moveCategory).mockRejectedValue(
      new Error("moveCategory: cannot move a category under itself or its descendant."),
    );
    const res = await app.inject({
      method: "POST",
      url: "/categories/c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1/move",
      payload: { parentCategoryId: "33333333-3333-4333-8333-333333333333", sortOrder: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message ?? res.json().error).toMatch(/cannot move/i);
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
