import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { invitationsRoutes } from "../src/routes/v1/invitations.js";
import * as invitationsLib from "../src/lib/invitations.js";
import * as projectMembershipsLib from "../src/lib/project-memberships.js";

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

vi.mock("../src/lib/email.js", () => ({
  sendMemberInviteEmail: vi.fn().mockResolvedValue(undefined),
  EmailQuotaError: class extends Error {},
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/seat-cap.js", () => ({
  assertSeatAvailable: vi.fn().mockResolvedValue(undefined),
  SeatCapReachedError: class extends Error {},
}));

vi.mock("../src/lib/mfa-gate.js", () => ({
  assertMfaIfRequired: vi.fn().mockResolvedValue(undefined),
  MfaEnrollmentRequiredError: class extends Error {},
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

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

describe("POST /orgs/invitations with project scope", () => {
  it("admin can invite someone directly into a project", async () => {
    const app = await buildApp("admin");
    apps.push(app);

    vi.mocked(projectMembershipsLib.getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "active",
      projectRole: null,
      canRead: true,
      canManage: true,
    });
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
        projectId: PROJECT,
        projectRole: "editor",
      },
      rawToken: "tok-raw-proj-1",
    });

    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: {
        email: "x@y.com",
        role: "member",
        projectId: PROJECT,
        projectRole: "editor",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(projectMembershipsLib.getProjectMembershipAccess)).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT, tenantId: TENANT }),
    );
    expect(vi.mocked(invitationsLib.createInvitation)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: PROJECT, projectRole: "editor" }),
    );
  });

  it("rejects project invite when inviter cannot manage the project", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(projectMembershipsLib.getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "active",
      projectRole: "viewer",
      canRead: true,
      canManage: false,
    });

    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: {
        email: "x@y.com",
        role: "member",
        projectId: PROJECT,
        projectRole: "editor",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(vi.mocked(invitationsLib.createInvitation)).not.toHaveBeenCalled();
  });

  it("rejects project invite when the project does not exist", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(projectMembershipsLib.getProjectMembershipAccess).mockResolvedValue({
      projectExists: false,
      projectStatus: null,
      projectRole: null,
      canRead: false,
      canManage: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: {
        email: "x@y.com",
        role: "member",
        projectId: PROJECT,
        projectRole: "editor",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects mismatched projectId/projectRole pair", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    const res = await app.inject({
      method: "POST",
      url: "/orgs/invitations",
      payload: {
        email: "x@y.com",
        role: "member",
        projectId: PROJECT,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /orgs/invitations/:token preview with project", () => {
  it("surfaces project name when invite is project-scoped", async () => {
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
      projectId: PROJECT,
      projectRole: "editor",
    });
    vi.mocked(invitationsLib.isInvitationConsumable).mockReturnValue(true);

    (app.db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "Acme", slug: "acme" },
    ]);
    (app.db.queryTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "Launch Plan" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/orgs/invitations/rawtok12345",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      projectName: string | null;
      projectRole: string | null;
      tenantName: string | null;
    };
    expect(body.tenantName).toBe("Acme");
    expect(body.projectName).toBe("Launch Plan");
    expect(body.projectRole).toBe("editor");
  });
});
