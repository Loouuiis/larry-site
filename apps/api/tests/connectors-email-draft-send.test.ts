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

  it("returns 502 with structured error and keeps draft editable when Resend rejects the domain (issue #84)", async () => {
    const draftInsertCalls: unknown[][] = [];
    const queryTenant = vi.fn(async (_tenantId: string, sql: string, params: unknown[]) => {
      if (sql.includes("INSERT INTO email_outbound_drafts")) {
        draftInsertCalls.push(params);
        return [{ id: "draft-3" }];
      }
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

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/draft/send",
      payload: {
        projectId: PROJECT_ID,
        to: "recipient@example.com",
        subject: "Regression: non-ok must surface error",
        body: "Body",
        sendNow: true,
      },
    });

    expect(response.statusCode).toBe(502);
    const json = response.json();
    expect(json).toMatchObject({
      success: false,
      draftId: "draft-3",
      state: "draft",
      errorCode: "domain_not_verified",
    });
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);

    // Draft persisted with state='draft' so the user can retry
    expect(draftInsertCalls.length).toBe(1);
    const draftParams = draftInsertCalls[0];
    // params[7] is the state column per the INSERT VALUES clause
    expect(draftParams[7]).toBe("draft");

    fetchSpy.mockRestore();
  });

  it("returns 502 with gmail_send_failed when Gmail throws and Resend is unconfigured", async () => {
    const queryTenant = vi.fn(async (_tenantId: string, sql: string) => {
      if (sql.includes("INSERT INTO email_outbound_drafts")) return [{ id: "draft-4" }];
      if (sql.includes("INSERT INTO documents")) return [{ id: "doc-4" }];
      if (sql.includes("FROM email_connector_installations")) {
        return [
          {
            tenant_id: TENANT_ID,
            account_email: "pm@example.com",
            access_token_enc: "enc",
            refresh_token_enc: "enc",
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          },
        ];
      }
      return [];
    });
    const db = { queryTenant, tx: vi.fn() } as unknown as Db;
    const queue = {
      publish: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const app = Fastify({ logger: false });
    app.decorate("db", db);
    app.decorate("queue", queue);
    app.decorate(
      "config",
      {
        MODEL_PROVIDER: "mock",
        EMAIL_CONNECTOR_PROVIDER: "gmail",
        RESEND_API_KEY: "",
        RESEND_FROM_LARRY: "Larry <larry@larry-pm.com>",
        RESEND_FROM_NOREPLY: "Larry <noreply@larry-pm.com>",
        GOOGLE_CLIENT_ID: "gid",
        GOOGLE_CLIENT_SECRET: "gsecret",
        GOOGLE_REDIRECT_URI: "https://example.com/cb",
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
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/connectors/email/draft/send",
      payload: {
        to: "recipient@example.com",
        subject: "Gmail failure",
        body: "Body",
        sendNow: true,
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      success: false,
      state: "draft",
      errorCode: expect.stringMatching(/^(gmail_send_failed|no_provider_configured)$/),
    });
  });
});
