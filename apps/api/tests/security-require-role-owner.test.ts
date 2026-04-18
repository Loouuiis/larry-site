import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import type { Role } from "@larry/shared";
import { securityPlugin } from "../src/plugins/security.js";

// Regression: before the fix, every route registered with
//   fastify.requireRole(["admin", "pm"])
// silently rejected tenant owners (role="owner") with a 403. This was
// introduced when RBAC v2 shipped an "owner" role but the project/task/
// settings route guards were never updated. Result: every tenant whose
// first admin was promoted to owner by the 2026-04-17 one-off script
// lost the ability to create projects, edit tasks, or change settings.
//
// The fix: requireRole now treats "owner" as implicit wherever "admin"
// is permitted (owner is a strict superset of admin per RBAC v2).

const JWT_SECRET = "test-secret-for-require-role-owner-regression-1234567890";

async function build(role: Role, roles: Role[]): Promise<FastifyInstance> {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = JWT_SECRET;
  process.env.CORS_ORIGINS = "http://localhost:3000";
  process.env.DATABASE_URL = "postgres://unused";
  process.env.REDIS_URL = "redis://unused";

  const app = Fastify({ logger: false });
  await app.register(sensible);
  await app.register(securityPlugin);

  app.get(
    "/probe",
    {
      preHandler: [
        async (req) => {
          // Inject a synthetic authenticated user — we're testing the
          // role gate, not jwt verification.
          (req as unknown as { user: { userId: string; tenantId: string; role: Role; email: string } }).user = {
            userId: "u",
            tenantId: "t",
            role,
            email: "x@y.com",
          };
        },
        app.requireRole(roles),
      ],
    },
    async () => ({ ok: true }),
  );

  return app;
}

describe("requireRole — owner treated as implicit admin", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it("owner is accepted where route only lists ['admin', 'pm']", async () => {
    app = await build("owner", ["admin", "pm"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("owner is accepted where route only lists ['admin', 'pm', 'member']", async () => {
    app = await build("owner", ["admin", "pm", "member"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });

  it("owner is accepted where route only lists ['admin']", async () => {
    app = await build("owner", ["admin"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });

  it("admin still accepted (no regression for existing users)", async () => {
    app = await build("admin", ["admin", "pm"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });

  it("pm still accepted where listed", async () => {
    app = await build("pm", ["admin", "pm"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });

  it("member is rejected from admin/pm-only routes (no privilege leak)", async () => {
    app = await build("member", ["admin", "pm"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(403);
  });

  it("executive is treated as member (legacy role mapping)", async () => {
    app = await build("executive", ["admin", "pm", "member"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });

  it("403 message is human-readable (not the old 'Insufficient role permissions')", async () => {
    app = await build("member", ["admin", "pm"]);
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { message?: string };
    expect(body.message).toBe("You don't have permission to perform this action.");
  });
});
