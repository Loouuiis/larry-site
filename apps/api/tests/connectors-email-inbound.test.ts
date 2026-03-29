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
import { emailConnectorRoutes } from "../src/routes/v1/connectors-email.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const WEBHOOK_SECRET = "super-secret";

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
  await app.register(emailConnectorRoutes, { prefix: "/connectors/email" });
  await app.ready();
  return app;
}

describe("POST /connectors/email/inbound", () => {
  it("accepts projectId and publishes canonical_event.created with canonical payload intact", async () => {
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT tenant_id, webhook_secret")) {
        return { rows: [{ tenant_id: TENANT_ID, webhook_secret: WEBHOOK_SECRET }] };
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

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/inbound",
      headers: {
        "x-larry-email-secret": WEBHOOK_SECRET,
      },
      payload: {
        accountEmail: "alerts@example.com",
        messageId: "email-msg-001",
        from: "ops@example.com",
        subject: "Launch prep follow-up",
        bodyText: "Please follow up on the launch prep checklist.",
        projectId: PROJECT_ID,
        threadId: "thread-1",
        occurredAt: "2026-03-29T11:15:00.000Z",
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
      accountEmail: "alerts@example.com",
      from: "ops@example.com",
      subject: "Launch prep follow-up",
      bodyText: "Please follow up on the launch prep checklist.",
      projectId: PROJECT_ID,
      threadId: "thread-1",
    });

    expect(queue.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "canonical_event.created",
        tenantId: TENANT_ID,
        payload: expect.objectContaining({
          canonicalEventId: body.canonicalEventId,
          source: "email",
        }),
      })
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actionType: "ingest.email.webhook",
        objectType: "canonical_event",
        objectId: body.canonicalEventId,
      })
    );
  });
});

