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
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_LARRY: "Larry <larry@larry-pm.com>",
      RESEND_FROM_NOREPLY: "Larry <noreply@larry-pm.com>",
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

  it("sends via Resend using the configured RESEND_FROM_LARRY address (regression: no hardcoded sender)", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO email_outbound_drafts")) return [{ id: "draft-2" }];
      if (sql.includes("INSERT INTO documents")) return [{ id: "doc-2" }];
      return [];
    });
    const db = { queryTenant, tx: vi.fn() } as unknown as Db;
    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "resend-1" }), { status: 200 }));

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/draft/send",
      payload: {
        projectId: PROJECT_ID,
        actionId: ACTION_ID,
        to: "recipient@example.com",
        subject: "Regression: sender address",
        body: "Body",
        sendNow: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, state: "sent" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
    const sentPayload = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string
    );
    expect(sentPayload.from).toBe("Larry <larry@larry-pm.com>");
    expect(sentPayload.from).not.toMatch(/larry\.app/);
    expect(sentPayload.to).toEqual(["recipient@example.com"]);
    expect(sentPayload.subject).toBe("Regression: sender address");

    fetchSpy.mockRestore();
  });

  it("logs a warning when Resend responds non-ok (regression: no silent 403 swallow)", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO email_outbound_drafts")) return [{ id: "draft-3" }];
      if (sql.includes("INSERT INTO documents")) return [{ id: "doc-3" }];
      return [];
    });
    const db = { queryTenant, tx: vi.fn() } as unknown as Db;
    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ statusCode: 403, message: "domain not verified" }),
          { status: 403 }
        )
      );

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);
    const warnSpy = vi.spyOn(app.log, "warn");

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/draft/send",
      payload: {
        projectId: PROJECT_ID,
        to: "recipient@example.com",
        subject: "Regression: non-ok must warn",
        body: "Body",
        sendNow: true,
      },
    });

    expect(response.statusCode).toBe(200); // draft still saved
    const warnCalls = warnSpy.mock.calls.map((c) => JSON.stringify(c));
    expect(warnCalls.some((c) => c.includes("Resend email delivery failed"))).toBe(true);

    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
