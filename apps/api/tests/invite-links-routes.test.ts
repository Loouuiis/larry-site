import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { inviteLinksRoutes } from "../src/routes/v1/invite-links.js";
import * as inviteLinksLib from "../src/lib/invite-links.js";
import * as projectMembershipsLib from "../src/lib/project-memberships.js";

vi.mock("../src/lib/invite-links.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/invite-links.js")>(
    "../src/lib/invite-links.js",
  );
  return {
    ...actual,
    createInviteLink: vi.fn(),
    findInviteLinkByToken: vi.fn(),
    listInviteLinks: vi.fn(),
    revokeInviteLink: vi.fn(),
    reserveInviteLinkUse: vi.fn(),
  };
});

vi.mock("../src/lib/project-memberships.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/project-memberships.js")>(
      "../src/lib/project-memberships.js",
    );
  return {
    ...actual,
    getProjectMembershipAccess: vi.fn(),
  };
});

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/seat-cap.js", () => ({
  assertSeatAvailable: vi.fn().mockResolvedValue(undefined),
  SeatCapReachedError: class extends Error {},
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const LINK_ID = "44444444-4444-4444-8444-444444444444";

async function buildApp(role: "owner" | "admin" | "member" | "pm" = "admin") {
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
  // Minimal config decorator for issueAccessToken ttl lookup during redeem.
  app.decorate("config", { ACCESS_TOKEN_TTL: "15m", REFRESH_TOKEN_TTL: "30d" } as never);
  await app.register(jwt, { secret: "test-secret-minimum-length-for-jwt-xxxx" });
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user = {
      tenantId: TENANT,
      userId: USER,
      role,
      email: "a@x.com",
    };
  });
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
  await app.register(inviteLinksRoutes, { prefix: "/orgs/invite-links" });
  await app.ready();
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

const sampleLink = (overrides: Partial<Awaited<ReturnType<typeof inviteLinksLib.findInviteLinkByToken>>> = {}) => ({
  id: LINK_ID,
  tenantId: TENANT,
  createdByUserId: USER,
  defaultRole: "member" as const,
  defaultProjectId: null,
  defaultProjectRole: null,
  maxUses: null,
  usesCount: 0,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("POST /orgs/invite-links (create)", () => {
  it("admin creates an unscoped link and receives a redeem URL", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(inviteLinksLib.createInviteLink).mockResolvedValue({
      link: sampleLink(),
      rawToken: "share-token-abc",
    });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invite-links",
      payload: { defaultRole: "member", expiresInDays: 7 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { url: string };
    expect(body.url).toContain("share-token-abc");
    expect(vi.mocked(projectMembershipsLib.getProjectMembershipAccess)).not.toHaveBeenCalled();
  });

  it("admin scoping to a project triggers project access check", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(projectMembershipsLib.getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "active",
      projectRole: null,
      canRead: true,
      canManage: true,
    });
    vi.mocked(inviteLinksLib.createInviteLink).mockResolvedValue({
      link: sampleLink({ defaultProjectId: PROJECT, defaultProjectRole: "editor" }),
      rawToken: "share-token-scoped",
    });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invite-links",
      payload: {
        defaultRole: "member",
        defaultProjectId: PROJECT,
        defaultProjectRole: "editor",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("member is forbidden from creating links", async () => {
    const app = await buildApp("member");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invite-links",
      payload: { defaultRole: "member" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects mismatched default project pair", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invite-links",
      payload: { defaultRole: "member", defaultProjectId: PROJECT },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /orgs/invite-links/:id/revoke", () => {
  it("admin revokes an active link", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(inviteLinksLib.revokeInviteLink).mockResolvedValue(true);
    const res = await app.inject({
      method: "POST",
      url: `/orgs/invite-links/${LINK_ID}/revoke`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ revoked: true });
  });

  it("revoking a missing link returns 404", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(inviteLinksLib.revokeInviteLink).mockResolvedValue(false);
    const res = await app.inject({
      method: "POST",
      url: `/orgs/invite-links/${LINK_ID}/revoke`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /orgs/invite-links/by-token/:token (public preview)", () => {
  it("returns preview with remaining uses for a usable link", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.findInviteLinkByToken).mockResolvedValue(
      sampleLink({ maxUses: 5, usesCount: 2 }),
    );
    (app.db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "Acme", slug: "acme" },
    ]);
    const res = await app.inject({
      method: "GET",
      url: "/orgs/invite-links/by-token/share-token-abc",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { usesRemaining: number; tenantName: string };
    expect(body.usesRemaining).toBe(3);
    expect(body.tenantName).toBe("Acme");
  });

  it("returns 410 for a revoked link", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.findInviteLinkByToken).mockResolvedValue(
      sampleLink({ revokedAt: new Date().toISOString() }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/orgs/invite-links/by-token/share-token-abc",
    });
    expect(res.statusCode).toBe(410);
    expect((res.json() as { code: string }).code).toBe("invite_link_revoked");
  });

  it("returns 410 for an expired link", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.findInviteLinkByToken).mockResolvedValue(
      sampleLink({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/orgs/invite-links/by-token/share-token-abc",
    });
    expect(res.statusCode).toBe(410);
    expect((res.json() as { code: string }).code).toBe("invite_link_expired");
  });

  it("returns 410 for an exhausted link", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.findInviteLinkByToken).mockResolvedValue(
      sampleLink({ maxUses: 2, usesCount: 2 }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/orgs/invite-links/by-token/share-token-abc",
    });
    expect(res.statusCode).toBe(410);
    expect((res.json() as { code: string }).code).toBe("invite_link_exhausted");
  });

  it("returns 404 for unknown token", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.findInviteLinkByToken).mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: "/orgs/invite-links/by-token/unknowntok12",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /orgs/invite-links/by-token/:token/redeem", () => {
  it("returns 410 when the atomic reservation fails", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(inviteLinksLib.reserveInviteLinkUse).mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invite-links/by-token/long-enough-token/redeem",
      payload: { email: "new@example.com", password: "LongPassword12!" },
    });
    expect(res.statusCode).toBe(410);
  });
});
