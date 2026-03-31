import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { QueuePublisher } from "../src/services/queue.js";
import { writeAuditLog } from "../src/lib/audit.js";
import { googleCalendarConnectorRoutes } from "../src/routes/v1/connectors-google-calendar.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

async function createTestApp(params: {
  db: Db;
  queue: QueuePublisher;
  role?: "admin" | "pm" | "member";
  authenticated?: boolean;
}) {
  const app = Fastify({ logger: false });

  app.decorate("db", params.db);
  app.decorate("queue", params.queue);
  app.decorate(
    "config",
    {
      MODEL_PROVIDER: "mock",
      JWT_ACCESS_SECRET: "calendar-project-link-secret",
      GOOGLE_OAUTH_STATE_TTL_SECONDS: 600,
      GOOGLE_CALENDAR_SCOPES: "https://www.googleapis.com/auth/calendar.events",
    } as unknown as ApiEnv
  );
  app.decorate(
    "authenticate",
    async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
      if (params.authenticated === false) {
        throw app.httpErrors.unauthorized("Unauthorized");
      }
      (
        request as typeof request & {
          user: { tenantId: string; userId: string; role: "admin" | "pm" | "member"; email: string };
        }
      ).user = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: params.role ?? "pm",
        email: "pm@larry.local",
      };
    }
  );
  app.decorate("requireRole", (allowed: string[]) => async (request) => {
    if (!allowed.includes(request.user.role)) {
      throw app.httpErrors.forbidden("Insufficient role.");
    }
  });

  await app.register(sensible);
  await app.register(googleCalendarConnectorRoutes, { prefix: "/connectors/google-calendar" });
  await app.ready();
  return app;
}

function createQueueMock(): QueuePublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueuePublisher;
}

describe("Google Calendar project-link routes", () => {
  it("requires authentication for reading project-link state", async () => {
    const db = {
      tx: vi.fn(),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock(), authenticated: false });
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/connectors/google-calendar/project-link?calendarId=primary",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns linked project state for an installed calendar", async () => {
    const db = {
      tx: vi.fn(),
      queryTenant: vi.fn(async (_tenantId: string, sql: string) => {
        if (sql.includes("FROM google_calendar_installations")) {
          return [
            {
              id: INSTALLATION_ID,
              tenant_id: TENANT_ID,
              project_id: PROJECT_ID,
              google_calendar_id: "primary",
              google_access_token: "access-token",
              google_refresh_token: null,
              token_expires_at: null,
              webhook_channel_id: null,
              webhook_resource_id: null,
              webhook_expiration: null,
            },
          ];
        }
        return [];
      }),
    } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/connectors/google-calendar/project-link?calendarId=primary",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      calendarId: "primary",
      projectId: PROJECT_ID,
      linked: true,
    });
  });

  it("returns unlinked state when installation is missing", async () => {
    const db = {
      tx: vi.fn(),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/connectors/google-calendar/project-link?calendarId=primary",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      calendarId: "primary",
      projectId: null,
      linked: false,
    });
  });

  it("sets linked project when project exists in tenant scope", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: INSTALLATION_ID,
            tenant_id: TENANT_ID,
            project_id: null,
            google_calendar_id: "primary",
            google_access_token: "access-token",
            google_refresh_token: null,
            token_expires_at: null,
            webhook_channel_id: null,
            webhook_resource_id: null,
            webhook_expiration: null,
          },
        ];
      }
      if (sql.includes("FROM projects")) {
        return [{ id: PROJECT_ID }];
      }
      if (sql.includes("UPDATE google_calendar_installations")) {
        return [];
      }
      return [];
    });

    const db = { tx: vi.fn(), queryTenant } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/connectors/google-calendar/project-link",
      payload: {
        calendarId: "primary",
        projectId: PROJECT_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      calendarId: "primary",
      projectId: PROJECT_ID,
      linked: true,
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "connector.google_calendar.project_link.updated",
        objectType: "google_calendar_installation",
        objectId: INSTALLATION_ID,
        details: {
          calendarId: "primary",
          projectId: PROJECT_ID,
        },
      })
    );
  });

  it("clears linked project when projectId is null", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: INSTALLATION_ID,
            tenant_id: TENANT_ID,
            project_id: PROJECT_ID,
            google_calendar_id: "primary",
            google_access_token: "access-token",
            google_refresh_token: null,
            token_expires_at: null,
            webhook_channel_id: null,
            webhook_resource_id: null,
            webhook_expiration: null,
          },
        ];
      }
      if (sql.includes("UPDATE google_calendar_installations")) {
        return [];
      }
      return [];
    });

    const db = { tx: vi.fn(), queryTenant } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/connectors/google-calendar/project-link",
      payload: {
        calendarId: "primary",
        projectId: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      calendarId: "primary",
      projectId: null,
      linked: false,
    });
    expect(
      queryTenant.mock.calls.some(([, sql]) => String(sql).includes("FROM projects"))
    ).toBe(false);
  });

  it("returns 404 when linking to a non-tenant project", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: INSTALLATION_ID,
            tenant_id: TENANT_ID,
            project_id: null,
            google_calendar_id: "primary",
            google_access_token: "access-token",
            google_refresh_token: null,
            token_expires_at: null,
            webhook_channel_id: null,
            webhook_resource_id: null,
            webhook_expiration: null,
          },
        ];
      }
      if (sql.includes("FROM projects")) {
        return [];
      }
      return [];
    });

    const db = { tx: vi.fn(), queryTenant } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/connectors/google-calendar/project-link",
      payload: {
        calendarId: "primary",
        projectId: PROJECT_ID,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain("Project not found for this tenant.");
    expect(
      queryTenant.mock.calls.some(([, sql]) => String(sql).includes("UPDATE google_calendar_installations"))
    ).toBe(false);
  });

  it("returns 409 when linking Google Calendar to an archived project", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return [
          {
            id: INSTALLATION_ID,
            tenant_id: TENANT_ID,
            project_id: null,
            google_calendar_id: "primary",
            google_access_token: "access-token",
            google_refresh_token: null,
            token_expires_at: null,
            webhook_channel_id: null,
            webhook_resource_id: null,
            webhook_expiration: null,
          },
        ];
      }
      if (sql.includes("FROM projects")) {
        return [{ id: PROJECT_ID, name: "Archived Project", status: "archived" }];
      }
      return [];
    });

    const db = { tx: vi.fn(), queryTenant } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock() });
    appsToClose.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/connectors/google-calendar/project-link",
      payload: {
        calendarId: "primary",
        projectId: PROJECT_ID,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain(
      "Archived projects are read-only. Unarchive the project before making changes."
    );
    expect(
      queryTenant.mock.calls.some(([, sql]) => String(sql).includes("UPDATE google_calendar_installations"))
    ).toBe(false);
  });

  it("requires admin or pm role for project-link mutation", async () => {
    const db = {
      tx: vi.fn(),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const app = await createTestApp({ db, queue: createQueueMock(), role: "member" });
    appsToClose.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/connectors/google-calendar/project-link",
      payload: {
        calendarId: "primary",
        projectId: null,
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
