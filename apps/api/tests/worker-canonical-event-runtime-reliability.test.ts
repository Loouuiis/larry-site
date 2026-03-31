import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  queryTenant: vi.fn(),
  tx: vi.fn(),
}));

vi.mock("../../worker/src/context.js", () => ({
  db: { queryTenant: contextMocks.queryTenant, tx: contextMocks.tx },
  env: { MODEL_PROVIDER: "mock" },
}));

vi.mock("../../worker/src/canonical-event.js", () => ({
  handleCanonicalEventCreated: vi.fn(),
}));

vi.mock("../../worker/src/escalation.js", () => ({
  runEscalationScan: vi.fn(),
}));

vi.mock("../../worker/src/calendar-renewal.js", () => ({
  runCalendarWebhookRenewal: vi.fn(),
}));

vi.mock("../../worker/src/larry-scan.js", () => ({
  runLarryScan: vi.fn(),
}));

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    finalizeCanonicalEventProcessingAttempt: vi.fn(),
    startCanonicalEventProcessingAttempt: vi.fn(),
  };
});

import {
  finalizeCanonicalEventProcessingAttempt,
  startCanonicalEventProcessingAttempt,
} from "@larry/db";
import { handleCanonicalEventCreated } from "../../worker/src/canonical-event.js";
import { processQueueJob } from "../../worker/src/handlers.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const CANONICAL_EVENT_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.clearAllMocks();
  contextMocks.queryTenant.mockReset();
  contextMocks.tx.mockReset();
});

function createCanonicalEventJob(input: {
  canonicalEventId?: string;
  source?: string;
  attemptsMade?: number;
  maxAttempts?: number;
}) {
  const payload: Record<string, unknown> = {};
  if (input.canonicalEventId) payload.canonicalEventId = input.canonicalEventId;
  if (input.source) payload.source = input.source;

  return {
    id: "job-1",
    name: "canonical_event.created",
    attemptsMade: input.attemptsMade ?? 0,
    opts: { attempts: input.maxAttempts ?? 5 },
    data: {
      type: "canonical_event.created",
      tenantId: TENANT_ID,
      payload,
    },
  };
}

describe("Worker canonical_event runtime reliability tracking", () => {
  it("writes running->succeeded attempt lifecycle for successful canonical event jobs", async () => {
    vi.mocked(startCanonicalEventProcessingAttempt).mockResolvedValue({
      id: "attempt-1",
      canonicalEventId: CANONICAL_EVENT_ID,
      source: "slack",
      status: "running",
      attemptNumber: 1,
      maxAttempts: 5,
      queueJobId: "job-1",
      queueJobName: "canonical_event.created",
      startedAt: "2026-03-31T11:00:00.000Z",
    });
    vi.mocked(handleCanonicalEventCreated).mockResolvedValue(undefined);
    vi.mocked(finalizeCanonicalEventProcessingAttempt).mockResolvedValue(undefined);

    await processQueueJob(
      createCanonicalEventJob({
        canonicalEventId: CANONICAL_EVENT_ID,
        source: "slack",
        attemptsMade: 0,
        maxAttempts: 5,
      }) as never
    );

    expect(startCanonicalEventProcessingAttempt).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      {
        canonicalEventId: CANONICAL_EVENT_ID,
        source: "slack",
        attemptNumber: 1,
        maxAttempts: 5,
        queueJobId: "job-1",
        queueJobName: "canonical_event.created",
      }
    );
    expect(finalizeCanonicalEventProcessingAttempt).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      {
        attemptId: "attempt-1",
        status: "succeeded",
      }
    );
  });

  it("writes retryable_failed status and rethrows when attempts remain", async () => {
    const workerError = new Error("temporary upstream outage");
    vi.mocked(startCanonicalEventProcessingAttempt).mockResolvedValue({
      id: "attempt-2",
      canonicalEventId: CANONICAL_EVENT_ID,
      source: "email",
      status: "running",
      attemptNumber: 2,
      maxAttempts: 5,
      queueJobId: "job-1",
      queueJobName: "canonical_event.created",
      startedAt: "2026-03-31T11:05:00.000Z",
    });
    vi.mocked(handleCanonicalEventCreated).mockRejectedValue(workerError);
    vi.mocked(finalizeCanonicalEventProcessingAttempt).mockResolvedValue(undefined);

    await expect(
      processQueueJob(
        createCanonicalEventJob({
          canonicalEventId: CANONICAL_EVENT_ID,
          source: "email",
          attemptsMade: 1,
          maxAttempts: 5,
        }) as never
      )
    ).rejects.toThrow("temporary upstream outage");

    expect(finalizeCanonicalEventProcessingAttempt).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        attemptId: "attempt-2",
        status: "retryable_failed",
        errorMessage: "temporary upstream outage",
      })
    );
  });

  it("writes dead_lettered status on terminal failure and rethrows", async () => {
    const workerError = new Error("final attempt failed");
    vi.mocked(startCanonicalEventProcessingAttempt).mockResolvedValue({
      id: "attempt-3",
      canonicalEventId: CANONICAL_EVENT_ID,
      source: "transcript",
      status: "running",
      attemptNumber: 5,
      maxAttempts: 5,
      queueJobId: "job-1",
      queueJobName: "canonical_event.created",
      startedAt: "2026-03-31T11:10:00.000Z",
    });
    vi.mocked(handleCanonicalEventCreated).mockRejectedValue(workerError);
    vi.mocked(finalizeCanonicalEventProcessingAttempt).mockResolvedValue(undefined);

    await expect(
      processQueueJob(
        createCanonicalEventJob({
          canonicalEventId: CANONICAL_EVENT_ID,
          source: "transcript",
          attemptsMade: 4,
          maxAttempts: 5,
        }) as never
      )
    ).rejects.toThrow("final attempt failed");

    expect(finalizeCanonicalEventProcessingAttempt).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({
        attemptId: "attempt-3",
        status: "dead_lettered",
        errorMessage: "final attempt failed",
      })
    );
  });
});
