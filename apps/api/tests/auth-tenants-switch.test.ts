import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

async function buildApp(currentTenantId: string = TENANT_A) {
  const app = Fastify({ logger: false });
  const dbQuery = vi.fn(async () => []);
  const dbQueryTenant = vi.fn(async () => []);
  app.decorate("db", {
    query: dbQuery,
    queryTenant: dbQueryTenant,
    tx: vi.fn(async (fn: (c: { query: typeof dbQuery }) => unknown) =>
      fn({
        query: vi.fn(async () => ({ rows: [], rowCount: 1 })) as unknown as typeof dbQuery,
      }),
    ),
  } as unknown as Db);
  app.decorate("config", { ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "30d" } as never);
  await app.register(jwt, { secret: "test-secret-minimum-length-for-jwt-xxxx" });
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user = {
      tenantId: currentTenantId,
      userId: USER,
      role: "member",
      email: "a@x.com",
    };
  });
  app.decorate("requireRole", () => async () => undefined);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        message: error.issues.map((i) => i.message).join(". ") + ".",
      });
    }
    const status = (error as Error & { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ statusCode: status, message: error.message });
  });
  await app.register(sensible);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.ready();
  return { app, dbQuery };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("GET /auth/tenants", () => {
  it("returns the caller's memberships with current flag", async () => {
    const { app, dbQuery } = await buildApp(TENANT_A);
    apps.push(app);

    dbQuery.mockImplementationOnce(async () => [
      { tenantId: TENANT_A, name: "Primary Org", slug: "primary", role: "owner", createdAt: "2026-04-01T00:00:00Z" },
      { tenantId: TENANT_B, name: "Side Org", slug: "side", role: "member", createdAt: "2026-04-15T00:00:00Z" },
    ]);

    const res = await app.inject({ method: "GET", url: "/auth/tenants" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenants: Array<{ tenantId: string; current: boolean }> };
    expect(body.tenants).toHaveLength(2);
    expect(body.tenants.find((t) => t.tenantId === TENANT_A)?.current).toBe(true);
    expect(body.tenants.find((t) => t.tenantId === TENANT_B)?.current).toBe(false);
  });
});

describe("POST /auth/switch-tenant", () => {
  it("issues fresh tokens for a tenant the caller belongs to", async () => {
    const { app, dbQuery } = await buildApp(TENANT_A);
    apps.push(app);

    // First query → membership lookup returns the target membership.
    dbQuery.mockImplementationOnce(async () => [
      { role: "member", email: "a@x.com", display_name: "Anton" },
    ]);
    // Audit-log insert + refresh-token insert use dbQuery too; return empties.
    dbQuery.mockImplementation(async () => []);

    const res = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      payload: { tenantId: TENANT_B },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; user: { tenantId: string } };
    expect(body.accessToken).toBeDefined();
    expect(body.user.tenantId).toBe(TENANT_B);
  });

  it("forbids switching to a tenant the caller doesn't belong to", async () => {
    const { app, dbQuery } = await buildApp(TENANT_A);
    apps.push(app);
    dbQuery.mockImplementation(async () => []);

    const res = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      payload: { tenantId: TENANT_B },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a switch to the current tenant with 400", async () => {
    const { app } = await buildApp(TENANT_A);
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      payload: { tenantId: TENANT_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-UUID tenantId with 400", async () => {
    const { app } = await buildApp(TENANT_A);
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/switch-tenant",
      payload: { tenantId: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
  });
});
