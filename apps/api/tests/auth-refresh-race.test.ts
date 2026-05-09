import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

vi.mock("../src/lib/email.js", () => ({
  sendRefreshReuseAlert: vi.fn(async () => undefined),
  sendNewDeviceAlert: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendEmailChangeConfirmation: vi.fn(async () => undefined),
  sendEmailChangeNotification: vi.fn(async () => undefined),
  sendMemberInviteEmail: vi.fn(async () => undefined),
  sendBriefingDigestEmail: vi.fn(async () => undefined),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";

interface DbCall {
  sql: string;
  args: unknown[];
}

async function buildApp() {
  const app = Fastify({ logger: false });
  const calls: DbCall[] = [];

  const activeTokenRow = {
    id: "tok-race",
    tenant_id: TENANT,
    user_id: USER,
    role: "member" as const,
    email: "user@example.com",
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    revoked_at: null,
    device_id: null,
  };

  const dbQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM refresh_tokens rt/i.test(sql)) return [activeTokenRow];
    if (/FROM audit_log/i.test(sql)) return [];
    return [];
  });
  const dbQueryTenant = vi.fn(async (_tenant: string, sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM audit_log/i.test(sql)) return [];
    return [];
  });
  const clientQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/UPDATE refresh_tokens SET revoked_at = NOW\(\)/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });

  app.decorate("db", {
    query: dbQuery,
    queryTenant: dbQueryTenant,
    tx: vi.fn(async (fn: (c: unknown) => unknown) => fn({ query: clientQuery })),
  } as unknown as Db);
  app.decorate("config", { ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "30d" } as never);
  await app.register(jwt, { secret: "test-secret-minimum-length-for-jwt-xxxx" });
  app.decorate("authenticate", async () => undefined);
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
  return { app, calls };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /auth/refresh — concurrent rotation race", () => {
  it("does not mint a second refresh token when another request already rotated it", async () => {
    const { app, calls } = await buildApp();
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "same-token-in-two-tabs", tenantId: TENANT },
    });

    expect(res.statusCode).toBe(401);

    const inserts = calls.filter((c) => /INSERT INTO refresh_tokens/i.test(c.sql));
    expect(inserts).toHaveLength(0);

    const familyNukes = calls.filter(
      (c) =>
        /UPDATE refresh_tokens/i.test(c.sql) &&
        /WHERE user_id = \$1 AND tenant_id = \$2 AND revoked_at IS NULL/i.test(c.sql),
    );
    expect(familyNukes).toHaveLength(0);
  });
});
