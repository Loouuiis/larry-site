import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { authRoutes } from "../src/routes/v1/auth.js";

// Login audit P2-3: persistent device-id cookie replaces the old
// (ip, user_agent) exact-match known-device check. These tests exercise
// three invariants:
//   (a) no device_id header → API mints one, returns it in body, issues
//       a new-device email ONLY if the user had prior sessions.
//   (b) matching device_id header + prior row in DB → known device, no
//       email, same device_id round-tripped.
//   (c) /refresh carries device_id through rotation (regression guard so
//       the cookie stays sticky across refresh cycles).

const { sendNewDeviceAlert } = vi.hoisted(() => ({
  sendNewDeviceAlert: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/email.js", () => ({
  sendRefreshReuseAlert: vi.fn(async () => undefined),
  sendNewDeviceAlert,
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendEmailChangeConfirmation: vi.fn(async () => undefined),
  sendEmailChangeNotification: vi.fn(async () => undefined),
  sendMemberInviteEmail: vi.fn(async () => undefined),
  sendBriefingDigestEmail: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/password-breach.js", () => ({
  assertPasswordNotBreached: vi.fn(async () => undefined),
  PasswordBreachedError: class extends Error {},
}));

vi.mock("../src/lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth.js")>();
  return {
    ...actual,
    verifyPassword: vi.fn(async (plain: string) => plain === "CorrectPassword1!"),
  };
});

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const DEVICE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface BuildOpts {
  /** Whether the DB returns a matching refresh_tokens row for the device lookup. */
  deviceKnown?: boolean;
  /** Whether the user has ANY prior refresh_tokens row. */
  hasPrior?: boolean;
  /** Simulate a /refresh: provide a token row with a preset device_id. */
  refreshRow?: { device_id: string | null };
}

async function buildApp(opts: BuildOpts = {}) {
  const app = Fastify({ logger: false });
  const calls: Array<{ sql: string; args: unknown[] }> = [];

  const userRow = {
    id: USER,
    email: "admin@example.com",
    password_hash: "$2a$12$placeholder",
    role: "member" as const,
    tenant_id: TENANT,
    display_name: null,
  };

  const dbQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    if (/FROM users u\s+JOIN memberships m/i.test(sql)) return [userRow];
    if (/FROM login_attempts/i.test(sql)) return [];
    if (/t\.mfa_required_for_admins/i.test(sql)) {
      return [{ mfa_required_for_admins: false, mfa_enrolled_at: null }];
    }
    // device lookup by device_id
    if (/FROM refresh_tokens/i.test(sql) && /device_id = \$2/i.test(sql)) {
      return opts.deviceKnown ? [{ id: "rt-match" }] : [];
    }
    // has-prior-session lookup (no device_id in WHERE)
    if (/SELECT id FROM refresh_tokens/i.test(sql) && /tenant_id = \$2\s+LIMIT 1/i.test(sql)) {
      return opts.hasPrior ? [{ id: "rt-any" }] : [];
    }
    // /refresh token lookup
    if (/FROM refresh_tokens rt\s+JOIN users u/i.test(sql)) {
      return opts.refreshRow
        ? [
            {
              id: "rt-1",
              tenant_id: TENANT,
              user_id: USER,
              role: "member",
              email: "admin@example.com",
              expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
              revoked_at: null,
              device_id: opts.refreshRow.device_id,
            },
          ]
        : [];
    }
    if (/FROM audit_log/i.test(sql)) return [];
    return [];
  });

  app.decorate("db", {
    query: dbQuery,
    queryTenant: vi.fn(async () => []),
    tx: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({ query: async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        return { rows: [], rowCount: 1 };
      } }),
    ),
  } as unknown as Db);
  app.decorate("config", { ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "30d" } as never);
  await app.register(jwt, { secret: "test-secret-minimum-length-for-jwt-xxxx" });
  app.decorate("authenticate", async () => undefined);
  app.decorate("requireRole", () => async () => undefined);
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send({ statusCode: 400, message: error.issues.map((i) => i.message).join(". ") + "." });
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
  sendNewDeviceAlert.mockClear();
  vi.clearAllMocks();
});

describe("POST /auth/login — P2-3 device fingerprint", () => {
  it("mints a fresh device_id when no cookie is presented and returns it in the body", async () => {
    const { app, calls } = await buildApp({ hasPrior: false });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.deviceId).toBe("string");
    // should match a UUIDv4 shape (what randomUUID() emits).
    expect(body.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // device_id was persisted on the new refresh_tokens row.
    const insertCall = calls.find((c) => /INSERT INTO refresh_tokens/i.test(c.sql));
    expect(insertCall?.args[6]).toBe(body.deviceId);
  });

  it("does NOT email when the device_id cookie matches an existing refresh_tokens row (known device)", async () => {
    const { app } = await buildApp({ deviceKnown: true, hasPrior: true });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-device-id": DEVICE_A },
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deviceId).toBe(DEVICE_A); // echoed back
    expect(sendNewDeviceAlert).not.toHaveBeenCalled();
  });

  it("emails on new device when there ARE prior sessions (device cookie missing or mismatched)", async () => {
    const { app } = await buildApp({ deviceKnown: false, hasPrior: true });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-device-id": DEVICE_A },
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    expect(sendNewDeviceAlert).toHaveBeenCalledTimes(1);
  });

  it("does NOT email for a first-ever login (no prior sessions) even with no cookie", async () => {
    const { app } = await buildApp({ hasPrior: false });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    expect(sendNewDeviceAlert).not.toHaveBeenCalled();
  });
});

describe("POST /auth/refresh — P2-3 device_id is sticky across rotations", () => {
  it("forwards device_id from the old token row to the new one", async () => {
    const { app, calls } = await buildApp({ refreshRow: { device_id: DEVICE_A } });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "any", tenantId: TENANT },
    });
    expect(res.statusCode).toBe(200);
    // INSERT happens inside tx; positional arg 7 is device_id.
    const inserts = calls.filter((c) => /INSERT INTO refresh_tokens/i.test(c.sql));
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    expect(inserts.at(-1)!.args[6]).toBe(DEVICE_A);
  });

  it("carries null device_id through for legacy pre-P2-3 rows", async () => {
    const { app, calls } = await buildApp({ refreshRow: { device_id: null } });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "any", tenantId: TENANT },
    });
    expect(res.statusCode).toBe(200);
    const inserts = calls.filter((c) => /INSERT INTO refresh_tokens/i.test(c.sql));
    expect(inserts.at(-1)!.args[6]).toBeNull();
  });
});
