import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import type { QueuePublisher } from "../src/services/queue.js";
import { emailConnectorRoutes } from "../src/routes/v1/connectors-email.js";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ACTION_ID = "44444444-4444-4444-8444-444444444444";

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
      EMAIL_CONNECTOR_PROVIDER: "generic",
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
  await app.register(emailConnectorRoutes, { prefix: "/connectors/email" });
  await app.ready();
  return app;
}

describe("POST /connectors/email/draft/send", () => {
  it("persists outbound draft and mirrors it into documents", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO email_outbound_drafts")) {
        return [{ id: "draft-1" }];
      }
      if (sql.includes("INSERT INTO documents")) {
        return [{ id: "doc-1" }];
      }
      return [];
    });

    const db = {
      queryTenant,
      tx: vi.fn(),
    } as unknown as Db;

    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/draft/send",
      payload: {
        projectId: PROJECT_ID,
        actionId: ACTION_ID,
        to: "stakeholders@example.com",
        subject: "Q2 Launch update",
        body: "Draft body",
        sendNow: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      draftId: "draft-1",
      state: "draft",
    });

    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("INSERT INTO email_outbound_drafts"),
      expect.any(Array)
    );
    expect(queryTenant).toHaveBeenCalledWith(
      TENANT_ID,
      expect.stringContaining("INSERT INTO documents"),
      expect.any(Array)
    );
  });
});
