import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { projectRoutes } from "../src/routes/v1/projects.js";
import {
  countProjectOwners,
  createProjectOwnerMembership,
  deleteProjectMembership,
  getProjectMembershipAccess,
  getProjectMembershipRole,
  hasTenantMembership,
  listProjectMembers,
  upsertProjectMembership,
} from "../src/lib/project-memberships.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  countProjectOwners: vi.fn(),
  createProjectOwnerMembership: vi.fn(),
  deleteProjectMembership: vi.fn(),
  getProjectMembershipAccess: vi.fn(),
  getProjectMembershipRole: vi.fn(),
  hasTenantMembership: vi.fn(),
  listProjectMembers: vi.fn(),
  upsertProjectMembership: vi.fn(),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";

async function createTestApp(options?: { queryTenant?: ReturnType<typeof vi.fn> }) {
  const app = Fastify({ logger: false });
  const queryTenant = options?.queryTenant ?? vi.fn().mockResolvedValue([]);

  app.decorate(
    "db",
    {
      queryTenant,
    } as unknown as Db
  );

  app.decorate(
    "authenticate",
    async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
      (
        request as typeof request & {
          user: { tenantId: string; userId: string; role: "pm"; email: string };
        }
      ).user = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: "pm",
        email: "pm@example.com",
      };
    }
  );
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(projectRoutes, { prefix: "/projects" });
  await app.ready();

  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

beforeEach(() => {
  vi.mocked(getProjectMembershipAccess).mockResolvedValue({
    projectExists: true,
    projectRole: "owner",
    canRead: true,
    canManage: true,
  });
  vi.mocked(getProjectMembershipRole).mockResolvedValue("owner");
  vi.mocked(listProjectMembers).mockResolvedValue([
    {
      userId: USER_ID,
      name: "pm",
      email: "pm@example.com",
      tenantRole: "pm",
      projectRole: "owner",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    },
  ]);
  vi.mocked(hasTenantMembership).mockResolvedValue(true);
  vi.mocked(upsertProjectMembership).mockResolvedValue(undefined);
  vi.mocked(deleteProjectMembership).mockResolvedValue(true);
  vi.mocked(countProjectOwners).mockResolvedValue(2);
  vi.mocked(createProjectOwnerMembership).mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Project collaborator routes", () => {
  it("creates owner membership when creating a project", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO projects")) {
        return [{ id: PROJECT_ID }];
      }
      return [];
    });
    const app = await createTestApp({ queryTenant });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/projects",
      payload: {
        name: "Project from route",
        description: "Test route",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: PROJECT_ID });
    expect(createProjectOwnerMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      USER_ID
    );
  });

  it("lists project collaborators for readable projects", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectRole: "viewer",
      canRead: true,
      canManage: false,
    });
    vi.mocked(getProjectMembershipRole).mockResolvedValue("viewer");

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/members`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: PROJECT_ID,
      currentUserRole: "viewer",
      canManage: false,
      members: [{ userId: USER_ID, projectRole: "owner" }],
    });
  });

  it("adds a collaborator when actor has manage access and user belongs to tenant", async () => {
    vi.mocked(getProjectMembershipRole)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("owner");

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/members`,
      payload: { userId: OTHER_USER_ID, role: "viewer" },
    });

    expect(response.statusCode).toBe(200);
    expect(hasTenantMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      OTHER_USER_ID
    );
    expect(upsertProjectMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      OTHER_USER_ID,
      "viewer"
    );
  });

  it("updates collaborator role", async () => {
    vi.mocked(getProjectMembershipRole)
      .mockResolvedValueOnce("viewer")
      .mockResolvedValueOnce("owner");

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/projects/${PROJECT_ID}/members/${OTHER_USER_ID}`,
      payload: { role: "editor" },
    });

    expect(response.statusCode).toBe(200);
    expect(upsertProjectMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      OTHER_USER_ID,
      "editor"
    );
  });

  it("removes collaborator membership", async () => {
    vi.mocked(getProjectMembershipRole)
      .mockResolvedValueOnce("viewer")
      .mockResolvedValueOnce("owner");

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "DELETE",
      url: `/projects/${PROJECT_ID}/members/${OTHER_USER_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(deleteProjectMembership).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      OTHER_USER_ID
    );
  });

  it("rejects invalid role values", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/projects/${PROJECT_ID}/members/${OTHER_USER_ID}`,
      payload: { role: "not-a-role" },
    });

    expect(response.statusCode).toBe(400);
    expect(upsertProjectMembership).not.toHaveBeenCalled();
  });

  it("prevents demoting the last owner", async () => {
    vi.mocked(getProjectMembershipRole).mockResolvedValueOnce("owner");
    vi.mocked(countProjectOwners).mockResolvedValue(1);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/projects/${PROJECT_ID}/members/${OTHER_USER_ID}`,
      payload: { role: "viewer" },
    });

    expect(response.statusCode).toBe(409);
    expect(upsertProjectMembership).not.toHaveBeenCalled();
  });

  it("blocks membership reads when user lacks project access", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectRole: null,
      canRead: false,
      canManage: false,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/members`,
    });

    expect(response.statusCode).toBe(403);
    expect(listProjectMembers).not.toHaveBeenCalled();
  });

  it("enforces tenant membership on collaborator add", async () => {
    vi.mocked(hasTenantMembership).mockResolvedValue(false);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/members`,
      payload: { userId: OTHER_USER_ID, role: "viewer" },
    });

    expect(response.statusCode).toBe(404);
    expect(upsertProjectMembership).not.toHaveBeenCalled();
  });
});
