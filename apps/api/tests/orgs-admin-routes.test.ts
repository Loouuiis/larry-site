import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";

// Enable the feature flag for the whole test file so orgsAdminRoutes register.
beforeAll(() => {
  process.env.RBAC_V2_ENABLED = "true";
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/x";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.JWT_ACCESS_SECRET = "x".repeat(40);
  process.env.JWT_REFRESH_SECRET = "x".repeat(40);
});

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ADMIN_TGT = "33333333-3333-4333-8333-333333333333";

async function buildApp(role: "owner" | "admin" | "member" = "owner") {
  // Import lazily so the env vars set in beforeAll are picked up.
  const { orgsAdminRoutes } = await import("../src/routes/v1/orgs-admin.js");
  // Reset config cache between tests so env changes take effect.
  const cfg = await import("@larry/config");
  cfg.resetConfigCacheForTests();

  const app = Fastify({ logger: false });
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (/SELECT role FROM memberships/i.test(sql)) {
      const uid = (params ?? [])[1];
      return uid === ADMIN_TGT ? [{ role: "admin" }] : [{ role }];
    }
    if (/UPDATE tenants/i.test(sql)) {
      return [{ id: TENANT, name: "Acme", seat_cap: 50, mfa_required_for_admins: false }];
    }
    return [];
  });
  app.decorate("db", {
    query,
    queryTenant: vi.fn(async (_t: string, sql: string, p?: readonly unknown[]) => query(sql, p)),
    tx: vi.fn(async (fn: (c: { query: unknown }) => unknown) =>
      fn({
        query: async (sql: string, params: readonly unknown[]) => {
          if (/SELECT role FROM memberships/i.test(sql)) {
            const uid = params[1];
            return { rows: uid === ADMIN_TGT ? [{ role: "admin" }] : [{ role }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        },
      }),
    ),
  } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user =
      { tenantId: TENANT, userId: OWNER, role, email: "o@x.com" };
  });
  app.decorate("requireRole", () => async () => undefined);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ message: error.issues.map((i) => i.message).join(". ") });
    }
    const status = (error as Error & { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ statusCode: status, message: error.message });
  });
  await app.register(sensible);
  await app.register(orgsAdminRoutes, { prefix: "/orgs" });
  await app.ready();
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /orgs/transfer-ownership", () => {
  it("owner transfers to an admin", async () => {
    const app = await buildApp("owner");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/transfer-ownership",
      payload: { newOwnerUserId: ADMIN_TGT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ newOwnerUserId: ADMIN_TGT });
  });

  it("admin cannot transfer ownership", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/transfer-ownership",
      payload: { newOwnerUserId: ADMIN_TGT },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects transferring to yourself", async () => {
    const app = await buildApp("owner");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/transfer-ownership",
      payload: { newOwnerUserId: OWNER },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /orgs", () => {
  it("admin updates seat cap", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    const res = await app.inject({ method: "PATCH", url: "/orgs", payload: { seatCap: 50 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().tenant.seatCap).toBe(50);
  });

  it("member cannot change settings", async () => {
    const app = await buildApp("member");
    apps.push(app);
    const res = await app.inject({ method: "PATCH", url: "/orgs", payload: { seatCap: 50 } });
    expect(res.statusCode).toBe(403);
  });
});
