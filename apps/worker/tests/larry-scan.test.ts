import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  queryTenant: vi.fn(),
  tx: vi.fn(),
}));

vi.mock("../src/context.js", () => ({
  db: { queryTenant: contextMocks.queryTenant, tx: contextMocks.tx },
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
        sourceKind: "schedule",
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
        sourceKind: "schedule",
        sourceRecordId: expect.stringMatching(UUID_REGEX),
      }
    );
  });
});
