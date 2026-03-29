import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import Fastify from "fastify";
import type { Db } from "@larry/db";
import type { QueuePublisher } from "../src/services/queue.js";
import { writeAuditLog } from "../src/lib/audit.js";
import { ingestRoutes } from "../src/routes/v1/ingest.js";

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
  queue: QueuePublisher;
}) {
  const app = Fastify({ logger: false });

  app.decorate("db", params.db);
  app.decorate("queue", params.queue);
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

  await app.register(ingestRoutes, { prefix: "/ingest" });
  await app.ready();
  return app;
}

describe("POST /ingest/transcript", () => {
  it("creates the meeting note before canonical ingestion and queues the background job after commit", async () => {
    let committed = false;
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO meeting_notes")) {
        return { rows: [{ id: MEETING_NOTE_ID }] };
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
      tx: vi.fn(async (fn: (client: { query: typeof query }) => Promise<unknown>) => {
        const result = await fn({ query });
        committed = true;
        return result;
      }),
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db;
    const queue = {
      publish: vi.fn(async () => {
        expect(committed).toBe(true);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueuePublisher;

    const app = await createTestApp({ db, queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/ingest/transcript",
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
      meetingNoteId: MEETING_NOTE_ID,
    });

    const meetingInsertIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("INSERT INTO meeting_notes")
    );
    const canonicalInsertIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes("INSERT INTO canonical_events")
    );
    expect(meetingInsertIndex).toBeGreaterThanOrEqual(0);
    expect(canonicalInsertIndex).toBeGreaterThan(meetingInsertIndex);

    const rawInsertCall = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO raw_events")
    );
    const payload = JSON.parse(String(rawInsertCall?.[1]?.[3] ?? "{}"));
    expect(payload).toMatchObject({
      channel: "zoom",
      transcript: "Weekly transcript with enough detail to trigger the queued worker flow.",
      meetingTitle: "Weekly sync",
      projectId: PROJECT_ID,
      meetingNoteId: MEETING_NOTE_ID,
      submittedByUserId: USER_ID,
    });

    expect(queue.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "canonical_event.created",
        tenantId: TENANT_ID,
        payload: expect.objectContaining({
          canonicalEventId: body.canonicalEventId,
          source: "transcript",
        }),
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "ingest.transcript",
        objectId: MEETING_NOTE_ID,
      })
    );
  });
});
