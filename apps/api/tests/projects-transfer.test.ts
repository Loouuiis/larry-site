import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";
import type { Db } from "@larry/db";
import { projectRoutes } from "../src/routes/v1/projects.js";
import * as pm from "../src/lib/project-memberships.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-memberships.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/project-memberships.js")>(
    "../src/lib/project-memberships.js",
  );
  return {
    ...actual,
    getProjectMembershipRole: vi.fn(),
    hasTenantMembership: vi.fn(),
  };
});

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const NEW_OWNER = "44444444-4444-4444-8444-444444444444";

async function buildApp(role: "owner" | "admin" | "member" | "pm") {
  const app = Fastify({ logger: false });
  app.decorate("db", {
    query: vi.fn(async () => []),
    queryTenant: vi.fn(async () => []),
    tx: vi.fn(async (fn: (c: { query: unknown }) => unknown) =>
      fn({ query: async () => ({ rows: [], rowCount: 1 }) }),
    ),
  } as unknown as Db);
  app.decorate("authenticate", async (req: Parameters<(typeof app)["authenticate"]>[0]) => {
    (req as unknown as { user: { tenantId: string; userId: string; role: string; email: string } }).user =
      { tenantId: TENANT, userId: USER, role, email: "u@x.com" };
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
  await app.register(projectRoutes, { prefix: "/projects" });
  await app.ready();
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
  vi.clearAllMocks();
});

describe("POST /projects/:id/transfer", () => {
  it("org admin can transfer even without project membership", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(pm.hasTenantMembership).mockResolvedValue(true);
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT}/transfer`,
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projectId: PROJECT, newOwnerUserId: NEW_OWNER });
  });

  it("project owner (member role) can transfer", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(pm.getProjectMembershipRole).mockResolvedValue("owner");
    vi.mocked(pm.hasTenantMembership).mockResolvedValue(true);
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT}/transfer`,
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect(res.statusCode).toBe(200);
  });

  it("random member cannot transfer", async () => {
    const app = await buildApp("member");
    apps.push(app);
    vi.mocked(pm.getProjectMembershipRole).mockResolvedValue("viewer");
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT}/transfer`,
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects transfer to a non-member", async () => {
    const app = await buildApp("admin");
    apps.push(app);
    vi.mocked(pm.hasTenantMembership).mockResolvedValue(false);
    const res = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT}/transfer`,
      payload: { newOwnerUserId: NEW_OWNER },
    });
    expect(res.statusCode).toBe(400);
  });
});
