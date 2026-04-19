import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

// P2-1 regression test. When a revoked refresh token is replayed, the
// handler must:
//   1. return 401
//   2. nuke every active refresh token for the (user, tenant) pair
//   3. write an `auth.refresh_reuse_detected` audit log
//
// We mock the email sender so the test doesn't hit Resend.
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

interface AuditCall {
  sql: string;
  args: unknown[];
}

async function buildApp() {
  const app = Fastify({ logger: false });
  const calls: AuditCall[] = [];
  const auditCalls: Array<Record<string, unknown>> = [];

  // Refresh-token lookup row — revoked_at is populated so the handler
  // treats this as a REUSE attempt.
  const revokedTokenRow = {
    id: "tok-1",
    tenant_id: TENANT,
    user_id: USER,
    role: "member" as const,
    email: "victim@example.com",
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    revoked_at: new Date().toISOString(),
  };

  const dbQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM refresh_tokens rt/i.test(sql)) return [revokedTokenRow];
    if (/FROM audit_log/i.test(sql)) return [];
    return [];
  });
  const dbQueryTenant = vi.fn(async (_tenant: string, sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM audit_log/i.test(sql)) return [];
    return [];
  });

  app.decorate("db", {
    query: dbQuery,
    queryTenant: dbQueryTenant,
    tx: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }),
    ),
  } as unknown as Db);
  app.decorate("config", { ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "30d" } as never);
  await app.register(jwt, { secret: "test-secret-minimum-length-for-jwt-xxxx" });
  app.decorate("authenticate", async () => undefined);
  app.decorate("requireRole", () => async () => undefined);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ statusCode: 400, message: error.issues.map((i) => i.message).join(". ") + "." });
    }
    const status = (error as Error & { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ statusCode: status, message: error.message });
  });
  await app.register(sensible);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.ready();
  return { app, dbQuery, calls, auditCalls };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /auth/refresh — revoked token reuse", () => {
  it("returns 401 and revokes every active refresh token for the user+tenant", async () => {
    const { app, calls } = await buildApp();
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "stolen-or-replayed", tenantId: TENANT },
    });

    expect(res.statusCode).toBe(401);

    // Should have issued the family-nuke UPDATE
    const nukeCalls = calls.filter(
      (c) =>
        /UPDATE refresh_tokens/i.test(c.sql) &&
        /revoked_at = NOW\(\)/i.test(c.sql) &&
        /WHERE user_id = \$1 AND tenant_id = \$2 AND revoked_at IS NULL/i.test(c.sql),
    );
    expect(nukeCalls.length).toBeGreaterThanOrEqual(1);
    expect(nukeCalls[0].args).toEqual([USER, TENANT]);

    // Should have written an audit log entry for refresh_reuse_detected
    const auditInserts = calls.filter(
      (c) => /INSERT INTO audit_log/i.test(c.sql) && c.args.includes("auth.refresh_reuse_detected"),
    );
    expect(auditInserts.length).toBe(1);
  });
});
