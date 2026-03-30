import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { getProjectMembershipAccess } from "../src/lib/project-memberships.js";
import { documentRoutes } from "../src/routes/v1/documents.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  getProjectMembershipAccess: vi.fn(),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "55555555-5555-4555-8555-555555555555";

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
  await app.register(documentRoutes, { prefix: "/documents" });
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
});

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

describe("Document routes", () => {
  it("lists documents with project and docType filters", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM documents d")) {
        return [
          {
            id: "doc-1",
            projectId: PROJECT_ID,
            title: "Q2 Launch Brief Template",
            content: "# Q2 Launch Brief",
            docType: "docx_template",
            sourceKind: "template",
            sourceRecordId: "seed-template-docx",
            version: 1,
            metadata: { format: "docx" },
            createdByUserId: USER_ID,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/documents?projectId=${PROJECT_ID}&docType=docx_template&limit=10`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          id: "doc-1",
          projectId: PROJECT_ID,
          docType: "docx_template",
        },
      ],
    });
    expect(getProjectMembershipAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        userId: USER_ID,
      })
    );
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("FROM documents d"),
      expect.arrayContaining([PROJECT_ID, "docx_template", 10])
    );
  });

  it("creates a document asset", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO documents")) {
        return [
          {
            id: "doc-new",
            projectId: PROJECT_ID,
            title: "Project Brief",
            content: "Template body",
            docType: "docx_template",
            sourceKind: "template",
            sourceRecordId: "template-1",
            version: 1,
            metadata: { format: "docx" },
            createdByUserId: USER_ID,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/documents",
      payload: {
        projectId: PROJECT_ID,
        title: "Project Brief",
        content: "Template body",
        docType: "docx_template",
        sourceKind: "template",
        sourceRecordId: "template-1",
        metadata: { format: "docx" },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      document: {
        id: "doc-new",
        projectId: PROJECT_ID,
      },
      attachment: null,
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "document.create",
        objectType: "document",
        objectId: "doc-new",
      })
    );
  });

  it("creates and attaches a document when attachTaskId is provided", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM tasks")) {
        return [{ id: TASK_ID, project_id: PROJECT_ID }];
      }
      if (sql.includes("INSERT INTO documents")) {
        return [
          {
            id: "doc-new",
            projectId: PROJECT_ID,
            title: "Launch Milestones",
            content: "Sheet: Milestones",
            docType: "xlsx_template",
            sourceKind: "template",
            sourceRecordId: "template-2",
            version: 1,
            metadata: { format: "xlsx" },
            createdByUserId: USER_ID,
            createdAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
          },
        ];
      }
      if (sql.includes("INSERT INTO task_document_attachments")) {
        return [
          {
            id: "attach-1",
            taskId: TASK_ID,
            documentId: "doc-new",
            createdAt: "2026-03-30T10:01:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/documents",
      payload: {
        projectId: PROJECT_ID,
        title: "Launch Milestones",
        content: "Sheet: Milestones",
        docType: "xlsx_template",
        sourceKind: "template",
        sourceRecordId: "template-2",
        metadata: { format: "xlsx" },
        attachTaskId: TASK_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      document: {
        id: "doc-new",
      },
      attachment: {
        id: "attach-1",
        taskId: TASK_ID,
        documentId: "doc-new",
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "task.document.attach",
        objectType: "task_document_attachment",
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "document.create",
      })
    );
  });

  it("rejects create+attach when the task is from another project", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM tasks")) {
        return [{ id: TASK_ID, project_id: OTHER_PROJECT_ID }];
      }
      if (sql.includes("INSERT INTO documents")) {
        return [
          {
            id: "doc-should-not-create",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/documents",
      payload: {
        projectId: PROJECT_ID,
        title: "Cross-project attachment attempt",
        content: "Invalid attachment",
        docType: "docx_template",
        attachTaskId: TASK_ID,
      },
    });

    expect(response.statusCode).toBe(409);
    const insertDocumentCalls = queryTenant.mock.calls.filter((call) =>
      String(call[1]).includes("INSERT INTO documents")
    );
    expect(insertDocumentCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
