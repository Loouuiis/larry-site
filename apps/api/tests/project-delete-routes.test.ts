import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { projectRoutes } from "../src/routes/v1/projects.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

async function createTestApp(db: Db) {
  const app = Fastify({ logger: false });

  app.decorate("db", db);
  app.decorate("config", { MODEL_PROVIDER: "mock" } as unknown as ApiEnv);
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

describe("Project hard-delete route", () => {
  it("returns 404 when the project does not exist", async () => {
    const queryTenant = vi.fn().mockResolvedValue([]);
    const tx = vi.fn();
    const app = await createTestApp({ queryTenant, tx } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/delete`,
      payload: { confirmProjectName: "Alpha Launch" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ message: "Project not found." });
    expect(tx).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("deletes an active project when confirmProjectName matches", async () => {
    const queryTenant = vi.fn().mockResolvedValue([
      {
        id: PROJECT_ID,
        name: "Alpha Launch",
        status: "active",
      },
    ]);
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("DELETE FROM meeting_notes")) {
        return { rows: [{ row_count: 0 }] };
      }
      if (sql.includes("DELETE FROM documents")) {
        return { rows: [{ row_count: 0 }] };
      }
      if (sql.includes("DELETE FROM email_outbound_drafts")) {
        return { rows: [{ row_count: 0 }] };
      }
      if (sql.includes("DELETE FROM larry_conversations")) {
        return { rows: [{ row_count: 0 }] };
      }
      if (sql.includes("DELETE FROM projects")) {
        return { rows: [{ id: PROJECT_ID }] };
      }
      return { rows: [] };
    });
    const tx = vi.fn(async (fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
      fn({ query: clientQuery })
    );
    const app = await createTestApp({ queryTenant, tx } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/delete`,
      payload: { confirmProjectName: "Alpha Launch" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: PROJECT_ID, deleted: true });
    expect(tx).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "project.delete",
        details: expect.objectContaining({
          previousStatus: "active",
        }),
      })
    );
  });

  it("returns 409 when confirmProjectName does not exactly match", async () => {
    const queryTenant = vi.fn().mockResolvedValue([
      {
        id: PROJECT_ID,
        name: "Alpha Launch",
        status: "archived",
      },
    ]);
    const tx = vi.fn();
    const app = await createTestApp({ queryTenant, tx } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/delete`,
      payload: { confirmProjectName: "alpha launch" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "confirmProjectName must exactly match the current project name.",
    });
    expect(tx).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("purges project-owned records, deletes the project, and writes audit metadata", async () => {
    const queryTenant = vi.fn().mockResolvedValue([
      {
        id: PROJECT_ID,
        name: "Alpha Launch",
        status: "archived",
      },
    ]);
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("DELETE FROM meeting_notes")) {
        return { rows: [{ row_count: 2 }] };
      }
      if (sql.includes("DELETE FROM documents")) {
        return { rows: [{ row_count: 1 }] };
      }
      if (sql.includes("DELETE FROM email_outbound_drafts")) {
        return { rows: [{ row_count: 3 }] };
      }
      if (sql.includes("DELETE FROM larry_conversations")) {
        return { rows: [{ row_count: 4 }] };
      }
      if (sql.includes("DELETE FROM projects")) {
        return { rows: [{ id: PROJECT_ID }] };
      }
      return { rows: [] };
    });
    const tx = vi.fn(async (fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
      fn({ query: clientQuery })
    );
    const app = await createTestApp({ queryTenant, tx } as unknown as Db);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/projects/${PROJECT_ID}/delete`,
      payload: { confirmProjectName: "Alpha Launch" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: PROJECT_ID,
      deleted: true,
    });
    expect(tx).toHaveBeenCalledTimes(1);
    expect(
      clientQuery.mock.calls.some((call) => String(call[0]).includes("DELETE FROM meeting_notes"))
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some((call) => String(call[0]).includes("DELETE FROM documents"))
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some((call) => String(call[0]).includes("DELETE FROM email_outbound_drafts"))
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some((call) => String(call[0]).includes("DELETE FROM larry_conversations"))
    ).toBe(true);
    expect(
      clientQuery.mock.calls.some((call) => String(call[0]).includes("DELETE FROM projects"))
    ).toBe(true);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "project.delete",
        objectType: "project",
        objectId: PROJECT_ID,
        details: expect.objectContaining({
          previousStatus: "archived",
          projectName: "Alpha Launch",
          purgedCounts: {
            meetingNotesPurged: 2,
            documentsPurged: 1,
            emailDraftsPurged: 3,
            conversationsPurged: 4,
          },
        }),
      })
    );
  });
});
