import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { Db } from "@larry/db";
import { writeAuditLog } from "../src/lib/audit.js";
import { folderRoutes } from "../src/routes/v1/folders.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const FOLDER_ID = "44444444-4444-4444-8444-444444444444";

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
  await app.register(folderRoutes, { prefix: "/folders" });
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

describe("Folder routes", () => {
  it("lists root folders (parentId IS NULL)", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("parent_id IS NULL")) {
        return [
          {
            id: FOLDER_ID,
            tenantId: TENANT_ID,
            projectId: null,
            parentId: null,
            name: "Company Docs",
            folderType: "company",
            depth: 0,
            sortOrder: 0,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/folders",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.folders).toHaveLength(1);
    expect(body.folders[0]).toMatchObject({
      id: FOLDER_ID,
      name: "Company Docs",
      parentId: null,
    });
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("parent_id IS NULL"),
      [TENANT_ID]
    );
  });

  it("lists subfolders by parentId", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("parent_id = $2")) {
        return [
          {
            id: "sub-1",
            tenantId: TENANT_ID,
            projectId: null,
            parentId: PARENT_FOLDER_ID,
            name: "Sub Folder",
            folderType: "company",
            depth: 1,
            sortOrder: 0,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: `/folders?parentId=${PARENT_FOLDER_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.folders).toHaveLength(1);
    expect(body.folders[0]).toMatchObject({
      id: "sub-1",
      parentId: PARENT_FOLDER_ID,
    });
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("parent_id = $2"),
      [TENANT_ID, PARENT_FOLDER_ID]
    );
  });

  it("creates a folder", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO folders")) {
        return [
          {
            id: "new-folder-id",
            tenantId: TENANT_ID,
            projectId: null,
            parentId: null,
            name: "New Folder",
            folderType: "company",
            depth: 0,
            sortOrder: 0,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/folders",
      payload: {
        name: "New Folder",
        folderType: "company",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      folder: {
        id: "new-folder-id",
        name: "New Folder",
        folderType: "company",
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "folder.create",
        objectType: "folder",
        objectId: "new-folder-id",
      })
    );
  });

  it("rejects folder creation exceeding depth 4", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT depth FROM folders")) {
        return [{ depth: 4 }];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/folders",
      payload: {
        name: "Too Deep",
        parentId: PARENT_FOLDER_ID,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: "Maximum folder nesting depth (5 levels) exceeded.",
    });
    const insertCalls = queryTenant.mock.calls.filter((call) =>
      String(call[1]).includes("INSERT INTO folders")
    );
    expect(insertCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("renames a folder", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id, folder_type")) {
        return [{ id: FOLDER_ID, folderType: "company" }];
      }
      if (sql.includes("UPDATE folders SET name")) {
        return [{ id: FOLDER_ID, name: "Renamed Folder" }];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "PATCH",
      url: `/folders/${FOLDER_ID}`,
      payload: {
        name: "Renamed Folder",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      folder: {
        id: FOLDER_ID,
        name: "Renamed Folder",
      },
    });
  });

  it("blocks deletion of general folder", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id, folder_type")) {
        return [{ id: FOLDER_ID, folderType: "general", parentId: null }];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "DELETE",
      url: `/folders/${FOLDER_ID}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Cannot delete the General folder.",
    });
    const deleteCalls = queryTenant.mock.calls.filter((call) =>
      String(call[1]).includes("DELETE FROM folders")
    );
    expect(deleteCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("blocks deletion of project root folder", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("SELECT id, folder_type")) {
        return [{ id: FOLDER_ID, folderType: "project", parentId: null }];
      }
      return [];
    });
    const app = await createTestApp(queryTenant);
    appsToClose.push(app);

    const response = await app.inject({
      method: "DELETE",
      url: `/folders/${FOLDER_ID}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      message: "Cannot delete a project root folder.",
    });
    const deleteCalls = queryTenant.mock.calls.filter((call) =>
      String(call[1]).includes("DELETE FROM folders")
    );
    expect(deleteCalls).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
