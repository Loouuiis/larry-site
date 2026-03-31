import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    executeAction: vi.fn(),
    getCanonicalEventRuntimeEntryById: vi.fn(),
    getCanonicalEventRuntimeSummary: vi.fn(),
    getPendingSuggestionTexts: vi.fn(),
    getProjectSnapshot: vi.fn(),
    insertProjectMemoryEntry: vi.fn(),
    listCanonicalEventRetryCandidates: vi.fn(),
    listCanonicalEventRuntimeEntries: vi.fn(),
    listProjectMemoryEntries: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

vi.mock("../src/lib/audit.js", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/project-memberships.js", () => ({
  getProjectMembershipAccess: vi.fn().mockResolvedValue({
    projectExists: true,
    projectRole: "owner",
    canRead: true,
    canManage: true,
  }),
}));

import Fastify from "fastify";
import sensible from "@fastify/sensible";
import type { ApiEnv } from "@larry/config";
import type { Db } from "@larry/db";
import {
  getCanonicalEventRuntimeEntryById,
  getCanonicalEventRuntimeSummary,
  listCanonicalEventRetryCandidates,
  listCanonicalEventRuntimeEntries,
} from "@larry/db";
import type { QueuePublisher } from "../src/services/queue.js";
import { writeAuditLog } from "../src/lib/audit.js";
import { larryRoutes } from "../src/routes/v1/larry.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CANONICAL_EVENT_ID = "33333333-3333-4333-8333-333333333333";

const appsToClose: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  while (appsToClose.length > 0) {
    const app = appsToClose.pop();
    if (app) await app.close();
  }
});

function createQueueMock(): QueuePublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueuePublisher;
}

async function createTestApp(params?: {
  role?: "admin" | "pm" | "member";
  queue?: QueuePublisher;
}) {
  const app = Fastify({ logger: false });

  app.decorate(
    "db",
    {
      queryTenant: vi.fn().mockResolvedValue([]),
    } as unknown as Db
  );
  app.decorate(
    "queue",
    (params?.queue ?? createQueueMock()) as QueuePublisher
  );
  app.decorate(
    "config",
    {
      MODEL_PROVIDER: "mock",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    } as unknown as ApiEnv
  );
  app.decorate(
    "authenticate",
    async (request: Parameters<(typeof app)["authenticate"]>[0]) => {
      (
        request as typeof request & {
          user: {
            tenantId: string;
            userId: string;
            role: "admin" | "pm" | "member";
            email: string;
          };
        }
      ).user = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: params?.role ?? "pm",
        email: "pm@example.com",
      };
    }
  );
  app.decorate("requireRole", (allowed: string[]) => async (request) => {
    if (!allowed.includes(request.user.role)) {
      throw app.httpErrors.forbidden("Insufficient role.");
    }
  });

  await app.register(sensible);
  await app.register(larryRoutes, { prefix: "/larry" });
  await app.ready();
  return app;
}

describe("Larry runtime reliability routes", () => {
  it("lists canonical runtime entries with filters and summary", async () => {
    vi.mocked(listCanonicalEventRuntimeEntries).mockResolvedValue([
      {
        canonicalEventId: CANONICAL_EVENT_ID,
        source: "slack",
        eventType: "other",
        actor: "pm@example.com",
        occurredAt: "2026-03-31T10:00:00.000Z",
        canonicalCreatedAt: "2026-03-31T10:00:01.000Z",
        rawEventId: "44444444-4444-4444-8444-444444444444",
        idempotencyKey: "idem-1",
        canonicalSiblingCount: 2,
        latestAttemptId: "55555555-5555-4555-8555-555555555555",
        latestStatus: "retryable_failed",
        latestAttemptNumber: 2,
        latestMaxAttempts: 5,
        latestQueueJobId: "job-1",
        latestQueueJobName: "canonical_event.created",
        latestErrorMessage: "Redis reset",
        latestStartedAt: "2026-03-31T10:00:01.000Z",
        latestFinishedAt: "2026-03-31T10:00:02.000Z",
        latestDurationMs: 1000,
        latestUpdatedAt: "2026-03-31T10:00:02.000Z",
      },
    ]);
    vi.mocked(getCanonicalEventRuntimeSummary).mockResolvedValue({
      runningCount: 0,
      succeededCount: 3,
      retryableFailedCount: 1,
      deadLetteredCount: 2,
      unprocessedCount: 4,
    });

    const app = await createTestApp();
    appsToClose.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/larry/runtime/canonical-events?status=retryable_failed&source=slack&limit=10",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          canonicalEventId: CANONICAL_EVENT_ID,
          idempotencyKey: "idem-1",
          canonicalSiblingCount: 2,
          latestStatus: "retryable_failed",
        },
      ],
      summary: {
        retryableFailedCount: 1,
        deadLetteredCount: 2,
      },
      filters: {
        status: "retryable_failed",
        source: "slack",
        limit: 10,
      },
    });
    expect(listCanonicalEventRuntimeEntries).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      {
        status: "retryable_failed",
        source: "slack",
        limit: 10,
      }
    );
    expect(getCanonicalEventRuntimeSummary).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      { source: "slack" }
    );
  });

  it("enforces admin|pm role on runtime reliability routes", async () => {
    const app = await createTestApp({ role: "member" });
    appsToClose.push(app);

    const [listResponse, singleRetryResponse, bulkRetryResponse] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/larry/runtime/canonical-events",
      }),
      app.inject({
        method: "POST",
        url: `/larry/runtime/canonical-events/${CANONICAL_EVENT_ID}/retry`,
        payload: { reason: "retry" },
      }),
      app.inject({
        method: "POST",
        url: "/larry/runtime/canonical-events/retry-bulk",
        payload: { execute: false },
      }),
    ]);

    expect(listResponse.statusCode).toBe(403);
    expect(singleRetryResponse.statusCode).toBe(403);
    expect(bulkRetryResponse.statusCode).toBe(403);
  });

  it("queues a replay-safe single retry for retryable canonical events", async () => {
    const queue = createQueueMock();
    vi.mocked(getCanonicalEventRuntimeEntryById).mockResolvedValue({
      canonicalEventId: CANONICAL_EVENT_ID,
      source: "slack",
      eventType: "other",
      actor: "pm@example.com",
      occurredAt: "2026-03-31T10:00:00.000Z",
      canonicalCreatedAt: "2026-03-31T10:00:01.000Z",
      rawEventId: null,
      idempotencyKey: "idem-1",
      canonicalSiblingCount: 1,
      latestAttemptId: "66666666-6666-4666-8666-666666666666",
      latestStatus: "retryable_failed",
      latestAttemptNumber: 2,
      latestMaxAttempts: 5,
      latestQueueJobId: "job-1",
      latestQueueJobName: "canonical_event.created",
      latestErrorMessage: "Redis reset",
      latestStartedAt: "2026-03-31T10:00:01.000Z",
      latestFinishedAt: "2026-03-31T10:00:02.000Z",
      latestDurationMs: 1000,
      latestUpdatedAt: "2026-03-31T10:00:02.000Z",
    });

    const app = await createTestApp({ queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/runtime/canonical-events/${CANONICAL_EVENT_ID}/retry`,
      payload: { reason: "manual recovery" },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body).toMatchObject({
      queued: true,
      canonicalEventId: CANONICAL_EVENT_ID,
      previousStatus: "retryable_failed",
    });
    expect(body.dedupeKey).toContain(`runtime-retry:${CANONICAL_EVENT_ID}:`);
    expect(queue.publish).toHaveBeenCalledWith({
      type: "canonical_event.created",
      tenantId: TENANT_ID,
      dedupeKey: expect.stringContaining(`runtime-retry:${CANONICAL_EVENT_ID}:`),
      payload: {
        canonicalEventId: CANONICAL_EVENT_ID,
        source: "slack",
        eventType: "other",
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorUserId: USER_ID,
        actionType: "larry.runtime.canonical_event.retry",
        objectId: CANONICAL_EVENT_ID,
        details: expect.objectContaining({
          reason: "manual recovery",
          previousStatus: "retryable_failed",
        }),
      })
    );
  });

  it("rejects single retries when the latest status is running", async () => {
    vi.mocked(getCanonicalEventRuntimeEntryById).mockResolvedValue({
      canonicalEventId: CANONICAL_EVENT_ID,
      source: "slack",
      eventType: "other",
      actor: "pm@example.com",
      occurredAt: "2026-03-31T10:00:00.000Z",
      canonicalCreatedAt: "2026-03-31T10:00:01.000Z",
      rawEventId: null,
      idempotencyKey: "idem-1",
      canonicalSiblingCount: 1,
      latestAttemptId: "66666666-6666-4666-8666-666666666666",
      latestStatus: "running",
      latestAttemptNumber: 1,
      latestMaxAttempts: 5,
      latestQueueJobId: "job-1",
      latestQueueJobName: "canonical_event.created",
      latestErrorMessage: null,
      latestStartedAt: "2026-03-31T10:00:01.000Z",
      latestFinishedAt: null,
      latestDurationMs: null,
      latestUpdatedAt: "2026-03-31T10:00:01.000Z",
    });

    const queue = createQueueMock();
    const app = await createTestApp({ queue });
    appsToClose.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/larry/runtime/canonical-events/${CANONICAL_EVENT_ID}/retry`,
    });

    expect(response.statusCode).toBe(409);
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it("supports bounded bulk retry preview and execute modes", async () => {
    const queue = createQueueMock();
    vi.mocked(listCanonicalEventRetryCandidates)
      .mockResolvedValueOnce([
        {
          canonicalEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          source: "slack",
          eventType: "other",
          latestStatus: "retryable_failed",
          latestAttemptNumber: 2,
          latestMaxAttempts: 5,
        },
        {
          canonicalEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          source: "transcript",
          eventType: "other",
          latestStatus: "dead_lettered",
          latestAttemptNumber: 5,
          latestMaxAttempts: 5,
        },
      ])
      .mockResolvedValueOnce([
        {
          canonicalEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          source: "slack",
          eventType: "other",
          latestStatus: "retryable_failed",
          latestAttemptNumber: 2,
          latestMaxAttempts: 5,
        },
        {
          canonicalEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          source: "transcript",
          eventType: "other",
          latestStatus: "dead_lettered",
          latestAttemptNumber: 5,
          latestMaxAttempts: 5,
        },
      ]);

    const app = await createTestApp({ queue });
    appsToClose.push(app);

    const previewResponse = await app.inject({
      method: "POST",
      url: "/larry/runtime/canonical-events/retry-bulk",
      payload: {
        status: "all",
        source: "slack",
        limit: 25,
        execute: false,
      },
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toMatchObject({
      dryRun: true,
      candidateCount: 2,
      filters: {
        status: "all",
        source: "slack",
        limit: 25,
      },
    });
    expect(queue.publish).not.toHaveBeenCalled();

    const executeResponse = await app.inject({
      method: "POST",
      url: "/larry/runtime/canonical-events/retry-bulk",
      payload: {
        status: "all",
        limit: 25,
        execute: true,
        reason: "replay after outage",
      },
    });

    expect(executeResponse.statusCode).toBe(202);
    expect(executeResponse.json()).toMatchObject({
      dryRun: false,
      candidateCount: 2,
      queuedCount: 2,
      skippedCount: 0,
      filters: {
        status: "all",
        source: null,
        limit: 25,
      },
    });
    expect(queue.publish).toHaveBeenCalledTimes(2);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: "larry.runtime.canonical_event.retry_bulk",
        details: expect.objectContaining({
          reason: "replay after outage",
          candidateCount: 2,
          queuedCount: 2,
          skippedCount: 0,
        }),
      })
    );
  });
});
