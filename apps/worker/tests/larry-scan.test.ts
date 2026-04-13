import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  queryTenant: vi.fn(),
  tx: vi.fn(),
  query: vi.fn(),
}));

vi.mock("../src/context.js", () => ({
  db: {
    queryTenant: contextMocks.queryTenant,
    tx: contextMocks.tx,
    query: contextMocks.query,
  },
  env: { MODEL_PROVIDER: "mock" },
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
    runAutoActions: vi.fn(),
    storeSuggestions: vi.fn(),
  };
});

import { runIntelligence } from "@larry/ai";
import { getProjectSnapshot, runAutoActions, storeSuggestions } from "@larry/db";
import { runLarryScan } from "../src/larry-scan.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.clearAllMocks();
  contextMocks.queryTenant.mockReset();
  contextMocks.tx.mockReset();
  contextMocks.query.mockReset();
});

describe("runLarryScan", () => {
  it("keeps the scheduled scan provenance when writing non-chat Larry events", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT p.id")) {
        return { rows: [{ id: PROJECT_ID, tenant_id: TENANT_ID }] };
      }
      return { rows: [] };
    });
    contextMocks.tx.mockImplementation(async (fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
      fn({ query: clientQuery })
    );

    vi.mocked(getProjectSnapshot).mockResolvedValue({
      project: {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        name: "Launch",
        description: null,
        status: "active",
        riskScore: 10,
        riskLevel: "low",
        startDate: null,
        targetDate: null,
      },
      tasks: [],
      team: [],
      recentActivity: [],
      signals: [],
      generatedAt: "2026-03-29T10:00:00.000Z",
    });
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "The project is stable.",
      autoActions: [],
      suggestedActions: [],
    });
    vi.mocked(runAutoActions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });
    vi.mocked(storeSuggestions).mockResolvedValue({
      executedCount: 0,
      suggestedCount: 0,
      eventIds: [],
    });

    await runLarryScan();

    expect(runAutoActions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "schedule",
      [],
      undefined,
      {
        sourceKind: "project_review",
        sourceRecordId: expect.stringMatching(UUID_REGEX),
      }
    );
    expect(storeSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      PROJECT_ID,
      "schedule",
      [],
      undefined,
      {
        sourceKind: "project_review",
        sourceRecordId: expect.stringMatching(UUID_REGEX),
      }
    );
  });

  // QA-2026-04-12 §15: scan reported `lastRunFailed: 5, lastRunError:
  // null`. Per-project failures were caught + logged but never threaded
  // into the heartbeat row, so the operations dashboard had no signal
  // about why items failed. The fix collects the first error message
  // (truncated, with a "(+N more)" suffix when multiple fail) and writes
  // it as `last_run_error` on the system_job_runs row.
  it("captures per-project failures into last_run_error so silent failures are visible", async () => {
    const PROJECT_ID_GOOD = "44444444-4444-4444-8444-444444444444";
    const PROJECT_ID_BAD_1 = "55555555-5555-4555-8555-555555555555";
    const PROJECT_ID_BAD_2 = "66666666-6666-4666-8666-666666666666";

    const clientQuery = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT p.id")) {
        return {
          rows: [
            { id: PROJECT_ID_GOOD, tenant_id: TENANT_ID },
            { id: PROJECT_ID_BAD_1, tenant_id: TENANT_ID },
            { id: PROJECT_ID_BAD_2, tenant_id: TENANT_ID },
          ],
        };
      }
      return { rows: [] };
    });
    contextMocks.tx.mockImplementation(async (fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
      fn({ query: clientQuery })
    );

    vi.mocked(getProjectSnapshot).mockImplementation(async (_db, _tenant, projectId) => {
      if (projectId === PROJECT_ID_BAD_1) {
        throw new Error("Snapshot load failed for project 1: connection reset");
      }
      if (projectId === PROJECT_ID_BAD_2) {
        throw new Error("Snapshot load failed for project 2: timeout");
      }
      return {
        project: {
          id: projectId,
          tenantId: TENANT_ID,
          name: "Healthy",
          description: null,
          status: "active",
          riskScore: 10,
          riskLevel: "low",
          startDate: null,
          targetDate: null,
        },
        tasks: [],
        team: [],
        recentActivity: [],
        signals: [],
        generatedAt: "2026-04-12T20:00:00.000Z",
      };
    });
    vi.mocked(runIntelligence).mockResolvedValue({
      briefing: "stable",
      autoActions: [],
      suggestedActions: [],
    });
    vi.mocked(runAutoActions).mockResolvedValue({ executedCount: 0, suggestedCount: 0, eventIds: [] });
    vi.mocked(storeSuggestions).mockResolvedValue({ executedCount: 0, suggestedCount: 0, eventIds: [] });
    contextMocks.query.mockResolvedValue({ rows: [] });

    await runLarryScan();

    const heartbeatCall = contextMocks.query.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO system_job_runs")
    );
    expect(heartbeatCall).toBeDefined();
    const values = heartbeatCall?.[1] as unknown[] | undefined;
    expect(values).toBeDefined();
    // Schema: jobName, startedAt, finishedAt, durationMs, processed, failed, error
    expect(values?.[5]).toBe(2); // failed count
    const errorParam = values?.[6];
    expect(typeof errorParam).toBe("string");
    expect(errorParam).toMatch(/Snapshot load failed for project/i);
  });
});
