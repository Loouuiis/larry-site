import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { TOTP, Secret } from "otpauth";
import { authRoutes } from "../src/routes/v1/auth.js";
import { hashScratchCode } from "../src/lib/mfa.js";

// Login audit P1-2: MFA gating + verify flow.
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

// Stub out the password-breach check so signup/password flows don't hit
// HIBP during login path (we're only exercising /login here, but auth.ts
// imports it at the top level).
vi.mock("../src/lib/password-breach.js", () => ({
  assertPasswordNotBreached: vi.fn(async () => undefined),
  PasswordBreachedError: class extends Error {},
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const JWT_SECRET = "test-secret-minimum-length-for-jwt-xxxx";

interface DbCall {
  sql: string;
  args: unknown[];
}

interface BuildOpts {
  /** Tenant requires MFA for admins. */
  tenantRequiresMfa?: boolean;
  /** User is already enrolled. */
  userEnrolled?: boolean;
  /** User's role. */
  role?: "admin" | "owner" | "pm" | "member";
  /** When set, return this stored secret on user_mfa_secrets lookups. */
  storedSecretBase32?: string;
  /** When set, the first scratch-code consume attempt succeeds. */
  scratchCodeMatches?: boolean;
}

async function buildApp(opts: BuildOpts = {}) {
  const app = Fastify({ logger: false });
  const calls: DbCall[] = [];
  const role = opts.role ?? "admin";

  // Password hash for "CorrectHorseBatteryStaple1!" baked in. The login
  // route just needs a hash bcrypt.compare can verify; we stub verifyPassword
  // via a partial mock below, so the actual bytes don't matter.
  const userRow = {
    id: USER,
    email: "admin@example.com",
    password_hash: "$2a$12$abcdefghijklmnopqrstuv",
    role,
    tenant_id: TENANT,
    display_name: null,
  };

  const dbQuery = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args });
    // /login user lookup
    if (/FROM users u\s+JOIN memberships m/i.test(sql)) return [userRow];
    // lockout check
    if (/FROM login_attempts/i.test(sql)) return [];
    // MFA gate query
    if (/t\.mfa_required_for_admins, u\.mfa_enrolled_at/i.test(sql)) {
      return [
        {
          mfa_required_for_admins: Boolean(opts.tenantRequiresMfa),
          mfa_enrolled_at: opts.userEnrolled ? new Date().toISOString() : null,
        },
      ];
    }
    // user_mfa_secrets lookup for /mfa/verify
    if (/FROM user_mfa_secrets/i.test(sql) && /SELECT secret/i.test(sql)) {
      if (!opts.storedSecretBase32) return [];
      return [{ secret: opts.storedSecretBase32, confirmed_at: new Date().toISOString() }];
    }
    // scratch-code consume — matches first call if scratchCodeMatches set
    if (/UPDATE user_mfa_scratch_codes/i.test(sql)) {
      return opts.scratchCodeMatches ? [{ id: "sc-1" }] : [];
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
  await app.register(jwt, { secret: JWT_SECRET });
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
  return { app, dbQuery, calls };
}

// The login route calls bcrypt.compare via verifyPassword. We don't have
// a real hash; patch verifyPassword so it returns true on the test password
// and false otherwise. Done via vi.mock for the whole module.
vi.mock("../src/lib/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth.js")>();
  return {
    ...actual,
    verifyPassword: vi.fn(async (plain: string) => plain === "CorrectPassword1!"),
  };
});

const apps: Array<Awaited<ReturnType<typeof buildApp>>["app"]> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /auth/login — MFA gate", () => {
  it("returns 412 mfa_enrollment_required when admin in mfa-required tenant is not enrolled", async () => {
    const { app } = await buildApp({ tenantRequiresMfa: true, userEnrolled: false, role: "admin" });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(412);
    const body = res.json();
    expect(body.code).toBe("mfa_enrollment_required");
    expect(typeof body.mfaEnrolmentToken).toBe("string");
    expect(body.enrolmentUrl).toBe("/workspace/settings/mfa");
  });

  it("returns 200 mfa_required when admin is enrolled and tenant requires MFA", async () => {
    const { app } = await buildApp({ tenantRequiresMfa: true, userEnrolled: true, role: "admin" });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe("mfa_required");
    expect(typeof body.mfaPendingToken).toBe("string");
    // critically: no access/refresh tokens should have been issued
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
  });

  it("lets a non-admin log in normally even if tenant requires admin MFA", async () => {
    const { app } = await buildApp({ tenantRequiresMfa: true, userEnrolled: false, role: "member" });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBeUndefined();
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
  });

  it("lets an admin log in normally when tenant does not require MFA", async () => {
    const { app } = await buildApp({ tenantRequiresMfa: false, userEnrolled: false, role: "admin" });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBeUndefined();
    expect(typeof body.accessToken).toBe("string");
  });
});

describe("POST /auth/mfa/verify", () => {
  it("issues access + refresh when the TOTP code matches", async () => {
    const secret = new Secret({ size: 20 }).base32;
    const { app } = await buildApp({
      tenantRequiresMfa: true,
      userEnrolled: true,
      role: "admin",
      storedSecretBase32: secret,
    });
    apps.push(app);

    // mint a pending token via the real login path
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    const { mfaPendingToken } = loginRes.json();

    const totp = new TOTP({
      issuer: "Larry",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaPendingToken, code: totp.generate() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
  });

  it("rejects a wrong TOTP with 401", async () => {
    const secret = new Secret({ size: 20 }).base32;
    const { app } = await buildApp({
      tenantRequiresMfa: true,
      userEnrolled: true,
      role: "admin",
      storedSecretBase32: secret,
    });
    apps.push(app);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    const { mfaPendingToken } = loginRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaPendingToken, code: "000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a scratch code when useScratchCode=true", async () => {
    const secret = new Secret({ size: 20 }).base32;
    const { app } = await buildApp({
      tenantRequiresMfa: true,
      userEnrolled: true,
      role: "admin",
      storedSecretBase32: secret,
      scratchCodeMatches: true,
    });
    apps.push(app);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    const { mfaPendingToken } = loginRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaPendingToken, code: "AB2-CD3-EF4", useScratchCode: true },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().accessToken).toBe("string");
  });

  it("rejects a second use of the same scratch code (atomicity via UPDATE WHERE used_at IS NULL)", async () => {
    // First call the update finds no row (used_at already set) → returns false.
    const secret = new Secret({ size: 20 }).base32;
    const { app } = await buildApp({
      tenantRequiresMfa: true,
      userEnrolled: true,
      role: "admin",
      storedSecretBase32: secret,
      scratchCodeMatches: false,
    });
    apps.push(app);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@example.com", password: "CorrectPassword1!" },
    });
    const { mfaPendingToken } = loginRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaPendingToken, code: "AB2-CD3-EF4", useScratchCode: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a forged mfaPendingToken with 401", async () => {
    const { app } = await buildApp({
      tenantRequiresMfa: true,
      userEnrolled: true,
      role: "admin",
    });
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      payload: { mfaPendingToken: "not.a.jwt", code: "000000" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("hashScratchCode — regression guard for format normalisation", () => {
  it("produces the same hash regardless of dashes/case/whitespace", () => {
    expect(hashScratchCode("AB2-CD3-EF4")).toBe(hashScratchCode("ab2cd3ef4"));
    expect(hashScratchCode("  AB2 CD3 EF4  ")).toBe(hashScratchCode("ab2cd3ef4"));
  });
});
