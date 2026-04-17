import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

interface BuiltApp {
  app: Awaited<ReturnType<typeof Fastify>>;
  calls: Array<{ sql: string; params: readonly unknown[] }>;
}

async function buildApp(handlers: {
  remainingAdmins?: number;
  targetRole?: string;
  role?: "admin" | "member" | "owner";
} = {}): Promise<BuiltApp> {
  const app = Fastify({ logger: false });
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  const dbQuery = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    if (/COUNT\(\*\)::int AS n/i.test(sql)) {
      return [{ n: handlers.remainingAdmins ?? 1 }];
    }
    if (/SELECT role FROM memberships/i.test(sql)) {
      return [{ role: handlers.targetRole ?? "member" }];
    }
    // Member-list read-backs return an empty list (keeps response shape simple).
    return [];
  });

  app.decorate("db", {
    query: dbQuery,
    queryTenant: vi.fn(async (_t: string, sql: string, params: readonly unknown[] = []) => dbQuery(sql, params)),
    tx: vi.fn(async (fn: (c: { query: typeof dbQuery }) => unknown) => fn({ query: dbQuery })),
  } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user = {
      tenantId: TENANT,
      userId: ADMIN,
      role: handlers.role ?? "admin",
      email: "a@x.com",
    };
  });
  app.decorate("requireRole", () => async () => undefined);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: error.issues.map((i) => i.message).join(". ") + ".",
      });
    }
    const status = (error as Error & { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ statusCode: status, message: error.message });
  });
  await app.register(sensible);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.ready();
  return { app, calls };
}

const apps: Array<BuiltApp["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /auth/members/invite — schema", () => {
  it("rejects role=viewer (not a tenant role)", async () => {
    const { app } = await buildApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/members/invite",
      payload: { email: "x@y.com", role: "viewer" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects role=owner via the invite endpoint", async () => {
    const { app } = await buildApp();
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/members/invite",
      payload: { email: "x@y.com", role: "owner" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /auth/members/:userId — last-admin guard", () => {
  it("rejects demoting the final admin", async () => {
    const { app } = await buildApp({ remainingAdmins: 0, targetRole: "admin" });
    apps.push(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/auth/members/${OTHER}`,
      payload: { role: "member" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/admin/i);
  });

  it("allows demoting an admin when another admin remains", async () => {
    const { app } = await buildApp({ remainingAdmins: 1, targetRole: "admin" });
    apps.push(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/auth/members/${OTHER}`,
      payload: { role: "member" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("DELETE /auth/members/:userId", () => {
  it("rejects removing the final admin", async () => {
    const { app } = await buildApp({ remainingAdmins: 0 });
    apps.push(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/auth/members/${OTHER}`,
    });
    expect(res.statusCode).toBe(409);
  });

  it("also deletes project_memberships for removed user", async () => {
    const { app, calls } = await buildApp({ remainingAdmins: 1 });
    apps.push(app);
    const res = await app.inject({
      method: "DELETE",
      url: `/auth/members/${OTHER}`,
    });
    expect(res.statusCode).toBe(200);
    expect(calls.some((c) => /DELETE FROM project_memberships/i.test(c.sql))).toBe(true);
  });
});
