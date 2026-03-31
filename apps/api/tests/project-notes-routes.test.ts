import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import {
  createProjectNote,
  isProjectCollaborator,
  listProjectNotesForUser,
} from "../src/lib/project-notes.js";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";
import { projectRoutes } from "../src/routes/v1/projects.js";

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

vi.mock("../src/lib/project-notes.js", () => ({
  createProjectNote: vi.fn(),
  isProjectCollaborator: vi.fn(),
  listProjectNotesForUser: vi.fn(),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";

async function createTestApp() {
  const app = Fastify({ logger: false });
  const queryTenant = vi.fn().mockResolvedValue([]);

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

  vi.mocked(listProjectNotesForUser).mockResolvedValue([
    {
      id: "note-1",
      projectId: PROJECT_ID,
      authorUserId: USER_ID,
      authorName: "pm",
      visibility: "shared",
      recipientUserId: null,
      recipientName: null,
      content: "Shared update for the team.",
      sourceKind: "manual",
      sourceRecordId: null,
      createdAt: "2026-03-30T09:00:00.000Z",
      updatedAt: "2026-03-30T09:00:00.000Z",
    },
    {
      id: "note-2",
      projectId: PROJECT_ID,
      authorUserId: USER_ID,
      authorName: "pm",
      visibility: "personal",
      recipientUserId: OTHER_USER_ID,
      recipientName: "alex",
      content: "Personal follow-up note.",
      sourceKind: "manual",
      sourceRecordId: null,
      createdAt: "2026-03-30T10:00:00.000Z",
      updatedAt: "2026-03-30T10:00:00.000Z",
    },
  ]);

  vi.mocked(createProjectNote).mockResolvedValue({
    id: "note-new",
    projectId: PROJECT_ID,
    authorUserId: USER_ID,
    authorName: "pm",
    visibility: "shared",
    recipientUserId: null,
    recipientName: null,
    content: "Shared note body",
    sourceKind: "manual",
    sourceRecordId: null,
    createdAt: "2026-03-30T11:00:00.000Z",
    updatedAt: "2026-03-30T11:00:00.000Z",
  });

  vi.mocked(isProjectCollaborator).mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Project notes routes", () => {
  it("lists notes with visibility filter for the caller", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/notes?visibility=all&limit=20`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: PROJECT_ID,
      visibility: "all",
      notes: [{ id: "note-1" }, { id: "note-2", visibility: "personal" }],
    });
    expect(listProjectNotesForUser).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      USER_ID,
      { visibility: "all", limit: 20 }
    );
  });

  it("blocks notes list when caller lacks read access", async () => {
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
      url: `/projects/${PROJECT_ID}/notes`,
    });

    expect(response.statusCode).toBe(403);
    expect(listProjectNotesForUser).not.toHaveBeenCalled();
  });

  it("creates a shared note and writes audit metadata", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/notes`,
      payload: {
        visibility: "shared",
        content: "Shared note body",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      note: {
        id: "note-new",
        visibility: "shared",
      },
    });
    expect(createProjectNote).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        projectId: PROJECT_ID,
        authorUserId: USER_ID,
        visibility: "shared",
        recipientUserId: null,
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "project.note.created",
      })
    );
  });

  it("rejects personal note create without recipientUserId", async () => {
    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/notes`,
      payload: {
        visibility: "personal",
        content: "Follow up by EOD",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(createProjectNote).not.toHaveBeenCalled();
  });

  it("rejects personal note create when recipient is not a collaborator", async () => {
    vi.mocked(isProjectCollaborator).mockResolvedValue(false);

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/notes`,
      payload: {
        visibility: "personal",
        recipientUserId: OTHER_USER_ID,
        content: "Follow up by EOD",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(createProjectNote).not.toHaveBeenCalled();
  });

  it("keeps archived project note reads available by direct project scope", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "archived",
      projectRole: "viewer",
      canRead: true,
      canManage: false,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/projects/${PROJECT_ID}/notes`,
    });

    expect(response.statusCode).toBe(200);
    expect(listProjectNotesForUser).toHaveBeenCalledTimes(1);
  });

  it("blocks note creation when the project is archived", async () => {
    vi.mocked(getProjectMembershipAccess).mockResolvedValue({
      projectExists: true,
      projectStatus: "archived",
      projectRole: "owner",
      canRead: true,
      canManage: true,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/notes`,
      payload: {
        visibility: "shared",
        content: "Shared note body",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "Archived projects are read-only. Unarchive the project before making changes.",
    });
    expect(createProjectNote).not.toHaveBeenCalled();
  });
});
