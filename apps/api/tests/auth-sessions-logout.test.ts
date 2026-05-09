import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyRequest } from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { hashToken } from "../src/lib/auth.js";
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

vi.mock("../src/lib/password-breach.js", () => ({
  PasswordBreachedError: class PasswordBreachedError extends Error {},
  assertPasswordNotBreached: vi.fn(async () => undefined),
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

  const dbQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM refresh_tokens/i.test(sql) && /ORDER BY created_at DESC/i.test(sql)) {
      return [
        {
          id: "rt-current",
          created_at: "2026-05-02T10:00:00.000Z",
          ip_address: "127.0.0.1",
          user_agent: "Vitest",
          is_current: true,
        },
        {
          id: "rt-other",
          created_at: "2026-05-01T10:00:00.000Z",
          ip_address: "127.0.0.2",
          user_agent: "Other browser",
          is_current: false,
        },
      ];
    }
    if (/UPDATE refresh_tokens/i.test(sql) && /RETURNING id, user_id, tenant_id/i.test(sql)) {
      return [{ id: "rt-current", user_id: USER, tenant_id: TENANT }];
    }
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
  app.decorate("authenticate", async (request: FastifyRequest) => {
    (request as FastifyRequest & { user: unknown }).user = {
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      email: "admin@example.com",
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
  return { app, calls };
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("auth session management", () => {
  it("marks the active refresh token as the current session", async () => {
    const { app, calls } = await buildApp();
    apps.push(app);

    const res = await app.inject({
      method: "GET",
      url: "/auth/sessions",
      headers: { "x-current-token-hash": "current-hash" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sessions: [
        {
          id: "rt-current",
          createdAt: "2026-05-02T10:00:00.000Z",
          ipAddress: "127.0.0.1",
          userAgent: "Vitest",
          isCurrent: true,
        },
        {
          id: "rt-other",
          createdAt: "2026-05-01T10:00:00.000Z",
          ipAddress: "127.0.0.2",
          userAgent: "Other browser",
          isCurrent: false,
        },
      ],
    });

    const listCall = calls.find((c) => /FROM refresh_tokens/i.test(c.sql));
    expect(listCall?.sql).toMatch(/token_hash = \$3/);
    expect(listCall?.args).toEqual([USER, TENANT, "current-hash"]);
  });

  it("revokes only the current refresh token when logout receives its hash", async () => {
    const { app, calls } = await buildApp();
    apps.push(app);
    const accessToken = app.jwt.sign({
      sub: USER,
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      email: "admin@example.com",
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-current-token-hash": "current-hash",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    const revokeCall = calls.find((c) => /UPDATE refresh_tokens/i.test(c.sql));
    expect(revokeCall?.sql).toMatch(/token_hash = \$3/);
    expect(revokeCall?.args).toEqual([USER, TENANT, "current-hash"]);

    const auditCall = calls.find(
      (c) => /INSERT INTO audit_log/i.test(c.sql) && c.args.includes("auth.logout"),
    );
    expect(auditCall?.args).toContain(JSON.stringify({ scope: "current" }));
  });

  it("can revoke the current refresh token even when the access token is absent or expired", async () => {
    const { app, calls } = await buildApp();
    apps.push(app);

    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: {
        refreshToken: "refresh-token",
        tenantId: TENANT,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    const revokeCall = calls.find(
      (c) => /UPDATE refresh_tokens/i.test(c.sql) && /RETURNING id, user_id, tenant_id/i.test(c.sql),
    );
    expect(revokeCall?.args).toEqual([TENANT, hashToken("refresh-token")]);

    const auditCall = calls.find(
      (c) => /INSERT INTO audit_log/i.test(c.sql) && c.args.includes("auth.logout"),
    );
    expect(auditCall?.args).toContain(
      JSON.stringify({ scope: "current", proof: "refresh_token" }),
    );
  });
});
