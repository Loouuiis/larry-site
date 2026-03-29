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
import { createSignedStateToken } from "../src/services/connectors/slack.js";
import { googleCalendarConnectorRoutes } from "../src/routes/v1/connectors-google-calendar.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const CHANNEL_ID = "calendar-channel-1";
const JWT_SECRET = "calendar-test-secret";

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
}) {
  const app = Fastify({ logger: false });

  app.decorate("db", params.db);
  app.decorate("queue", params.queue);
  app.decorate(
    "config",
    {
      MODEL_PROVIDER: "mock",
      JWT_ACCESS_SECRET: JWT_SECRET,
      GOOGLE_OAUTH_STATE_TTL_SECONDS: 600,
      GOOGLE_CALENDAR_SCOPES: "https://www.googleapis.com/auth/calendar.events",
    } as unknown as ApiEnv
  );
  app.decorate("authenticate", async () => undefined);
  app.decorate("requireRole", () => async () => undefined);

  await app.register(sensible);
  await app.register(googleCalendarConnectorRoutes, { prefix: "/connectors/google-calendar" });
  await app.ready();
  return app;
}

describe("POST /connectors/google-calendar/webhook", () => {
  it("accepts tokened webhook callbacks and publishes canonical_event.created with project hint payload", async () => {
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return {
          rows: [
            {
              id: INSTALLATION_ID,
              tenant_id: TENANT_ID,
              google_calendar_id: "primary",
              google_access_token: "access-token",
              google_refresh_token: null,
              token_expires_at: null,
              webhook_channel_id: CHANNEL_ID,
              webhook_resource_id: "resource-1",
              webhook_expiration: null,
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO raw_events")) {
        return { rows: [{ id: "raw-event-1" }] };
      }
      if (sql.includes("INSERT INTO canonical_events")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const db = {
      tx: vi.fn(async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);

    const channelToken = createSignedStateToken(
      { k: "gcalch", t: TENANT_ID, i: INSTALLATION_ID },
      JWT_SECRET,
      600
    );

    const response = await app.inject({
      method: "POST",
      url: "/connectors/google-calendar/webhook",
      headers: {
        "content-type": "application/json",
        "x-goog-channel-id": CHANNEL_ID,
        "x-goog-resource-state": "exists",
        "x-goog-message-number": "42",
        "x-goog-resource-id": "resource-1",
        "x-goog-channel-token": channelToken,
      },
      payload: {
        projectId: PROJECT_ID,
        event: {
          summary: "Launch sync",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      canonicalEventId: expect.any(String),
      idempotencyKey: expect.any(String),
    });

    const rawInsertCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO raw_events")
    );
    const canonicalPayload = JSON.parse(String(rawInsertCall?.[1]?.[3] ?? "{}"));
    expect(canonicalPayload).toMatchObject({
      channelId: CHANNEL_ID,
      resourceState: "exists",
      messageNumber: "42",
      resourceId: "resource-1",
      projectId: PROJECT_ID,
      body: {
        projectId: PROJECT_ID,
      },
    });

    expect(queue.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "canonical_event.created",
        tenantId: TENANT_ID,
        payload: expect.objectContaining({
          canonicalEventId: body.canonicalEventId,
          source: "calendar",
        }),
      })
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actionType: "ingest.calendar.webhook",
        objectType: "canonical_event",
        objectId: body.canonicalEventId,
      })
    );
  });

  it("rejects webhook callbacks when channel token is missing", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM google_calendar_installations")) {
        return {
          rows: [
            {
              id: INSTALLATION_ID,
              tenant_id: TENANT_ID,
              google_calendar_id: "primary",
              google_access_token: "access-token",
              google_refresh_token: null,
              token_expires_at: null,
              webhook_channel_id: CHANNEL_ID,
              webhook_resource_id: "resource-1",
              webhook_expiration: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const db = {
      tx: vi.fn(async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query })),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/connectors/google-calendar/webhook",
      headers: {
        "x-goog-channel-id": CHANNEL_ID,
        "x-goog-resource-state": "exists",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toContain("Missing Google channel token.");
    expect(queue.publish).not.toHaveBeenCalled();
  });
});
