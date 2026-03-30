import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    getProjectSnapshot: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

vi.mock("../src/services/ingest/pipeline.js", () => ({
  ingestCanonicalEvent: vi.fn(),
  insertCanonicalEventRecords: vi.fn(),
  publishCanonicalEventCreated: vi.fn(),
}));

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import { runIntelligence } from "@larry/ai";
import { getProjectSnapshot, runAutoActions, storeSuggestions } from "@larry/db";
import {
  insertCanonicalEventRecords,
  publishCanonicalEventCreated,
} from "../src/services/ingest/pipeline.js";
import { writeAuditLog } from "../src/lib/audit.js";
import { ingestRoutes } from "../src/routes/v1/ingest.js";
import { larryRoutes } from "../src/routes/v1/larry.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const MEETING_NOTE_ID = "44444444-4444-4444-8444-444444444444";

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
}) {
  const app = Fastify({ logger: false });

  app.decorate("db", params.db);
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
  await app.register(larryRoutes, { prefix: "/v1/larry" });
  await app.register(ingestRoutes, { prefix: "/v1/ingest" });
  await app.ready();
  return app;
}

describe("POST /v1/ingest/transcript", () => {
  it("forwards to /v1/larry/transcript and returns deprecation metadata", async () => {
    const db = {
      queryTenant: vi.fn().mockResolvedValue([]),
      tx: vi.fn(async (fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
        const client = {
          query: vi.fn(async (sql: string) => {
            if (sql.includes("INSERT INTO meeting_notes")) {
              return { rows: [{ id: MEETING_NOTE_ID }] };
            }
            return { rows: [] };
          }),
        };
        return fn(client);
      }),
    } as unknown as Db;

    vi.mocked(insertCanonicalEventRecords).mockResolvedValue({
      canonicalEventId: "canon-event-1",
      idempotencyKey: "idem-1",
      source: "transcript",
      eventType: "commitment",
    });
    vi.mocked(publishCanonicalEventCreated).mockResolvedValue(undefined);

    const app = await createTestApp({ db });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/ingest/transcript",
      payload: {
        sourceEventId: "web-upload-1",
        transcript: "Weekly transcript with enough detail to trigger the queued worker flow.",
        projectId: PROJECT_ID,
        meetingTitle: "Weekly sync",
        payload: { channel: "zoom" },
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body).toMatchObject({
      accepted: true,
      canonicalEventId: "canon-event-1",
      idempotencyKey: "idem-1",
      meetingNoteId: MEETING_NOTE_ID,
      deprecatedEndpoint: "/v1/ingest/transcript",
      replacementEndpoint: "/v1/larry/transcript",
    });

    expect(response.headers["x-larry-deprecated-endpoint"]).toBe("/v1/ingest/transcript");
    expect(insertCanonicalEventRecords).toHaveBeenCalled();
    expect(publishCanonicalEventCreated).toHaveBeenCalled();
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runIntelligence).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "larry.transcript",
        objectId: MEETING_NOTE_ID,
      })
    );
  });
});
