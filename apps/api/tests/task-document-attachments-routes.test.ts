import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { taskRoutes } from "../src/routes/v1/tasks.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";

async function createTestApp(queryTenant: ReturnType<typeof vi.fn>) {
  const app = Fastify({ logger: false });

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
  await app.register(taskRoutes, { prefix: "/tasks" });
  await app.ready();
  return app;
}

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Task document attachment routes", () => {
  it("lists task attachments", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM tasks")) {
        return [{ id: TASK_ID }];
      }
      if (sql.includes("FROM task_document_attachments")) {
        return [
          {
            id: "attach-1",
            taskId: TASK_ID,
            documentId: DOCUMENT_ID,
            createdAt: "2026-03-30T12:00:00.000Z",
            title: "Q2 Launch Brief Template",
            docType: "docx_template",
            projectId: PROJECT_ID,
            sourceKind: "template",
            sourceRecordId: "seed-template-docx",
            version: 1,
            metadata: { format: "docx" },
            documentCreatedAt: "2026-03-30T11:50:00.000Z",
            documentUpdatedAt: "2026-03-30T11:50:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/tasks/${TASK_ID}/attachments`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          id: "attach-1",
          taskId: TASK_ID,
          documentId: DOCUMENT_ID,
          title: "Q2 Launch Brief Template",
        },
      ],
    });
  });

  it("attaches an existing document to a task", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM tasks")) {
        return [{ id: TASK_ID, project_id: PROJECT_ID }];
      }
      if (sql.includes("FROM documents")) {
        return [{ id: DOCUMENT_ID, project_id: PROJECT_ID }];
      }
      if (sql.includes("INSERT INTO task_document_attachments")) {
        return [
          {
            id: "attach-2",
            taskId: TASK_ID,
            documentId: DOCUMENT_ID,
            createdAt: "2026-03-30T12:05:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/tasks/${TASK_ID}/attachments`,
      payload: {
        documentId: DOCUMENT_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      attachment: {
        id: "attach-2",
        taskId: TASK_ID,
        documentId: DOCUMENT_ID,
      },
      duplicate: false,
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "task.document.attach",
        objectType: "task_document_attachment",
      })
    );
  });

  it("returns duplicate=true when attachment already exists", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM tasks")) {
        return [{ id: TASK_ID, project_id: PROJECT_ID }];
      }
      if (sql.includes("FROM documents")) {
        return [{ id: DOCUMENT_ID, project_id: PROJECT_ID }];
      }
      if (sql.includes("INSERT INTO task_document_attachments")) {
        return [];
      }
      if (sql.includes("WHERE tenant_id = $1") && sql.includes("AND task_id = $2")) {
        return [
          {
            id: "attach-existing",
            taskId: TASK_ID,
            documentId: DOCUMENT_ID,
            createdAt: "2026-03-30T12:06:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/tasks/${TASK_ID}/attachments`,
      payload: {
        documentId: DOCUMENT_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      attachment: {
        id: "attach-existing",
      },
      duplicate: true,
    });
  });

  it("blocks attachment writes when the task project is archived", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("JOIN projects")) {
        return [{ taskId: TASK_ID, projectId: PROJECT_ID, projectStatus: "archived" }];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/tasks/${TASK_ID}/attachments`,
      payload: {
        documentId: DOCUMENT_ID,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      message: "Archived projects are read-only. Unarchive the project before making changes.",
    });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
