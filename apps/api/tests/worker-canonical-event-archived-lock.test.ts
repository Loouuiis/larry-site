import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  queryTenant: vi.fn(),
  tx: vi.fn(),
}));

vi.mock("../../worker/src/context.js", () => ({
  db: { queryTenant: contextMocks.queryTenant, tx: contextMocks.tx },
  env: { MODEL_PROVIDER: "mock" },
}));

vi.mock("../../worker/src/escalation.js", () => ({
  runEscalationScan: vi.fn(),
}));

vi.mock("../../worker/src/calendar-renewal.js", () => ({
  runCalendarWebhookRenewal: vi.fn(),
}));

vi.mock("@larry/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/ai")>();
  return { ...actual, runIntelligence: vi.fn() };
});

vi.mock("@larry/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@larry/db")>();
  return {
    ...actual,
    getProjectSnapshot: vi.fn(),
    insertProjectMemoryEntry: vi.fn(),
    listLarryEventIdsBySource: vi.fn(),
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

import { runIntelligence } from "@larry/ai";
import {
  getProjectSnapshot,
  insertProjectMemoryEntry,
  listLarryEventIdsBySource,
  runAutoActions,
  storeSuggestions,
} from "@larry/db";
import { processQueueJob } from "../../worker/src/handlers.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const CANONICAL_EVENT_ID = "33333333-3333-4333-8333-333333333333";
const MEETING_NOTE_ID = "44444444-4444-4444-8444-444444444444";

afterEach(() => {
  vi.clearAllMocks();
  contextMocks.queryTenant.mockReset();
  contextMocks.tx.mockReset();
});

function createCanonicalEventJob(payload: Record<string, unknown>) {
  return {
    name: "canonical_event.created",
    data: {
      type: "canonical_event.created",
      tenantId: TENANT_ID,
      payload,
    },
  };
}

describe("Worker canonical_event archived-project write lock", () => {
  it("skips email-source action/memory writes for archived projects", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: CANONICAL_EVENT_ID,
          source: "email",
          payload: {
            projectId: PROJECT_ID,
            from: "ops@example.com",
            subject: "Archived project email signal",
            bodyText: "Should be skipped for archived project writes.",
          },
        },
      ])
      .mockResolvedValueOnce([{ status: "archived" }]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never);

    expect(runIntelligence).not.toHaveBeenCalled();
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(listLarryEventIdsBySource).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();
  });

  it("skips transcript action/memory writes for archived projects and reconciles meeting note count", async () => {
    contextMocks.queryTenant
      .mockResolvedValueOnce([
        {
          id: CANONICAL_EVENT_ID,
          source: "transcript",
          payload: {
            transcript: "Transcript body with enough detail to pass validation.",
            meetingNoteId: MEETING_NOTE_ID,
            projectId: PROJECT_ID,
          },
        },
      ])
      .mockResolvedValueOnce([{ id: MEETING_NOTE_ID, project_id: PROJECT_ID }])
      .mockResolvedValueOnce([{ status: "archived" }])
      .mockResolvedValueOnce([]);
    vi.mocked(listLarryEventIdsBySource).mockResolvedValueOnce([]);

    await processQueueJob(createCanonicalEventJob({ canonicalEventId: CANONICAL_EVENT_ID }) as never);

    expect(runIntelligence).not.toHaveBeenCalled();
    expect(getProjectSnapshot).not.toHaveBeenCalled();
    expect(runAutoActions).not.toHaveBeenCalled();
    expect(storeSuggestions).not.toHaveBeenCalled();
    expect(insertProjectMemoryEntry).not.toHaveBeenCalled();

    const reconcileCall = contextMocks.queryTenant.mock.calls.find(([, sql]) =>
      String(sql).includes("UPDATE meeting_notes")
    );
    expect(reconcileCall?.[2]).toEqual([
      TENANT_ID,
      MEETING_NOTE_ID,
      PROJECT_ID,
      null,
      0,
    ]);
  });
});
