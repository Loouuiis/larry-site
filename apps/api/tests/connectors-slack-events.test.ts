import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { QueuePublisher } from "../src/services/queue.js";
import { writeAuditLog } from "../src/lib/audit.js";
import { slackConnectorRoutes } from "../src/routes/v1/connectors-slack.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const SLACK_SIGNING_SECRET = "slack-signing-secret";

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
      SLACK_SIGNING_SECRET,
      SLACK_SIGNATURE_TOLERANCE_SECONDS: 300,
    } as unknown as ApiEnv
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
  await app.register(slackConnectorRoutes, { prefix: "/connectors/slack" });
  await app.ready();
  return app;
}

describe("POST /connectors/slack/events", () => {
  it("accepts signed event callbacks and publishes canonical_event.created with Slack payload hints", async () => {
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT tenant_id FROM slack_installations")) {
        return { rows: [{ tenant_id: TENANT_ID }] };
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

    const payload = {
      type: "event_callback",
      team_id: "T12345",
      event_id: "Ev12345",
      event_time: 1710000000,
      event: {
        type: "message",
        channel: "C67890",
        user: "U12345",
        text: "We are blocked on legal review",
        projectId: PROJECT_ID,
      },
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;

    const response = await app.inject({
      method: "POST",
      url: "/connectors/slack/events",
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
      },
      payload: rawBody,
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
      teamId: "T12345",
      slackUserId: "U12345",
      channel: "C67890",
      text: "We are blocked on legal review",
      rawEvent: {
        channel: "C67890",
        user: "U12345",
        text: "We are blocked on legal review",
        type: "message",
        projectId: PROJECT_ID,
      },
    });

    expect(queue.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "canonical_event.created",
        tenantId: TENANT_ID,
        payload: expect.objectContaining({
          canonicalEventId: body.canonicalEventId,
          source: "slack",
        }),
      })
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actionType: "ingest.slack.webhook",
        objectType: "canonical_event",
        objectId: body.canonicalEventId,
      })
    );
  });
});

