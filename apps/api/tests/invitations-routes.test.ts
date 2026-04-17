import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { invitationsRoutes } from "../src/routes/v1/invitations.js";
import * as invitationsLib from "../src/lib/invitations.js";

vi.mock("../src/lib/invitations.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/invitations.js")>(
    "../src/lib/invitations.js",
  );
  return {
    ...actual,
    createInvitation: vi.fn(),
    findPendingInvitationByToken: vi.fn(),
    isInvitationConsumable: vi.fn(),
    listInvitations: vi.fn(),
    markInvitationAccepted: vi.fn(),
    revokeInvitation: vi.fn(),
  };
});

vi.mock("../src/lib/email.js", () => ({
  sendMemberInviteEmail: vi.fn().mockResolvedValue(undefined),
  EmailQuotaError: class extends Error {},
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

async function buildApp(role: "owner" | "admin" | "member" | "pm" = "admin") {
  const app = Fastify({ logger: false });
  const dbQuery = vi.fn(async () => []);
  const dbQueryTenant = vi.fn(async () => []);
  app.decorate("db", {
    query: dbQuery,
    queryTenant: dbQueryTenant,
    tx: vi.fn(async (fn: (c: { query: typeof dbQuery }) => unknown) =>
      fn({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) as unknown as typeof dbQuery }),
    ),
  } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user = {
      tenantId: TENANT,
      userId: USER,
      role,
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
  await app.register(invitationsRoutes, { prefix: "/orgs/invitations" });
  await app.ready();
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /orgs/invitations", () => {
  it("admin creates invitation and returns invite URL with raw token", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(invitationsLib.createInvitation).mockResolvedValue({
      invitation: {
        id: "inv1",
        tenantId: TENANT,
        email: "x@y.com",
        role: "member",
        status: "pending",
        invitedByUserId: USER,
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        acceptedAt: null,
        acceptedByUserId: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
      rawToken: "tok-raw-123",
    });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "member" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { invitation: { id: string }; inviteUrl: string };
    expect(body.invitation.id).toBe("inv1");
    expect(body.inviteUrl).toContain("tok-raw-123");
  });

  it("member is forbidden", async () => {
    const app = await buildApp("member");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "member" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects role=owner in the invite schema", async () => {
    const app = await buildApp("owner");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "owner" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects role=viewer", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: { email: "x@y.com", role: "viewer" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /orgs/invitations/:token (public preview)", () => {
  it("returns preview for a pending unexpired invitation", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(invitationsLib.findPendingInvitationByToken).mockResolvedValue({
      id: "inv1",
      tenantId: TENANT,
      email: "x@y.com",
      role: "member",
      status: "pending",
      invitedByUserId: USER,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    vi.mocked(invitationsLib.isInvitationConsumable).mockReturnValue(true);
    (app.db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ name: "Acme", slug: "acme" }]);
    const res = await app.inject({ method: "GET", url: "/orgs/invitations/rawtok12345" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: "x@y.com", tenantName: "Acme" });
  });

  it("returns 410 invite_revoked when invitation is revoked", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(invitationsLib.findPendingInvitationByToken).mockResolvedValue({
      id: "inv1",
      tenantId: TENANT,
      email: "x@y.com",
      role: "member",
      status: "revoked",
      invitedByUserId: USER,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    vi.mocked(invitationsLib.isInvitationConsumable).mockReturnValue(false);
    const res = await app.inject({ method: "GET", url: "/orgs/invitations/rawtok12345" });
    expect(res.statusCode).toBe(410);
    expect((res.json() as { code: string }).code).toBe("invite_revoked");
  });

  it("returns 404 for unknown token", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(invitationsLib.findPendingInvitationByToken).mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/orgs/invitations/unknowntok12" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /orgs/invitations/:id/revoke", () => {
  it("admin revokes a pending invitation", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(invitationsLib.revokeInvitation).mockResolvedValue(true);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revoke",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ revoked: true });
  });

  it("member cannot revoke", async () => {
    const app = await buildApp("member");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revoke",
    });
    expect(res.statusCode).toBe(403);
  });
});
